/**
 * Web 平台出口：IndexedDB + WebAudio + SpeechSynthesis + localStorage + Blob/FileReader。
 *
 * 降级纪律（docs/02 §9.2）：
 * - IndexedDB 3 秒开不起来就退内存档（本会话仍能用，界面提示"这次可能没存上"）；
 * - 音频/语音/文件/生命周期任何一项不可用都只变安静，不阻塞交互；
 * - 只做设备级能力，不 import Vue / Phaser / 网络请求。
 */
import type {
  AudioBus,
  EvidenceAggregate,
  EvidenceEvent,
  EvidencePhase,
  EvidenceRecord,
  EvidenceStore,
  FileBus,
  LifecycleBus,
  Locale,
  PlatformServices,
  Preferences,
  ProgressStore,
  SaveData,
  Telemetry,
  ToolId,
} from '@mmf/game-kit';
import { EVIDENCE_PHASES, TOOL_IDS } from '@mmf/game-kit';

export const MMF_DB_NAME = 'mmf';
export const MMF_KV_STORE = 'kv';
export const SAVE_KEY = 'save:local-default';
export const EVIDENCE_KEY = 'evidence:local-default';
export const AGGREGATE_KEY = 'evagg:local-default';
export const MAX_EVIDENCE_EVENTS = 3000;
const OPEN_TIMEOUT_MS = 3000;

type SfxKey = Parameters<AudioBus['play']>[0];
type PreferenceKey = Parameters<Preferences['get']>[0];

// 工具与阶段的唯一事实来源在 content/ids，经 game-kit 再导出；平台不复制常量。
const EMPTY_BY_TOOL = {} as Record<ToolId, number>;
for (const toolId of TOOL_IDS) EMPTY_BY_TOOL[toolId] = 0;
const PHASE_SET = new Set<string>(EVIDENCE_PHASES);

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function emptyAggregate(): EvidenceAggregate {
  return {
    total: 0,
    byLevel: {},
    byTool: { ...EMPTY_BY_TOOL },
    byPhase: {},
    byFailure: {},
    lastAggregatedAt: 0,
  };
}

function isEvidenceEvent(value: unknown): value is EvidenceEvent {
  if (!isRecordObject(value)) return false;
  return value.v === 1 && typeof value.id === 'string' && typeof value.at === 'number';
}

function normalizeRecord(raw: unknown): EvidenceRecord | null {
  if (!isRecordObject(raw) || raw.version !== 1 || !Array.isArray(raw.events)) return null;
  const events = (raw.events as unknown[]).filter(isEvidenceEvent);
  return { version: 1, events };
}

function normalizeAggregate(raw: unknown): EvidenceAggregate | null {
  if (!isRecordObject(raw)) return null;
  const aggregate = emptyAggregate();
  aggregate.total = finiteInt(raw.total) ?? 0;
  aggregate.lastAggregatedAt = finiteInt(raw.lastAggregatedAt) ?? 0;

  if (isRecordObject(raw.byLevel)) {
    for (const [levelId, count] of Object.entries(raw.byLevel)) {
      const value = finiteInt(count);
      if (value !== null) aggregate.byLevel[levelId] = value;
    }
  }
  if (isRecordObject(raw.byTool)) {
    const tools = raw.byTool;
    for (const toolId of Object.keys(EMPTY_BY_TOOL) as ToolId[]) {
      const value = finiteInt(tools[toolId]);
      if (value !== null) aggregate.byTool[toolId] = value;
    }
  }
  if (isRecordObject(raw.byPhase)) {
    for (const [phase, count] of Object.entries(raw.byPhase)) {
      if (!PHASE_SET.has(phase)) continue;
      const value = finiteInt(count);
      if (value !== null) aggregate.byPhase[phase as EvidencePhase] = value;
    }
  }
  if (isRecordObject(raw.byFailure)) {
    for (const [failureClass, count] of Object.entries(raw.byFailure)) {
      const value = finiteInt(count);
      if (value !== null) aggregate.byFailure[failureClass] = value;
    }
  }
  return aggregate;
}

interface KvBackend {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'));
  });
}

