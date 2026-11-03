/**
 * 一页式报告：昵称、工具使用、关卡表、四维三档、下一步建议与隐私声明。
 *
 * 纯函数：generatedAt 来自调用方传入的 now；不读系统时钟。
 * 报告不得出现正确率 / 刷题量 / 排名（docs/07 §4）。
 */
import type { LevelId } from '@mmf/content/ids';
import { TOOL_LABELS } from '@mmf/content/ids';
import type { LevelSummary } from '@mmf/content';
import type { EvidenceEvent, LevelProgress, SaveData } from '@mmf/game-kit';
import type { ReportLevelRow, ReportModel, ReportPack } from './types';
import { buildEvidenceProfile, toolUseCounts } from './profile';

const DAY_MS = 86_400_000;
const MAX_PERIOD_DAYS = 7;
const DEFAULT_NICKNAME = '小工匠';

export const PRIVACY_NOTE = '数据只在本机，不含正确率、刷题量或排名。';

function normalizeTime(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function validEvents(events: readonly EvidenceEvent[]): EvidenceEvent[] {
  const out: EvidenceEvent[] = [];
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    out.push(event);
  }
  return out;
}

/** 报告窗口：从最早一条记录到 now，向上取整并按 7 天封顶。 */
function computePeriodDays(save: SaveData, events: readonly EvidenceEvent[], now: number): number {
  const times: number[] = [];
  const createdAt = save && save.profile ? save.profile.createdAt : undefined;
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) times.push(createdAt);

  for (const event of events) {
    if (typeof event.at === 'number' && Number.isFinite(event.at)) times.push(event.at);
  }
  const journal = save && Array.isArray(save.journal) ? save.journal : [];
  for (const entry of journal) {
    if (entry && typeof entry.at === 'number' && Number.isFinite(entry.at)) times.push(entry.at);
  }

  if (times.length === 0) return 1;
  const earliest = Math.min(...times);
  const span = now - earliest;
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.min(MAX_PERIOD_DAYS, Math.max(1, Math.ceil(span / DAY_MS)));
}

function rowFrom(levelId: LevelId, title: string, state: LevelProgress | undefined): ReportLevelRow {
  const completed = state?.completed === true;
  const stamps = state && Array.isArray(state.stamps) ? [...state.stamps] : [];
  const lastPlayedAt = state && typeof state.lastPlayedAt === 'number' && Number.isFinite(state.lastPlayedAt)
    ? Math.trunc(state.lastPlayedAt)
    : null;
  const variantCount = state && Array.isArray(state.completedVariants) ? state.completedVariants.length : 0;
  return { levelId, title, completed, stamps, lastPlayedAt, variantCount };
}

function buildLevelRows(save: SaveData, summaries: readonly LevelSummary[]): ReportLevelRow[] {
  const levels: Record<LevelId, LevelProgress> = save && save.levels
    ? save.levels
    : ({} as Record<LevelId, LevelProgress>);
  const rows: ReportLevelRow[] = [];

  if (summaries.length === 0) {
    for (const state of Object.values(levels)) rows.push(rowFrom(state.levelId, state.levelId, state));
    return rows;
  }

  for (const summary of summaries) {
    const hasState = Object.prototype.hasOwnProperty.call(levels, summary.id);
    rows.push(rowFrom(summary.id, summary.title, hasState ? levels[summary.id] : undefined));
  }
  return rows;
}

export function buildReport(
  save: SaveData,
  events: EvidenceEvent[],
  summaries: readonly LevelSummary[],
  now: number,
): ReportModel {
  const generatedAt = normalizeTime(now);
  const safeEvents = validEvents(events);
  const profile = buildEvidenceProfile(save, safeEvents, summaries, generatedAt);

  const rawNickname = save && save.profile ? save.profile.nickname : undefined;
  const nickname = typeof rawNickname === 'string' && rawNickname.trim().length > 0
    ? rawNickname.trim()
    : DEFAULT_NICKNAME;

  const tools = toolUseCounts(save, safeEvents).map((entry) => ({
    tool: entry.tool,
    label: TOOL_LABELS[entry.tool],
    uses: entry.count,
  }));

  const journal = save && Array.isArray(save.journal) ? save.journal : [];

  return {
    generatedAt,
    nickname,
    periodDays: computePeriodDays(save, safeEvents, generatedAt),
    tools,
    levels: buildLevelRows(save, summaries),
    dimensions: profile.dimensions,
    recommendations: profile.recommendations,
    totalJournal: journal.length,
    totalEvents: profile.eventCount,
    privacyNote: PRIVACY_NOTE,
  };
}

/** 导出包：只保留可公开的短字段，工具 / 关卡 / 维度都收敛成字符串数组。 */
export function toReportPack(report: ReportModel): ReportPack {
  const pack: ReportPack = {
    version: 1,
    generatedAt: report.generatedAt,
    tools: report.tools.map((entry) => ({ tool: entry.tool, uses: entry.uses })),
    levels: report.levels.map((row) => ({
      id: row.levelId,
      title: row.title,
      completed: row.completed,
      stamps: [...row.stamps],
    })),
    dimensions: report.dimensions.map((dimension) => ({
      id: dimension.id,
      band: dimension.band,
      summary: dimension.summary,
    })),
    recommendations: report.recommendations.map((recommendation) => ({
      title: recommendation.title,
      reason: recommendation.reason,
    })),
  };
  if (report.nickname) pack.nickname = report.nickname;
  return pack;
}


function text(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * 只读导入：把用户选中的 JSON 收敛成 ReportPack。
 * 不信任文件内容：版本不对、字段缺失、超长文本、非数组一律截断或丢弃。
 */
export function parseReportPack(input: unknown): ReportPack | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 || typeof raw.generatedAt !== 'number' || !Number.isFinite(raw.generatedAt)) return null;
  const tools = Array.isArray(raw.tools)
    ? raw.tools.slice(0, 12).map((item) => {
        const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return { tool: text(record.tool, 32), uses: typeof record.uses === 'number' ? Math.max(0, Math.trunc(record.uses)) : 0 };
      }).filter((item) => item.tool.length > 0)
    : [];
  const levels = Array.isArray(raw.levels)
    ? raw.levels.slice(0, 40).map((item) => {
        const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          id: text(record.id, 64),
          title: text(record.title, 40),
          completed: record.completed === true,
          stamps: Array.isArray(record.stamps) ? record.stamps.slice(0, 8).map((stamp) => text(stamp, 24)).filter(Boolean) : [],
        };
      }).filter((item) => item.id.length > 0)
    : [];
  const dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions.slice(0, 8).map((item) => {
        const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const band = typeof record.band === 'number' ? Math.max(0, Math.min(3, Math.trunc(record.band))) : 0;
        return { id: text(record.id, 24), band, summary: text(record.summary, 200) };
      }).filter((item) => item.id.length > 0)
    : [];
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations.slice(0, 5).map((item) => {
        const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return { title: text(record.title, 60), reason: text(record.reason, 200) };
      }).filter((item) => item.title.length > 0)
    : [];
  return {
    version: 1,
    generatedAt: Math.trunc(raw.generatedAt),
    nickname: typeof raw.nickname === 'string' ? text(raw.nickname, 24) : undefined,
    tools,
    levels,
    dimensions,
    recommendations,
  };
}
