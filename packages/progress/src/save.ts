/**
 * 存档模型：空档、字段级 sanitize 与读档迁移。
 *
 * 纪律（与 docs/02 §8.3 一致）：
 * - 每一步迁移只补字段/换算，不清空；
 * - 每个字段独立 sanitize：坏字段只丢它自己，不连累整份存档；
 * - 只有 schemaVersion > 当前版本（来自未来）才整体回空档；
 * - 纯逻辑：不碰 DOM / 存储 / 时钟，时间一律由调用方注入。
 */
import type { Band, BadgeId, LevelId, ToolId } from '@mmf/content/ids';
import { BADGE_IDS, BANDS, LEVEL_IDS, STAMP_IDS, TOOL_IDS } from '@mmf/content/ids';
import type {
  BadgeAward,
  JournalEntry,
  LevelProgress,
  SaveData,
  ToolUsage,
} from '@mmf/game-kit';

export type {
  BadgeAward,
  EvidenceAggregate,
  EvidenceDraft,
  EvidenceEvent,
  EvidenceRecord,
  JournalEntry,
  LevelProgress,
  SaveData,
  ToolUsage,
} from '@mmf/game-kit';

/** 当前存档结构版本；只有"来自未来版本"的存档才整体回空档。 */
export const SAVE_SCHEMA_VERSION = 1;
/** 本机唯一档案 id（M0 不做账号，多档案留给 v1.1）。 */
export const PROFILE_ID = 'local-default';
export const DEFAULT_NICKNAME = '小工匠';
export const DEFAULT_START_BAND: Band = 'k';
/** 思维日志只保留最近 120 条（docs/02 §8.2）。 */
export const MAX_JOURNAL_ENTRIES = 120;
/** 证据日志上限，超出时裁剪最旧事件（平台层 append 时使用）。 */
export const MAX_EVIDENCE_EVENTS = 3000;

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 非空字符串；空串/纯空白视为坏字段。 */
function sanitizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function sanitizeNonNegativeInt(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

/** 时间戳：非负有限数取整；否则 null（由调用方决定默认值）。 */
function sanitizeTimestamp(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? Math.trunc(value) : null;
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !out.includes(item)) out.push(item);
  }
  return out;
}

function sanitizeEnumList<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowedSet.has(item)) continue;
    const typed = item as T;
    if (!out.includes(typed)) out.push(typed);
  }
  return out;
}

export function emptyLevelProgress(levelId: LevelId): LevelProgress {
  return {
    levelId,
    completed: false,
    completedVariants: [],
    stamps: [],
    attempts: 0,
    lastPlayedAt: null,
  };
}

export function emptyToolUsage(): ToolUsage {
  return { uses: 0, lastUsedAt: null };
}

export function emptySave(now: number): SaveData {
  const at = sanitizeTimestamp(now) ?? 0;
  const levels = {} as Record<LevelId, LevelProgress>;
  for (const levelId of LEVEL_IDS) levels[levelId] = emptyLevelProgress(levelId);
  const tools = {} as Record<ToolId, ToolUsage>;
  for (const toolId of TOOL_IDS) tools[toolId] = emptyToolUsage();
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAt: at,
    profile: {
      id: PROFILE_ID,
      nickname: DEFAULT_NICKNAME,
      startBand: DEFAULT_START_BAND,
      createdAt: at,
    },
    levels,
    tools,
    badges: {},
    journal: [],
  };
}

function sanitizeLastOutcome(raw: unknown): LevelProgress['lastOutcome'] {
  if (!isRecord(raw)) return undefined;
  const at = sanitizeTimestamp(raw.at);
  if (at === null) return undefined;
  return {
    at,
    stamps: sanitizeEnumList(raw.stamps, STAMP_IDS),
    failureClassesSeen: sanitizeStringList(raw.failureClassesSeen),
    revisionCount: sanitizeNonNegativeInt(raw.revisionCount, 0),
    materials: sanitizeStringList(raw.materials),
  };
}

function sanitizeLevelProgress(levelId: LevelId, raw: unknown): LevelProgress {
  const source = isRecord(raw) ? raw : {};
  const progress: LevelProgress = {
    levelId,
    completed: source.completed === true,
    completedVariants: sanitizeStringList(source.completedVariants),
    stamps: sanitizeEnumList(source.stamps, STAMP_IDS),
    attempts: sanitizeNonNegativeInt(source.attempts, 0),
    lastPlayedAt: sanitizeTimestamp(source.lastPlayedAt),
  };
  const lastOutcome = sanitizeLastOutcome(source.lastOutcome);
  if (lastOutcome) progress.lastOutcome = lastOutcome;
  return progress;
}