/** kv 后端：IndexedDB 优先，读写失败或打不开时用内存副本兜底。 */
function createKvBackend(): KvBackend {
  const memory = new Map<string, unknown>();
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  function openDb(): Promise<IDBDatabase | null> {
    dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, OPEN_TIMEOUT_MS);
      const finish = (db: IDBDatabase | null): void => {
        if (settled) {
          db?.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(db);
      };
      try {
        const request = indexedDB.open(MMF_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(MMF_KV_STORE)) db.createObjectStore(MMF_KV_STORE);
        };
        request.onsuccess = () => finish(request.result);
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
    return dbPromise;
  }

  return {
    async read(key: string): Promise<unknown> {
      // 内存副本永远比 IndexedDB 新：本会话写过就以此为准，避免写盘失败后读回旧值。
      if (memory.has(key)) return memory.get(key);
      const db = await openDb();
      if (!db) return null;
      try {
        const tx = db.transaction(MMF_KV_STORE, 'readonly');
        const value = await requestAsPromise(tx.objectStore(MMF_KV_STORE).get(key));
        return value === undefined ? null : value;
      } catch {
        return null;
      }
    },

    async write(key: string, value: unknown): Promise<void> {
      memory.set(key, value);
      const db = await openDb();
      if (!db) return;
      try {
        const tx = db.transaction(MMF_KV_STORE, 'readwrite');
        tx.objectStore(MMF_KV_STORE).put(value, key);
        await transactionDone(tx);
      } catch {
        // 落盘失败时内存副本已生效：本会话继续可用。
      }
    },

    async remove(key: string): Promise<void> {
      memory.delete(key);
      const db = await openDb();
      if (!db) return;
      try {
        const tx = db.transaction(MMF_KV_STORE, 'readwrite');
        tx.objectStore(MMF_KV_STORE).delete(key);
        await transactionDone(tx);
      } catch {
        // 忽略：内存副本已删除。
      }
    },
  };
}

function createProgressStore(kv: KvBackend): ProgressStore {
  return {
    async load(): Promise<unknown> {
      return kv.read(SAVE_KEY);
    },
    async save(data: SaveData): Promise<void> {
      await kv.write(SAVE_KEY, data);
    },
  };
}

/** 按时间升序稳定排序：同 at 的事件保持写入顺序。 */
function sortByTime(events: EvidenceEvent[]): EvidenceEvent[] {
  return events.sort((a, b) => a.at - b.at);
}

/**
 * 把被裁掉的事件计数并入聚合（docs/02 §8.3、§8.4）：
 * 清理日志只影响能回看的明细，不影响历史计数，报告/徽章不会倒退。
 * 平台包不能依赖 evidence（依赖图见 docs/02 §3.1），所以这里保留一份最小实现。
 */
function accumulateAggregate(
  base: EvidenceAggregate,
  events: readonly EvidenceEvent[],
): EvidenceAggregate {
  const next: EvidenceAggregate = {
    total: base.total,
    byLevel: { ...base.byLevel },
    byTool: { ...base.byTool },
    byPhase: { ...base.byPhase },
    byFailure: { ...base.byFailure },
    lastAggregatedAt: base.lastAggregatedAt,
  };
  for (const event of events) {
    next.total += 1;
    if (typeof event.levelId === 'string' && event.levelId.length > 0) {
      next.byLevel[event.levelId] = (next.byLevel[event.levelId] ?? 0) + 1;
    }
    if (typeof event.tool === 'string' && event.tool.length > 0) {
      next.byTool[event.tool] = (next.byTool[event.tool] ?? 0) + 1;
    }
    if (typeof event.phase === 'string' && event.phase.length > 0) {
      next.byPhase[event.phase] = (next.byPhase[event.phase] ?? 0) + 1;
    }
    if (typeof event.failureClass === 'string' && event.failureClass.length > 0) {
      next.byFailure[event.failureClass] = (next.byFailure[event.failureClass] ?? 0) + 1;
    }
    if (Number.isFinite(event.at) && event.at > next.lastAggregatedAt) {
      next.lastAggregatedAt = Math.trunc(event.at);
    }
  }
  return next;
}

