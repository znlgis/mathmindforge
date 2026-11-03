/**
 * 思维轨迹：把证据事件按时间排成一条可回看的中文时间线。
 *
 * 纯函数：不读时钟、不碰 DOM；limit 默认 80 条（docs/07 §1.2）。
 * save 仅用于签名对齐：轨迹的唯一事实来源是证据事件。
 */
import type { EvidencePhase, LevelId, ToolId } from '@mmf/content/ids';
import { TOOL_IDS, TOOL_LABELS } from '@mmf/content/ids';
import type { LevelSummary } from '@mmf/content';
import type { EvidenceEvent, SaveData } from '@mmf/game-kit';
import type { TrailItem } from './types';

const DEFAULT_LIMIT = 80;
const TOOL_SET = new Set<string>(TOOL_IDS);

const PHASE_LABELS: Record<EvidencePhase, string> = {
  observe: '观察',
  hypothesize: '猜想',
  construct: '搭建',
  run: '运行',
  result: '结果',
  revise: '修订',
  generalize: '推广',
  argue: '论证',
};

function normalizeAt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeLimit(limit: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(0, Math.trunc(limit));
}

export function buildTrail(
  _save: SaveData,
  events: EvidenceEvent[],
  summaries: readonly LevelSummary[],
  limit = DEFAULT_LIMIT,
): TrailItem[] {
  const max = normalizeLimit(limit);
  if (max === 0) return [];

  const titles = new Map<string, string>();
  for (const summary of summaries) titles.set(summary.id, summary.title);

  const decorated: { event: EvidenceEvent; at: number; index: number }[] = [];
  events.forEach((event, index) => {
    if (event === null || typeof event !== 'object') return;
    decorated.push({ event, at: normalizeAt(event.at), index });
  });
  decorated.sort((a, b) => a.at - b.at || a.index - b.index);

  const visible = decorated.slice(-max);
  const usedIds = new Set<string>();
  const items: TrailItem[] = [];

  for (const entry of visible) {
    const event = entry.event;
    const at = entry.at;
    const levelId: LevelId = event.levelId;
    const title = titles.get(levelId) ?? levelId;
    const phase = event.phase;
    const phaseLabel = PHASE_LABELS[phase] ?? '记录';
    const tool: ToolId | undefined = typeof event.tool === 'string' && TOOL_SET.has(event.tool)
      ? (event.tool as ToolId)
      : undefined;
    const action = typeof event.action === 'string' ? event.action.trim() : '';
    const outcome = event.outcome === 'pass' || event.outcome === 'fail' ? event.outcome : 'info';
    const failureClass = typeof event.failureClass === 'string' && event.failureClass.length > 0
      ? event.failureClass
      : undefined;

    let id = typeof event.id === 'string' && event.id.length > 0
      ? event.id
      : 'trail-' + at + '-' + entry.index;
    if (usedIds.has(id)) id = id + '-' + entry.index;
    usedIds.add(id);

    let label = title + ' · ' + phaseLabel;
    if (tool) label += ' · ' + TOOL_LABELS[tool];
    if (action) label += '：' + action;
    if (outcome === 'pass') label += '（通过）';
    else if (outcome === 'fail') label += failureClass ? '（未通过：' + failureClass + '）' : '（未通过）';

    const item: TrailItem = {
      id,
      at,
      levelId,
      title,
      phase,
      phaseLabel,
      action,
      outcome,
      label,
    };
    if (tool) {
      item.tool = tool;
      item.toolLabel = TOOL_LABELS[tool];
    }
    if (failureClass) item.failureClass = failureClass;
    items.push(item);
  }

  return items;
}
