/**
 * 进度管理器：读档 single-flight、通关写入、证据事件补齐、清档。
 *
 * 时间全部来自注入的 clock()；这里不出现 Date.now / Math.random。
 * 存档不在这里做结构校验：迁移与 sanitize 全部交给 save.ts 的 migrate()。
 */
import type { EvidencePhase, LevelId, StampId, ToolId } from '@mmf/content/ids';
import { EVIDENCE_PHASES, LEVEL_IDS, STAMP_IDS, TOOL_IDS } from '@mmf/content/ids';
import type {
  BadgeId,
  EvidenceDraft,
  EvidenceEvent,
  EvidenceStore,
  JournalEntry,
  LevelProgress,
  ProgressStore,
  SaveData,
  ToolUsage,
} from '@mmf/game-kit';
import { evaluateBadges } from '@mmf/evidence';
import { LEVEL_SUMMARIES } from '@mmf/content';
import {
  MAX_EVIDENCE_EVENTS,
  MAX_JOURNAL_ENTRIES,
  PROFILE_ID,
  SAVE_SCHEMA_VERSION,
  emptyLevelProgress,
  emptySave,
  migrate,
  truncateChars,
} from './save';

export interface CompletionInput {
  levelId: LevelId;
  variantId: string;
  stamps: StampId[];
  failureClassesSeen: string[];
  revisionCount: number;
  toolIds: ToolId[];
  durationMs: number;
}

function cloneSave(save: SaveData): SaveData {
  return JSON.parse(JSON.stringify(save)) as SaveData;
}

function serialize(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** 迁移后的结构化存档若与原始读档不同（含首次读档），才需要回写。 */
function needsPersist(raw: unknown, next: SaveData): boolean {
  if (raw === null || raw === undefined) return true;
  const before = serialize(raw);
  return before === null || before !== serialize(next);
}

function sanitizeStamps(stamps: readonly StampId[]): StampId[] {
  const allowed = new Set<string>(STAMP_IDS);
  const out: StampId[] = [];
  for (const stamp of stamps) {
    if (typeof stamp !== 'string' || !allowed.has(stamp)) continue;
    if (!out.includes(stamp)) out.push(stamp);
  }
  return out;
}

function sanitizeTools(tools: readonly ToolId[]): ToolId[] {
  const allowed = new Set<string>(TOOL_IDS);
  const out: ToolId[] = [];
  for (const tool of tools) {
    if (typeof tool !== 'string' || !allowed.has(tool)) continue;
    if (!out.includes(tool)) out.push(tool);
  }
  return out;
}

function sanitizeFailureClasses(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0 && !out.includes(value)) out.push(value);
  }
  return out;
}

function sanitizeRevisionCount(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function sanitizeVariantId(value: string): string {
  if (typeof value !== 'string') return 'base';
  const trimmed = value.trim();
  return trimmed.length === 0 ? 'base' : truncateChars(trimmed, 64);
}

/** 证据事件单条序列化上限（docs/02 §8.4：≤ 1.5 KB）。 */
const MAX_EVENT_BYTES = 1536;
/** 单条事件的 metrics 键数上限（docs/02 §8.4）。 */
const MAX_METRICS_KEYS = 8;
const PHASE_SET = new Set<string>(EVIDENCE_PHASES);
const TOOL_SET = new Set<string>(TOOL_IDS);
const OUTCOME_SET = new Set<string>(['info', 'pass', 'fail']);
const SCAFFOLD_SET = new Set<string>(['none', 'env', 'tool', 'demo']);
const LEVEL_SET = new Set<string>(LEVEL_IDS);

/** 关卡 id 来自运行时：未知 id 不能污染存档与证据（读档时会被 migrate 丢掉）。 */
function isKnownLevelId(value: unknown): value is LevelId {
  return typeof value === 'string' && LEVEL_SET.has(value);
}

/** 文本字段：非字符串/空白视为缺失，超长按码点截断。 */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : truncateChars(trimmed, max);
}

function cleanMetrics(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metrics: Record<string, number> = {};
  let kept = 0;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= MAX_METRICS_KEYS) break;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    metrics[truncateChars(key, 32)] = raw;
    kept += 1;
  }
  return kept > 0 ? metrics : null;
}

function cleanArtifact(value: unknown): EvidenceEvent['artifact'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = cleanText(source.id, 64);
  const kind = cleanText(source.kind, 32);
  if (id === null || kind === null) return null;
  return {
    id,
    kind: kind as NonNullable<EvidenceEvent['artifact']>['kind'],
    digest: cleanText(source.digest, 128) ?? '',
    summary: cleanText(source.summary, 120) ?? '',
  };
}

