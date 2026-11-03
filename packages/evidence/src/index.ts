/**
 * 证据纯函数层：聚合 + 画像 / 徽章 / 轨迹 / 报告。
 * 只做计算，不碰 DOM / 存储 / 时钟；时间与输入由外壳注入。
 * 运行时只产出 EvidenceDraft；id / profileId / at 由外壳（ProgressManager）补齐后成为 EvidenceEvent。
 */
import type { EvidencePhase, ToolId } from '@mmf/content/ids';
import { TOOL_IDS } from '@mmf/content/ids';
import type { EvidenceAggregate, EvidenceEvent } from '@mmf/game-kit';

export type {
  ArtifactSummary,
  EvidenceAggregate,
  EvidenceDraft,
  EvidenceEvent,
  EvidenceRecord,
} from '@mmf/game-kit';
export type { EvidencePhase, ToolId } from '@mmf/content/ids';
export type {
  BadgeView,
  DimensionSignal,
  DimensionView,
  EvidenceBuildInput,
  EvidenceDimensionId,
  EvidenceProfile,
  Recommendation,
  ReportLevelRow,
  ReportModel,
  ReportPack,
  TrailItem,
} from './types';

export { buildEvidenceProfile } from './profile';
export { evaluateBadges } from './badges';
export { buildTrail } from './trail';
export { buildReport, parseReportPack, toReportPack } from './report';
export { localizeDimensions, localizeReport, localizeTrail } from './localize';

/** 空聚合：6 件工具的计数全部归零，便于 UI 直接读 byTool[tool]。 */
export function emptyAggregate(): EvidenceAggregate {
  const byTool = {} as Record<ToolId, number>;
  for (const tool of TOOL_IDS) byTool[tool] = 0;
  return {
    total: 0,
    byLevel: {},
    byTool,
    byPhase: {},
    byFailure: {},
    lastAggregatedAt: 0,
  };
}

/**
 * 把事件列表聚合成计数（纯函数，无时钟）：
 * - byLevel：每个关卡的事件数；
 * - byTool：每件工具的事件数（没有 tool 的事件不计入，但计入 total）；
 * - byPhase：按阶段计数；
 * - byFailure：按失败类计数；
 * - lastAggregatedAt：事件里最大的 at（没有事件时为 0），不读取系统时钟。
 */
export function aggregate(events: EvidenceEvent[]): EvidenceAggregate {
  const result = emptyAggregate();
  const byPhase: Partial<Record<EvidencePhase, number>> = {};

  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    result.total += 1;

    if (typeof event.levelId === 'string' && event.levelId.length > 0) {
      result.byLevel[event.levelId] = (result.byLevel[event.levelId] ?? 0) + 1;
    }
    if (typeof event.tool === 'string' && event.tool.length > 0) {
      result.byTool[event.tool] = (result.byTool[event.tool] ?? 0) + 1;
    }
    if (typeof event.phase === 'string' && event.phase.length > 0) {
      byPhase[event.phase] = (byPhase[event.phase] ?? 0) + 1;
    }
    if (typeof event.failureClass === 'string' && event.failureClass.length > 0) {
      result.byFailure[event.failureClass] = (result.byFailure[event.failureClass] ?? 0) + 1;
    }
    if (
      typeof event.at === 'number' &&
      Number.isFinite(event.at) &&
      event.at > result.lastAggregatedAt
    ) {
      result.lastAggregatedAt = Math.trunc(event.at);
    }
  }

  result.byPhase = byPhase;
  return result;
}