/** 证据库：append-only；裁剪到 3000 条；读写串行化，避免并发 append 丢更新。 */
function createEvidenceStore(kv: KvBackend): EvidenceStore {
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readRecord(): Promise<EvidenceRecord | null> {
    return normalizeRecord(await kv.read(EVIDENCE_KEY));
  }

  function readAggregate(): Promise<EvidenceAggregate> {
    return kv
      .read(AGGREGATE_KEY)
      .then((raw) => normalizeAggregate(raw) ?? emptyAggregate());
  }

  return {
    append(events: EvidenceEvent[]): Promise<void> {
      if (events.length === 0) return Promise.resolve();
      return enqueue(async () => {
        const record = await readRecord();
        const existing = record?.events ?? [];
        // id 判重：失败重试（外层会把批次回灌队列）不会把仍在记录里的同一事件写两遍。
        // 注意：已被裁剪掉的旧 id 不再留存，这里无法也没有必要再判重。
        const known = new Set(existing.map((event) => event.id));
        const fresh: EvidenceEvent[] = [];
        for (const event of events) {
          if (!isEvidenceEvent(event) || known.has(event.id)) continue;
          known.add(event.id);
          fresh.push(event);
        }
        if (fresh.length === 0) return;

        // 先按时间排好再裁剪，时钟抖动导致的乱序写入也不会把"最新"当"最旧"删掉。
        const merged = sortByTime([...existing, ...fresh]);
        const overflow = Math.max(0, merged.length - MAX_EVIDENCE_EVENTS);
        const removed = overflow > 0 ? merged.slice(0, overflow) : [];
        const kept = overflow > 0 ? merged.slice(-MAX_EVIDENCE_EVENTS) : merged;
        await kv.write(EVIDENCE_KEY, { version: 1, events: kept } satisfies EvidenceRecord);

        if (removed.length > 0) {
          // 先写明细再写聚合：万一中途掉电，最坏是丢计数，而不是重复计数。
          const aggregate = await readAggregate();
          await kv.write(AGGREGATE_KEY, accumulateAggregate(aggregate, removed));
        }
      });
    },

    recent(limit: number): Promise<EvidenceEvent[]> {
      const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
      if (cap === 0) return Promise.resolve([]);
      return enqueue(async () => {
        const record = await readRecord();
        const events = record?.events ?? [];
        // 兼容历史实现写入的乱序记录：按时间取最近 cap 条，最新在前。
        return sortByTime([...events]).slice(-cap).reverse();
      });
    },

    loadRecord(): Promise<EvidenceRecord | null> {
      return enqueue(readRecord);
    },

    loadAggregate(): Promise<EvidenceAggregate> {
      // 入队：等正在进行的 append/裁剪落定后再读，避免读到裁剪前的聚合。
      return enqueue(readAggregate);
    },

    saveAggregate(aggregate: EvidenceAggregate): Promise<void> {
      return enqueue(() => kv.write(AGGREGATE_KEY, aggregate));
    },

    clear(): Promise<void> {
      return enqueue(async () => {
        await kv.remove(EVIDENCE_KEY);
        await kv.remove(AGGREGATE_KEY);
      });
    },
  };
}

interface ToneStep {
  freq: number;
  durationMs: number;
  delayMs: number;
}

const SFX_PATTERNS: Record<SfxKey, readonly ToneStep[]> = {
  tap: [{ freq: 560, durationMs: 50, delayMs: 0 }],
  correct: [
    { freq: 660, durationMs: 90, delayMs: 0 },
    { freq: 880, durationMs: 140, delayMs: 80 },
  ],
  retry: [
    { freq: 320, durationMs: 120, delayMs: 0 },
    { freq: 250, durationMs: 160, delayMs: 110 },
  ],
  pop: [{ freq: 720, durationMs: 60, delayMs: 0 }],
  complete: [
    { freq: 523, durationMs: 110, delayMs: 0 },
    { freq: 659, durationMs: 110, delayMs: 110 },
    { freq: 784, durationMs: 220, delayMs: 220 },
  ],
  sparkle: [
    { freq: 988, durationMs: 60, delayMs: 0 },
    { freq: 1319, durationMs: 100, delayMs: 70 },
  ],
};

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function createAudioBus(preferences: Preferences): AudioBus {
  let muted = preferences.get('muted') === '1';
  let context: AudioContext | null = null;

  function audioContext(): AudioContext | null {
    if (muted || typeof window === 'undefined') return null;
    if (context === null) {
      const ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!ctor) return null;
      try {
        context = new ctor();
      } catch {
        context = null;
        return null;
      }
    }
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
    return context;
  }

  function scheduleTone(
    ctx: AudioContext,
    freq: number,
    durationMs: number,
    delayMs: number,
  ): void {
    const startAt = ctx.currentTime + Math.max(0, delayMs) / 1000;
    const endAt = startAt + Math.max(20, durationMs) / 1000;
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    } catch {
      // 音频不可用时保持静音，不阻塞交互。
    }
  }

  function tone(freq: number, durationMs: number): void {
    if (!Number.isFinite(freq) || !Number.isFinite(durationMs) || freq <= 0 || durationMs <= 0) {
      return;
    }
    const ctx = audioContext();
    if (!ctx) return;
    scheduleTone(ctx, freq, durationMs, 0);
  }

  function play(key: SfxKey): void {
    const pattern = SFX_PATTERNS[key];
    if (!pattern) return;
    const ctx = audioContext();
    if (!ctx) return;
    for (const step of pattern) scheduleTone(ctx, step.freq, step.durationMs, step.delayMs);
  }

  function stopSpeech(): void {
    const synth = typeof globalThis === 'undefined' ? undefined : globalThis.speechSynthesis;
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      // 某些 WebView 会抛，忽略。
    }
  }

  function speak(text: string, locale: Locale): Promise<void> {
    if (muted || typeof text !== 'string' || text.trim().length === 0) return Promise.resolve();
    const synth = typeof globalThis === 'undefined' ? undefined : globalThis.speechSynthesis;
    const Utterance =
      typeof globalThis === 'undefined' ? undefined : globalThis.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance === 'undefined') return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      // 语音不可用 / 被打断时必须 resolve，避免调用方永久等待。
      const timer = setTimeout(done, Math.min(30_000, Math.max(4_000, text.length * 220)));
      try {
        const utterance = new Utterance(text);
        utterance.lang = locale === 'en' ? 'en-US' : 'zh-CN';
        utterance.rate = 1;
        utterance.onend = done;
        utterance.onerror = done;
        synth.cancel();
        synth.speak(utterance);
      } catch {
        done();
      }
    });
  }

  function setMuted(next: boolean): void {
    muted = next === true;
    if (muted) stopSpeech();
  }

  return {
    play,
    tone,
    speak,
    stopSpeech,
    setMuted,
    isMuted: () => muted,
  };
}

