/**
 * 徽章：由证据授予，不按通关次数（docs/07 §1.4）。
 *
 * 纯函数：只读存档与事件；earned = 存档已授予 || 当前进度达标。
 * 达标但尚未落盘的徽章由 ProgressManager.refreshBadges() 写入 save.badges。
 */
import type { BadgeId, LevelId } from '@mmf/content/ids';
import { BADGE_IDS } from '@mmf/content/ids';
import type { LevelSummary } from '@mmf/content';
import type { EvidenceEvent, LevelProgress, SaveData } from '@mmf/game-kit';
import type { BadgeView } from './types';

const OBSERVE_TARGET = 2;
const TRANSFER_TARGET = 2;

/** 完成关卡即授予的徽章：徽章 id → 关卡 id。 */
const LEVEL_BADGES: Partial<Record<BadgeId, LevelId>> = {
  'pattern-spotter': 'k-structure-pattern-path',
  'rule-designer': 'g13-algorithm-route',
  builder: 'g46-algorithm-payment',
  modeler: 'g79-modeling-dispatch',
  experimenter: 'g1012-modeling-winrate',
};

const TITLES: Record<BadgeId, string> = {
  observer: '观察者',
  'pattern-spotter': '模式捕手',
  'rule-designer': '规则设计师',
  builder: '构造师',
  modeler: '建模师',
  experimenter: '实验员',
  'boundary-explorer': '边界探险家',
  reviser: '修订者',
  transferer: '迁移者',
};

const CRITERIA: Record<BadgeId, string> = {
  observer: '在至少 2 个关卡留下观察记录',
  'pattern-spotter': '完成模式主线关卡',
  'rule-designer': '完成规则主线关卡',
  builder: '完成支付关，用最少的材料把账付清',
  modeler: '完成模拟关，让指标同时达标',
  experimenter: '完成实验关，用数据支持结论',
  'boundary-explorer': '找到一个让方法失效的反例',
  reviser: '在失败之后修订并完成一关',
  transferer: '在 2 个完成的关卡拿到迁移印章',
};

function titleFor(summaries: readonly LevelSummary[], levelId: LevelId): string {
  for (const summary of summaries) {
    if (summary.id === levelId) return summary.title;
  }
  return levelId;
}

function validEvents(events: readonly EvidenceEvent[]): EvidenceEvent[] {
  const out: EvidenceEvent[] = [];
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    out.push(event);
  }
  return out;
}

interface Metrics {
  observeLevels: number;
  counterexamplePasses: number;
  completed: Set<LevelId>;
  revisedCompleted: number;
  transferCompleted: number;
}

function collectMetrics(save: SaveData, events: readonly EvidenceEvent[]): Metrics {
  const observeLevels = new Set<string>();
  let counterexamplePasses = 0;
  for (const event of validEvents(events)) {
    if (event.phase === 'observe' && typeof event.levelId === 'string' && event.levelId.length > 0) {
      observeLevels.add(event.levelId);
    }
    if (event.artifact?.kind === 'counterexample' && event.outcome === 'pass') counterexamplePasses += 1;
  }

  const levels: Record<LevelId, LevelProgress> = save && save.levels
    ? save.levels
    : ({} as Record<LevelId, LevelProgress>);
  const completed = new Set<LevelId>();
  let revisedCompleted = 0;
  let transferCompleted = 0;
  for (const level of Object.values(levels)) {
    if (level?.completed !== true) continue;
    completed.add(level.levelId);
    if ((level.lastOutcome?.revisionCount ?? 0) > 0) revisedCompleted += 1;
    if (Array.isArray(level.stamps) && level.stamps.includes('transfer')) transferCompleted += 1;
  }

  return {
    observeLevels: observeLevels.size,
    counterexamplePasses,
    completed,
    revisedCompleted,
    transferCompleted,
  };
}

function progressFor(id: BadgeId, metrics: Metrics): { current: number; target: number } {
  switch (id) {
    case 'observer':
      return { current: metrics.observeLevels, target: OBSERVE_TARGET };
    case 'boundary-explorer':
      return { current: metrics.counterexamplePasses > 0 ? 1 : 0, target: 1 };
    case 'reviser':
      return { current: metrics.revisedCompleted > 0 ? 1 : 0, target: 1 };
    case 'transferer':
      return { current: metrics.transferCompleted, target: TRANSFER_TARGET };
    default: {
      const levelId = LEVEL_BADGES[id];
      return { current: levelId && metrics.completed.has(levelId) ? 1 : 0, target: 1 };
    }
  }
}

export function evaluateBadges(
  save: SaveData,
  events: EvidenceEvent[],
  summaries: readonly LevelSummary[],
): BadgeView[] {
  const metrics = collectMetrics(save, events);
  const awards = save && save.badges ? save.badges : {};
  const views: BadgeView[] = [];

  for (const id of BADGE_IDS) {
    const progress = progressFor(id, metrics);
    const award = awards[id];
    const levelId = LEVEL_BADGES[id];
    const view: BadgeView = {
      id,
      earned: Boolean(award) || progress.current >= progress.target,
      title: TITLES[id],
      criteria: levelId ? '完成「' + titleFor(summaries, levelId) + '」' : CRITERIA[id],
      progress,
    };
    if (award && typeof award.awardedAt === 'number' && Number.isFinite(award.awardedAt)) {
      view.awardedAt = Math.trunc(award.awardedAt);
    }
    views.push(view);
  }

  return views;
}