function sanitizeToolUsage(raw: unknown): ToolUsage {
  const source = isRecord(raw) ? raw : {};
  const usage: ToolUsage = {
    uses: sanitizeNonNegativeInt(source.uses, 0),
    lastUsedAt: sanitizeTimestamp(source.lastUsedAt),
  };
  if (isRecord(source.lastArtifact)) {
    const kind = sanitizeString(source.lastArtifact.kind);
    const summary = sanitizeString(source.lastArtifact.summary);
    if (kind !== null && summary !== null) usage.lastArtifact = { kind, summary };
  }
  return usage;
}

function sanitizeBadges(raw: unknown): Partial<Record<BadgeId, BadgeAward>> {
  const badges: Partial<Record<BadgeId, BadgeAward>> = {};
  if (!isRecord(raw)) return badges;
  for (const badgeId of BADGE_IDS) {
    const award = raw[badgeId];
    if (!isRecord(award)) continue;
    const awardedAt = sanitizeTimestamp(award.awardedAt);
    if (awardedAt === null) continue;
    badges[badgeId] = { awardedAt, evidenceRefs: sanitizeStringList(award.evidenceRefs) };
  }
  return badges;
}

function sanitizeJournalEntry(raw: unknown, index: number): JournalEntry | null {
  if (!isRecord(raw)) return null;
  const at = sanitizeTimestamp(raw.at);
  if (at === null) return null;
  if (typeof raw.levelId !== 'string' || !(LEVEL_IDS as readonly string[]).includes(raw.levelId)) {
    return null;
  }
  const entry: JournalEntry = {
    id: sanitizeString(raw.id) ?? `journal-${at}-${index}`,
    at,
    levelId: raw.levelId as LevelId,
    variantId: sanitizeString(raw.variantId) ?? '',
    stamps: sanitizeEnumList(raw.stamps, STAMP_IDS),
    toolIds: sanitizeEnumList(raw.toolIds, TOOL_IDS),
    failureClasses: sanitizeStringList(raw.failureClasses),
    revisionCount: sanitizeNonNegativeInt(raw.revisionCount, 0),
  };
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 80) : '';
  if (note.length > 0) entry.note = note;
  return entry;
}

function sanitizeJournal(raw: unknown): JournalEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: JournalEntry[] = [];
  const items: unknown[] = raw;
  for (let index = 0; index < items.length; index += 1) {
    const entry = sanitizeJournalEntry(items[index], index);
    if (entry) entries.push(entry);
  }
  entries.sort((a, b) => a.at - b.at);
  return entries.slice(-MAX_JOURNAL_ENTRIES);
}

function sanitizeProfile(raw: unknown, now: number): SaveData['profile'] {
  const source = isRecord(raw) ? raw : {};
  const nickname = sanitizeString(source.nickname)?.trim() ?? DEFAULT_NICKNAME;
  const band =
    typeof source.startBand === 'string' &&
    (BANDS as readonly string[]).includes(source.startBand)
      ? (source.startBand as Band)
      : DEFAULT_START_BAND;
  return {
    id: PROFILE_ID,
    nickname,
    startBand: band,
    createdAt: sanitizeTimestamp(source.createdAt) ?? sanitizeTimestamp(now) ?? 0,
  };
}

/** 允许历史实现把存档序列化成 JSON 字符串落盘；其他类型原样返回。 */
function parseRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * 读档迁移：任何旧版本（含没有版本号的历史档）都只补字段、不清空；
 * 只有 schemaVersion 大于当前版本（来自未来）才回空档。
 * 永不抛错：无法识别的输入一律回空档。
 */
export function migrate(raw: unknown, now: number): SaveData {
  const fallback = emptySave(now);
  const parsed = parseRaw(raw);
  if (!isRecord(parsed)) return fallback;

  const rawVersion = isFiniteNumber(parsed.schemaVersion)
    ? Math.trunc(parsed.schemaVersion)
    : null;
  if (rawVersion !== null && rawVersion > SAVE_SCHEMA_VERSION) return fallback;

  const rawLevels = isRecord(parsed.levels) ? parsed.levels : {};
  const levels = {} as Record<LevelId, LevelProgress>;
  for (const levelId of LEVEL_IDS) {
    levels[levelId] = sanitizeLevelProgress(levelId, rawLevels[levelId]);
  }

  const rawTools = isRecord(parsed.tools) ? parsed.tools : {};
  const tools = {} as Record<ToolId, ToolUsage>;
  for (const toolId of TOOL_IDS) {
    tools[toolId] = sanitizeToolUsage(rawTools[toolId]);
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAt: sanitizeTimestamp(parsed.updatedAt) ?? sanitizeTimestamp(now) ?? 0,
    profile: sanitizeProfile(parsed.profile, now),
    levels,
    tools,
    badges: sanitizeBadges(parsed.badges),
    journal: sanitizeJournal(parsed.journal),
  };
}