const PREFERENCE_PREFIX = 'mmf:pref:';

function createPreferences(): Preferences {
  function storage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  return {
    get(key: PreferenceKey): string | null {
      try {
        return storage()?.getItem(PREFERENCE_PREFIX + key) ?? null;
      } catch {
        return null;
      }
    },

    set(key: PreferenceKey, value: string): void {
      try {
        storage()?.setItem(PREFERENCE_PREFIX + key, value);
      } catch {
        // 隐私模式 / 配额满：偏好失败不阻塞。
      }
    },
  };
}

function createFileBus(): FileBus {
  function download(name: string, mime: string, text: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    if (typeof URL.createObjectURL !== 'function') return;
    let url: string | null = null;
    try {
      const blob = new Blob([text], { type: mime });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      // 不支持导出的设备由界面提示；这里不抛。
    } finally {
      if (url !== null) {
        const target = url;
        setTimeout(() => {
          try {
            URL.revokeObjectURL(target);
          } catch {
            // 忽略。
          }
        }, 0);
      }
    }
  }

  function pickText(accept: string, maxBytes: number): Promise<string | null> {
    if (typeof document === 'undefined' || typeof FileReader === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';

      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(value);
      };

      input.addEventListener('change', () => {
        const file = input.files && input.files.length > 0 ? input.files[0] : null;
        if (!file) {
          finish(null);
          return;
        }
        if (Number.isFinite(maxBytes) && maxBytes > 0 && file.size > maxBytes) {
          finish(null);
          return;
        }
        try {
          const reader = new FileReader();
          reader.onload = () => {
            finish(typeof reader.result === 'string' ? reader.result : null);
          };
          reader.onerror = () => finish(null);
          reader.onabort = () => finish(null);
          reader.readAsText(file);
        } catch {
          finish(null);
        }
      });
      // 允许用户取消选择（新浏览器会派发 cancel）。
      input.addEventListener('cancel', () => finish(null));

      try {
        document.body.appendChild(input);
        input.click();
      } catch {
        finish(null);
      }
    });
  }

  return { download, pickText };
}

function createLifecycleBus(): LifecycleBus {
  const pauseListeners = new Set<() => void>();
  const resumeListeners = new Set<() => void>();

  function notify(listeners: Set<() => void>): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 单个监听器失败不影响其他监听器。
      }
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      notify(document.hidden ? pauseListeners : resumeListeners);
    });
  }

  function subscribe(listeners: Set<() => void>, callback: () => void): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  return {
    onPause: (callback) => subscribe(pauseListeners, callback),
    onResume: (callback) => subscribe(resumeListeners, callback),
  };
}

function createTelemetry(): Telemetry {
  return {
    // 本产品零联网：埋点只留本地调试占位，不采集、不上传。
    track: () => undefined,
    flush: async () => undefined,
  };
}

/** 唯一平台出口：存档、证据、音频、文件、偏好、生命周期、时钟。 */
export function createWebPlatform(): PlatformServices {
  const kv = createKvBackend();
  const preferences = createPreferences();
  return {
    storage: createProgressStore(kv),
    evidenceStore: createEvidenceStore(kv),
    audio: createAudioBus(preferences),
    files: createFileBus(),
    preferences,
    lifecycle: createLifecycleBus(),
    telemetry: createTelemetry(),
    now: () => Date.now(),
  };
}