/** UTF-8 字节数：docs/02 的 1.5 KB 是落盘体积，不是 UTF-16 长度。 */
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function eventBytes(event: EvidenceEvent): number {
  try {
    return utf8Bytes(JSON.stringify(event));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * 兜底裁剪：先丢可选字段（metrics → artifact → failureClass），最后才截 action。
 * 保证写入的证据永远不会因为某条事件过大而撑爆存档。
 */
function fitEventSize(event: EvidenceEvent): EvidenceEvent {
  if (eventBytes(event) <= MAX_EVENT_BYTES) return event;
  delete event.metrics;
  if (eventBytes(event) <= MAX_EVENT_BYTES) return event;
  delete event.artifact;
  if (eventBytes(event) <= MAX_EVENT_BYTES) return event;
  delete event.failureClass;
  if (eventBytes(event) <= MAX_EVENT_BYTES) return event;
  event.action = truncateChars(event.action, 40);
  return event;
}

/** 运行时草稿 → 可落盘事件：只保留契约内字段，坏草稿整条丢弃（只丢它自己）。 */
function toEvidenceEvent(
  draft: EvidenceDraft,
  base: { id: string; at: number; levelId: LevelId; revision: number },
): EvidenceEvent | null {
  if (!draft || typeof draft !== 'object') return null;
  const phase = typeof draft.phase === 'string' && PHASE_SET.has(draft.phase)
    ? (draft.phase as EvidencePhase)
    : null;
  if (phase === null) return null;

  const event: EvidenceEvent = {
    v: 1,
    id: base.id,
    at: base.at,
    profileId: PROFILE_ID,
    levelId: base.levelId,
    revision: base.revision,
    phase,
    variantId: cleanText(draft.variantId, 64) ?? 'base',
    action: cleanText(draft.action, 200) ?? '',
  };

  if (typeof draft.tool === 'string' && TOOL_SET.has(draft.tool)) event.tool = draft.tool as ToolId;
  if (typeof draft.outcome === 'string' && OUTCOME_SET.has(draft.outcome)) {
    event.outcome = draft.outcome as EvidenceEvent['outcome'];
  }
  if (typeof draft.scaffold === 'string' && SCAFFOLD_SET.has(draft.scaffold)) {
    event.scaffold = draft.scaffold as EvidenceEvent['scaffold'];
  }
  const failureClass = cleanText(draft.failureClass, 64);
  if (failureClass !== null) event.failureClass = failureClass;
  const metrics = cleanMetrics(draft.metrics);
  if (metrics !== null) event.metrics = metrics;
  const artifact = cleanArtifact(draft.artifact);
  if (artifact !== null) event.artifact = artifact;

  return fitEventSize(event);
}

/** 保序去重合并（存档里的旧值在前）。 */
function mergeUnique<T extends string>(base: readonly T[], extra: readonly T[]): T[] {
  const out: T[] = [];
  for (const value of [...base, ...extra]) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export class ProgressManager {
  private readonly store: ProgressStore;
  private readonly evidence: EvidenceStore;
  private readonly clock: () => number;
  private readonly baseNow: number;
  private current: SaveData;
  private initPromise: Promise<SaveData> | null = null;
  private evidenceCounter = 0;
  private journalCounter = 0;
  /** 写盘串行队列：并发通关时保证落盘顺序 == 内存更新顺序。 */
  private writeChain: Promise<void> = Promise.resolve();
  /** 每关的"证据批次"序号，写入 EvidenceEvent.revision（0 起）。 */
  private readonly revisionBatches = new Map<LevelId, number>();

  constructor(store: ProgressStore, evidence: EvidenceStore, clock: () => number, now?: number) {
    this.store = store;
    this.evidence = evidence;
    this.clock = clock;
    this.baseNow =
      typeof now === 'number' && Number.isFinite(now)
        ? Math.trunc(now)
        : Math.trunc(clock());
    this.current = emptySave(this.baseNow);
  }

  /** 读档 single-flight：并发调用只读一次盘。 */
  init(): Promise<SaveData> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  snapshot(): SaveData {
    return cloneSave(this.current);
  }

  async completeLevel(input: CompletionInput): Promise<SaveData> {
    await this.init();
    if (!input || typeof input !== 'object' || !isKnownLevelId(input.levelId)) {
      // 未知关卡（老内容/写错的 id）不写存档：读档时它本来就会被 migrate 丢掉。
      return this.snapshot();
    }
    const at = this.clock();
    const levelId = input.levelId;
    const previousLevel = this.levelFor(levelId);
    const variantId = sanitizeVariantId(input.variantId);
    const stamps = mergeUnique(
      previousLevel.stamps,
      sanitizeStamps(Array.isArray(input.stamps) ? input.stamps : []),
    );
    const toolIds = sanitizeTools(Array.isArray(input.toolIds) ? input.toolIds : []);
    const failureClassesSeen = sanitizeFailureClasses(
      Array.isArray(input.failureClassesSeen) ? input.failureClassesSeen : [],
    );
    const revisionCount = sanitizeRevisionCount(input.revisionCount);

    const nextLevel: LevelProgress = {
      levelId,
      completed: true,
      completedVariants: mergeUnique(previousLevel.completedVariants, [variantId]),
      stamps,
      attempts: previousLevel.attempts + 1,
      lastPlayedAt: at,
      lastOutcome: {
        at,
        stamps,
        failureClassesSeen,
        revisionCount,
        // materials 来自证据产物摘要，completeLevel 的入参里目前没有产物，先留空数组。
        materials: [],
      },
    };

    const levels: Record<LevelId, LevelProgress> = {
      ...this.current.levels,
      [levelId]: nextLevel,
    };

    const tools: Record<ToolId, ToolUsage> = { ...this.current.tools };
    for (const toolId of toolIds) {
      const usage = tools[toolId] ?? { uses: 0, lastUsedAt: null };
      tools[toolId] = { ...usage, uses: usage.uses + 1, lastUsedAt: at };
    }

    const entry: JournalEntry = {
      id: this.nextJournalId(at),
      at,
      levelId,
      variantId,
      stamps,
      toolIds,
      failureClasses: failureClassesSeen,
      revisionCount,
    };
    const journal = [...this.current.journal, entry].slice(-MAX_JOURNAL_ENTRIES);

    const next: SaveData = {
      ...this.current,
      schemaVersion: SAVE_SCHEMA_VERSION,
      updatedAt: at,
      levels,
      tools,
      journal,
    };
    this.current = next;
    await this.persist(next);
    return this.snapshot();
  }

  /**
   * 把运行时草稿补齐成 EvidenceEvent 后追加到证据库。
   * revision 口径：同一关内第几次"证据批次"（0 起）。EvidenceDraft 本身不带 revision，
   * 外壳按 2 秒 / 阶段结束批量调用本方法，批次序号即该关的修订轨迹。
   */
  async recordEvidence(levelId: LevelId, drafts: EvidenceDraft[]): Promise<void> {
    if (!isKnownLevelId(levelId) || !Array.isArray(drafts) || drafts.length === 0) return;
    const at = this.clock();
    const batch = this.revisionBatches.get(levelId) ?? 0;
    const events: EvidenceEvent[] = [];
    for (const draft of drafts) {
      const event = toEvidenceEvent(draft, {
        id: this.nextEvidenceId(at),
        at,
        levelId,
        revision: batch,
      });
      if (event) events.push(event);
    }
    // 整批草稿都坏时不占 revision，也不写空数组。
    if (events.length === 0) return;
    this.revisionBatches.set(levelId, batch + 1);
    await this.evidence.append(events);
  }

  /** 最近证据（倒序由 EvidenceStore 负责，这里原样返回）。 */
  async recentEvidence(limit = 300): Promise<EvidenceEvent[]> {
    await this.init();
    return this.evidence.recent(limit);
  }

  /**
   * 按证据规则重算徽章，把新达成的写入存档。
   * 徽章不是"通关次数"：规则在 evidence 包，纯函数、可重算。
   */
  async refreshBadges(now = this.clock()): Promise<BadgeId[]> {
    await this.init();
    // 徽章按证据重算：取满裁剪上限，否则 3000 条里的旧证据会被静默忽略。
    const events = await this.evidence.recent(MAX_EVIDENCE_EVENTS);
    const views = evaluateBadges(this.current, events, LEVEL_SUMMARIES);
    const badges = { ...this.current.badges };
    const newly: BadgeId[] = [];
    // recent() 按时间倒序（最新在前）：引用取最新的 20 条，而非窗口里最旧的 20 条。
    const evidenceRefs = events.slice(0, 20).map((event) => event.id);
    for (const view of views) {
      if (!view.earned || badges[view.id]) continue;
      badges[view.id] = { awardedAt: now, evidenceRefs };
      newly.push(view.id);
    }
    if (newly.length > 0) {
      this.current = { ...this.current, updatedAt: now, badges };
      await this.persist(this.current);
    }
    return newly;
  }

  /** 清档：存档回空档、证据与聚合一并清空。 */
  async clear(): Promise<SaveData> {
    await this.init();
    const at = this.clock();
    const empty = emptySave(at);
    this.current = empty;
    await this.persist(empty);
    await this.evidence.clear();
    this.revisionBatches.clear();
    return this.snapshot();
  }

  private async load(): Promise<SaveData> {
    let raw: unknown;
    try {
      raw = await this.store.load();
    } catch {
      // 读档失败按空档处理：不阻塞进入工坊，下一次写盘会覆盖坏档。
      raw = null;
    }
    const next = migrate(raw, this.baseNow);
    this.current = next;
    if (needsPersist(raw, next)) await this.persist(next);
    return this.snapshot();
  }

  /**
   * 串行写盘：并发 completeLevel 时后一次写入一定排在前一次之后，磁盘不会回退到旧存档。
   * 写失败只吞掉错误——调用方（关卡反馈）不该因为存储不可用而中断（docs/02 §8.3）。
   */
  private persist(next: SaveData): Promise<void> {
    const task = this.writeChain.then(() => this.store.save(next));
    this.writeChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task.catch(() => undefined);
  }

  private levelFor(levelId: LevelId): LevelProgress {
    return Object.prototype.hasOwnProperty.call(this.current.levels, levelId)
      ? this.current.levels[levelId]
      : emptyLevelProgress(levelId);
  }

  private nextEvidenceId(at: number): string {
    const id = `ev-${at}-${this.evidenceCounter}`;
    this.evidenceCounter += 1;
    return id;
  }

  private nextJournalId(at: number): string {
    const id = `journal-${at}-${this.journalCounter}`;
    this.journalCounter += 1;
    return id;
  }

}
