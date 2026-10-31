/**
 * 进度管理器：读档 single-flight、通关写入、证据事件补齐、清档。
 *
 * 时间全部来自注入的 clock()；这里不出现 Date.now / Math.random。
 * 存档不在这里做结构校验：迁移与 sanitize 全部交给 save.ts 的 migrate()。
 */
import type { LevelId, StampId, ToolId } from '@mmf/content/ids';
import { STAMP_IDS, TOOL_IDS } from '@mmf/content/ids';
import type {
  EvidenceDraft,
  EvidenceEvent,
  EvidenceStore,
  JournalEntry,
  LevelProgress,
  ProgressStore,
  SaveData,
  ToolUsage,
} from '@mmf/game-kit';
import {
  MAX_JOURNAL_ENTRIES,
  PROFILE_ID,
  SAVE_SCHEMA_VERSION,
  emptyLevelProgress,
  emptySave,
  migrate,
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
  return typeof value === 'string' && value.length > 0 ? value : 'base';
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
    const at = this.clock();
    const levelId = input.levelId;
    const previousLevel = this.levelFor(levelId);
    const variantId = sanitizeVariantId(input.variantId);
    const stamps = mergeUnique(previousLevel.stamps, sanitizeStamps(input.stamps));
    const toolIds = sanitizeTools(input.toolIds);
    const failureClassesSeen = sanitizeFailureClasses(input.failureClassesSeen);
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
    await this.store.save(next);
    return this.snapshot();
  }

  /**
   * 把运行时草稿补齐成 EvidenceEvent 后追加到证据库。
   * revision 口径：同一关内第几次"证据批次"（0 起）。EvidenceDraft 本身不带 revision，
   * 外壳按 2 秒 / 阶段结束批量调用本方法，批次序号即该关的修订轨迹。
   */
  async recordEvidence(levelId: LevelId, drafts: EvidenceDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    const at = this.clock();
    const revision = this.nextRevision(levelId);
    const events: EvidenceEvent[] = drafts.map((draft) => ({
      ...draft,
      v: 1,
      id: this.nextEvidenceId(at),
      at,
      profileId: PROFILE_ID,
      levelId,
      revision,
    }));
    await this.evidence.append(events);
  }

  /** 清档：存档回空档、证据与聚合一并清空。 */
  async clear(): Promise<SaveData> {
    await this.init();
    const at = this.clock();
    const empty = emptySave(at);
    this.current = empty;
    await this.store.save(empty);
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
    if (needsPersist(raw, next)) await this.store.save(next);
    return this.snapshot();
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

  private nextRevision(levelId: LevelId): number {
    const batch = this.revisionBatches.get(levelId) ?? 0;
    this.revisionBatches.set(levelId, batch + 1);
    return batch;
  }
}
