import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import type { BadgeId, LevelId, StampId, ToolId } from '@mmf/content/ids';
import { LEVEL_SUMMARIES } from '@mmf/content';
import type {
  BadgeAward,
  EvidenceEvent,
  JournalEntry,
  LevelProgress,
  SaveData,
  ToolUsage,
} from '@mmf/game-kit';
import {
  aggregate,
  buildEvidenceProfile,
  buildReport,
  buildTrail,
  emptyAggregate,
  evaluateBadges,
  parseReportPack,
  toReportPack,
} from './index';
import type { BadgeView, EvidenceProfile } from './types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

let seq = 0;

function nextSeq(): number {
  seq += 1;
  return seq;
}

/** 本地空档：不依赖 @mmf/progress，避免证据包测试引入反向依赖。 */
function emptySave(): SaveData {
  const levels = {} as Record<LevelId, LevelProgress>;
  for (const levelId of LEVEL_IDS) {
    levels[levelId] = {
      levelId,
      completed: false,
      completedVariants: [],
      stamps: [],
      attempts: 0,
      lastPlayedAt: null,
    };
  }
  const tools = {} as Record<ToolId, ToolUsage>;
  for (const tool of TOOL_IDS) tools[tool] = { uses: 0, lastUsedAt: null };
  return {
    schemaVersion: 1,
    updatedAt: NOW,
    profile: { id: 'local-default', nickname: '小工匠', startBand: 'k', createdAt: NOW },
    levels,
    tools,
    badges: {},
    journal: [],
  };
}

interface CompletionOptions {
  stamps?: StampId[];
  variants?: string[];
  revisionCount?: number;
}

function complete(save: SaveData, levelId: LevelId, options: CompletionOptions = {}): SaveData {
  const stamps = options.stamps ?? ['constraint'];
  const levels = { ...save.levels };
  levels[levelId] = {
    levelId,
    completed: true,
    completedVariants: options.variants ?? ['base'],
    stamps,
    attempts: 1,
    lastPlayedAt: NOW,
    lastOutcome: {
      at: NOW,
      stamps,
      failureClassesSeen: [],
      revisionCount: options.revisionCount ?? 0,
      materials: [],
    },
  };
  return { ...save, levels };
}

function withBadge(save: SaveData, id: BadgeId, awardedAt = NOW - 1000): SaveData {
  const award: BadgeAward = { awardedAt, evidenceRefs: [] };
  const badges = { ...save.badges };
  badges[id] = award;
  return { ...save, badges };
}

function withJournal(save: SaveData, count: number): SaveData {
  const journal: JournalEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    journal.push({
      id: 'journal-' + index,
      at: NOW - index * DAY,
      levelId: 'k-structure-pattern-path',
      variantId: 'base',
      stamps: [],
      toolIds: [],
      failureClasses: [],
      revisionCount: 0,
    });
  }
  return { ...save, journal };
}

function makeEvent(levelId: LevelId, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  const id = nextSeq();
  return {
    v: 1,
    id: 'ev-' + id,
    at: NOW + id * 1000,
    profileId: 'local-default',
    levelId,
    phase: 'observe',
    variantId: 'base',
    action: '看一格',
    ...overrides,
  };
}

function dimensionBand(profile: EvidenceProfile, id: string): number {
  const found = profile.dimensions.find((dimension) => dimension.id === id);
  return found ? found.band : -1;
}

function badgeById(badges: BadgeView[], id: BadgeId): BadgeView {
  const found = badges.find((badge) => badge.id === id);
  if (!found) throw new Error('缺少徽章：' + id);
  return found;
}

describe('buildEvidenceProfile', () => {
  it('空档：四维都在 0 档，推荐按顺序给出前 3 个未完成关卡', () => {
    const profile = buildEvidenceProfile(emptySave(), [], LEVEL_SUMMARIES, NOW);

    expect(profile.version).toBe(1);
    expect(profile.eventCount).toBe(0);
    expect(profile.toolUses).toEqual([]);
    expect(profile.dimensions.map((dimension) => dimension.id))
      .toEqual(['structure', 'rule', 'model', 'boundary']);
    for (const dimension of profile.dimensions) {
      expect(dimension.band).toBe(0);
      expect(dimension.summary.length).toBeGreaterThan(0);
      // 总结句只讲行为，不写分数 / 数字。
      expect(dimension.summary).not.toMatch(/[0-9]/);
      expect(dimension.signals.length).toBeGreaterThan(0);
    }
    expect(profile.recommendations).toHaveLength(3);
    expect(profile.recommendations.map((item) => item.levelId))
      .toEqual(['k-structure-pattern-path', 'k-data-tally', 'g13-algorithm-route']);
  });

  it('单关完成：结构到 3 档，规则仍是 0 档，推荐里不再出现这一关', () => {
    const save = complete(emptySave(), 'k-structure-pattern-path', {
      stamps: ['constraint', 'transfer'],
      revisionCount: 1,
    });
    const profile = buildEvidenceProfile(save, [], LEVEL_SUMMARIES, NOW);

    expect(dimensionBand(profile, 'structure')).toBe(3);
    expect(dimensionBand(profile, 'rule')).toBe(0);
    expect(dimensionBand(profile, 'model')).toBe(0);
    expect(dimensionBand(profile, 'boundary')).toBe(0);
    expect(profile.recommendations.some((item) => item.levelId === 'k-structure-pattern-path')).toBe(false);
  });

  it('模型维度逐档：调参 1 档、完成实验关 2 档、换过条件仍完成 3 档', () => {
    const knobEvents = [makeEvent('g79-modeling-dispatch', { tool: 'knob', phase: 'hypothesize' })];
    const one = buildEvidenceProfile(emptySave(), knobEvents, LEVEL_SUMMARIES, NOW);
    expect(dimensionBand(one, 'model')).toBe(1);

    const completed = complete(emptySave(), 'g79-modeling-dispatch');
    const two = buildEvidenceProfile(completed, [], LEVEL_SUMMARIES, NOW);
    expect(dimensionBand(two, 'model')).toBe(2);

    const varied = complete(emptySave(), 'g79-modeling-dispatch', {
      variants: ['base', 'second-seed'],
    });
    const three = buildEvidenceProfile(varied, [], LEVEL_SUMMARIES, NOW);
    expect(dimensionBand(three, 'model')).toBe(3);
  });

  it('全部 6 关完成：四维都到 3 档，推荐改为再做一次 / 换一种做法', () => {
    let save = emptySave();
    for (const summary of LEVEL_SUMMARIES) {
      save = complete(save, summary.id, {
        stamps: ['constraint', 'transfer'],
        variants: ['base', 'second-seed'],
        revisionCount: 1,
      });
    }
    const events = [
      makeEvent('g46-algorithm-payment', {
        phase: 'result',
        tool: 'counter',
        artifact: {
          id: 'counterexample',
          kind: 'counterexample',
          digest: 'digest',
          summary: '贪心在这里失效',
        },
        outcome: 'pass',
      }),
    ];
    const profile = buildEvidenceProfile(save, events, LEVEL_SUMMARIES, NOW);

    for (const dimension of profile.dimensions) expect(dimension.band).toBe(3);
    expect(profile.recommendations.map((item) => item.title)).toEqual(['再做一次', '换一种做法']);
    for (const item of profile.recommendations) expect(item.levelId).toBeUndefined();
  });

  it('工具次数来自事件，事件里没有的工具回落到存档', () => {
    let save = emptySave();
    save = { ...save, tools: { ...save.tools, pattern: { uses: 4, lastUsedAt: NOW } } };
    const events = [makeEvent('g79-modeling-dispatch', { tool: 'knob' })];
    const profile = buildEvidenceProfile(save, events, LEVEL_SUMMARIES, NOW);

    expect(profile.toolUses).toEqual([
      { tool: 'pattern', count: 4 },
      { tool: 'knob', count: 1 },
    ]);
  });
});

describe('evaluateBadges', () => {
  it('空档：9 枚徽章都未获得，目标与进度为 0', () => {
    const badges = evaluateBadges(emptySave(), [], LEVEL_SUMMARIES);
    expect(badges).toHaveLength(9);
    for (const badge of badges) {
      expect(badge.earned).toBe(false);
      expect(badge.awardedAt).toBeUndefined();
      expect(badge.criteria.length).toBeGreaterThan(0);
      expect(badge.title.length).toBeGreaterThan(0);
    }
    expect(badgeById(badges, 'observer').progress).toEqual({ current: 0, target: 2 });
    expect(badgeById(badges, 'transferer').progress).toEqual({ current: 0, target: 2 });
    expect(badgeById(badges, 'builder').progress).toEqual({ current: 0, target: 1 });
  });

  it('观察者：1 个关卡观察不够，2 个关卡才授予', () => {
    const oneLevel = [makeEvent('k-data-tally', { phase: 'observe' })];
    expect(badgeById(evaluateBadges(emptySave(), oneLevel, LEVEL_SUMMARIES), 'observer').earned).toBe(false);

    const twoLevels = [
      makeEvent('k-data-tally', { phase: 'observe' }),
      makeEvent('k-structure-pattern-path', { phase: 'observe' }),
    ];
    const observer = badgeById(evaluateBadges(emptySave(), twoLevels, LEVEL_SUMMARIES), 'observer');
    expect(observer.earned).toBe(true);
    expect(observer.progress).toEqual({ current: 2, target: 2 });
  });

  it('存档已授予的徽章优先，并带出 awardedAt', () => {
    const save = withBadge(emptySave(), 'boundary-explorer', NOW - 500);
    const badge = badgeById(evaluateBadges(save, [], LEVEL_SUMMARIES), 'boundary-explorer');
    expect(badge.earned).toBe(true);
    expect(badge.awardedAt).toBe(NOW - 500);
    expect(badge.progress.current).toBe(0);
  });

  it('边界探索者只认 outcome=pass 的反例产物', () => {
    const failed = [makeEvent('g46-algorithm-payment', {
      phase: 'result',
      artifact: { id: 'counterexample', kind: 'counterexample', digest: 'd', summary: '反例' },
      outcome: 'fail',
    })];
    expect(badgeById(evaluateBadges(emptySave(), failed, LEVEL_SUMMARIES), 'boundary-explorer').earned).toBe(false);

    const passed = [makeEvent('g46-algorithm-payment', {
      phase: 'result',
      artifact: { id: 'counterexample', kind: 'counterexample', digest: 'd', summary: '反例' },
      outcome: 'pass',
    })];
    expect(badgeById(evaluateBadges(emptySave(), passed, LEVEL_SUMMARIES), 'boundary-explorer').earned).toBe(true);
  });

  it('修订者看完成关卡的 revisionCount；迁移者要 2 个迁移印章', () => {
    const revised = complete(emptySave(), 'k-data-tally', { revisionCount: 2 });
    expect(badgeById(evaluateBadges(revised, [], LEVEL_SUMMARIES), 'reviser').earned).toBe(true);

    const untouched = complete(emptySave(), 'k-data-tally', { revisionCount: 0 });
    expect(badgeById(evaluateBadges(untouched, [], LEVEL_SUMMARIES), 'reviser').earned).toBe(false);

    let oneTransfer = complete(emptySave(), 'k-structure-pattern-path', {
      stamps: ['constraint', 'transfer'],
    });
    const first = badgeById(evaluateBadges(oneTransfer, [], LEVEL_SUMMARIES), 'transferer');
    expect(first.earned).toBe(false);
    expect(first.progress).toEqual({ current: 1, target: 2 });

    oneTransfer = complete(oneTransfer, 'g13-algorithm-route', { stamps: ['constraint', 'transfer'] });
    expect(badgeById(evaluateBadges(oneTransfer, [], LEVEL_SUMMARIES), 'transferer').earned).toBe(true);
  });

  it('完成关卡即授予对应徽章', () => {
    let save = emptySave();
    save = complete(save, 'k-structure-pattern-path');
    save = complete(save, 'g1012-modeling-winrate');
    const badges = evaluateBadges(save, [], LEVEL_SUMMARIES);

    expect(badgeById(badges, 'pattern-spotter').earned).toBe(true);
    expect(badgeById(badges, 'experimenter').earned).toBe(true);
    expect(badgeById(badges, 'builder').earned).toBe(false);
    expect(badgeById(badges, 'pattern-spotter').criteria).toBe('完成「模式修补匠」');
  });
});

describe('buildTrail', () => {
  it('空事件返回空数组', () => {
    expect(buildTrail(emptySave(), [], LEVEL_SUMMARIES)).toEqual([]);
  });

  it('按 at 升序，limit 只保留最近几条', () => {
    const events = [
      makeEvent('k-structure-pattern-path', { id: 'a', at: 300 }),
      makeEvent('k-structure-pattern-path', { id: 'b', at: 100 }),
      makeEvent('k-structure-pattern-path', { id: 'c', at: 200 }),
    ];
    const trail = buildTrail(emptySave(), events, LEVEL_SUMMARIES, 2);
    expect(trail.map((item) => item.id)).toEqual(['c', 'a']);
    expect(trail.map((item) => item.at)).toEqual([200, 300]);
  });

  it('默认最多 80 条，取的是最后 80 条', () => {
    const events: EvidenceEvent[] = [];
    for (let index = 0; index < 100; index += 1) {
      events.push(makeEvent('k-structure-pattern-path', { id: 'e' + index, at: 1000 + index }));
    }
    const trail = buildTrail(emptySave(), events, LEVEL_SUMMARIES);
    expect(trail).toHaveLength(80);
    expect(trail[0].id).toBe('e20');
    expect(trail[79].id).toBe('e99');
  });

  it('每条轨迹带中文关卡、阶段、工具、失败类与可读 label', () => {
    const events = [
      makeEvent('g79-modeling-dispatch', {
        phase: 'run',
        tool: 'knob',
        action: '把预算推到上限',
        outcome: 'fail',
        failureClass: 'g79-budget-over',
      }),
    ];
    const trail = buildTrail(emptySave(), events, LEVEL_SUMMARIES);
    expect(trail).toHaveLength(1);
    const item = trail[0];
    expect(item.title).toBe('城市调度员');
    expect(item.phaseLabel).toBe('运行');
    expect(item.tool).toBe('knob');
    expect(item.toolLabel).toBe('参数旋钮');
    expect(item.failureClass).toBe('g79-budget-over');
    expect(item.label).toContain('城市调度员');
    expect(item.label).toContain('运行');
    expect(item.label).toContain('把预算推到上限');
    expect(item.label).toContain('未通过：g79-budget-over');
  });

  it('limit 为 0 时返回空数组', () => {
    const events = [makeEvent('k-data-tally')];
    expect(buildTrail(emptySave(), events, LEVEL_SUMMARIES, 0)).toEqual([]);
  });
});

describe('buildReport', () => {
  it('隐私声明固定，不含正确率、刷题量或排名文案', () => {
    const report = buildReport(emptySave(), [], LEVEL_SUMMARIES, NOW);
    expect(report.privacyNote).toBe('数据只在本机，不含正确率、刷题量或排名。');
    const pack = toReportPack(report);
    const text = JSON.stringify(pack);
    expect(text).not.toContain('正确率');
    expect(text).not.toContain('刷题量');
    expect(text).not.toContain('排名');
  });

  it('工具使用来自事件，缺失时回落到存档次数', () => {
    let save = emptySave();
    save = { ...save, tools: { ...save.tools, pattern: { uses: 4, lastUsedAt: NOW } } };
    const fallback = buildReport(save, [], LEVEL_SUMMARIES, NOW);
    expect(fallback.tools).toEqual([{ tool: 'pattern', label: '模式卡', uses: 4 }]);

    const events = [
      makeEvent('g79-modeling-dispatch', { tool: 'knob' }),
      makeEvent('g79-modeling-dispatch', { tool: 'knob' }),
      makeEvent('g79-modeling-dispatch', { tool: 'knob' }),
      makeEvent('g79-modeling-dispatch', { tool: 'knob' }),
      makeEvent('g79-modeling-dispatch', { tool: 'knob' }),
    ];
    const mixed = buildReport(save, events, LEVEL_SUMMARIES, NOW);
    expect(mixed.tools).toEqual([
      { tool: 'knob', label: '参数旋钮', uses: 5 },
      { tool: 'pattern', label: '模式卡', uses: 4 },
    ]);
  });

  it('关卡表覆盖 6 个已发布关卡，并带印章、变体数与最近游玩时间', () => {
    const save = complete(emptySave(), 'g46-algorithm-payment', {
      stamps: ['constraint', 'transfer'],
      variants: ['base', 'mirror'],
    });
    const report = buildReport(save, [], LEVEL_SUMMARIES, NOW);

    expect(report.levels).toHaveLength(LEVEL_SUMMARIES.length);
    expect(report.levels.map((row) => row.levelId)).toEqual(LEVEL_SUMMARIES.map((summary) => summary.id));
    const payment = report.levels.find((row) => row.levelId === 'g46-algorithm-payment');
    expect(payment).toEqual({
      levelId: 'g46-algorithm-payment',
      title: '最少枚数支付',
      completed: true,
      stamps: ['constraint', 'transfer'],
      lastPlayedAt: NOW,
      variantCount: 2,
    });
    const untouched = report.levels.find((row) => row.levelId === 'k-data-tally');
    expect(untouched?.completed).toBe(false);
    expect(untouched?.lastPlayedAt).toBeNull();
  });

  it('periodDays 按最早记录到 now 取整，并按 7 天封顶', () => {
    const threeDaysAgo = { ...emptySave(), profile: { ...emptySave().profile, createdAt: NOW - 3 * DAY } };
    expect(buildReport(threeDaysAgo, [], LEVEL_SUMMARIES, NOW).periodDays).toBe(3);

    const longAgo = { ...emptySave(), profile: { ...emptySave().profile, createdAt: NOW - 30 * DAY } };
    expect(buildReport(longAgo, [], LEVEL_SUMMARIES, NOW).periodDays).toBe(7);

    expect(buildReport(emptySave(), [], LEVEL_SUMMARIES, NOW).periodDays).toBe(1);
  });

  it('昵称、日志数与事件数都写进报告', () => {
    const save = withJournal(emptySave(), 4);
    const events = [makeEvent('k-data-tally'), makeEvent('k-data-tally')];
    const report = buildReport(save, events, LEVEL_SUMMARIES, NOW);

    expect(report.nickname).toBe('小工匠');
    expect(report.totalJournal).toBe(4);
    expect(report.totalEvents).toBe(2);
    expect(report.generatedAt).toBe(NOW);
    expect(report.dimensions).toHaveLength(4);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe('toReportPack', () => {
  it('导出包只含短字段，推荐不带 levelId', () => {
    let save = complete(emptySave(), 'k-structure-pattern-path', {
      stamps: ['constraint', 'transfer'],
    });
    save = withBadge(save, 'pattern-spotter');
    const report = buildReport(save, [], LEVEL_SUMMARIES, NOW);
    const pack = toReportPack(report);

    expect(pack.version).toBe(1);
    expect(pack.generatedAt).toBe(NOW);
    expect(pack.nickname).toBe('小工匠');
    expect(pack.tools).toEqual([]);
    expect(pack.levels).toHaveLength(LEVEL_SUMMARIES.length);
    expect(pack.levels[0]).toEqual({
      id: 'k-structure-pattern-path',
      title: '模式修补匠',
      completed: true,
      stamps: ['constraint', 'transfer'],
    });
    expect(pack.dimensions).toHaveLength(4);
    for (const dimension of pack.dimensions) {
      expect(Object.keys(dimension).sort()).toEqual(['band', 'id', 'summary']);
      expect(typeof dimension.band).toBe('number');
    }
    expect(pack.recommendations.length).toBeGreaterThan(0);
    for (const recommendation of pack.recommendations) {
      expect(Object.keys(recommendation).sort()).toEqual(['reason', 'title']);
    }
  });
});

describe('aggregate（保留原有行为）', () => {
  it('空聚合把 6 件工具清零', () => {
    const empty = emptyAggregate();
    expect(empty.total).toBe(0);
    for (const tool of TOOL_IDS) expect(empty.byTool[tool]).toBe(0);
    expect(empty.lastAggregatedAt).toBe(0);
  });

  it('按关卡、工具、阶段、失败类计数，并取最大 at', () => {
    const events = [
      makeEvent('k-data-tally', { tool: 'probe', phase: 'observe', at: 10 }),
      makeEvent('k-data-tally', {
        tool: 'probe',
        phase: 'run',
        failureClass: 'tally-mismatch',
        at: 30,
      }),
      makeEvent('g79-modeling-dispatch', { tool: 'knob', phase: 'run', at: 20 }),
    ];
    const result = aggregate(events);
    expect(result.total).toBe(3);
    expect(result.byLevel['k-data-tally']).toBe(2);
    expect(result.byLevel['g79-modeling-dispatch']).toBe(1);
    expect(result.byTool.probe).toBe(2);
    expect(result.byTool.knob).toBe(1);
    expect(result.byPhase.observe).toBe(1);
    expect(result.byPhase.run).toBe(2);
    expect(result.byFailure['tally-mismatch']).toBe(1);
    expect(result.lastAggregatedAt).toBe(30);
  });

  it('parses a valid report pack and rejects malformed ones', () => {
    const save = emptySave();
    const report = buildReport(save, [], LEVEL_SUMMARIES, 1234);
    const pack = toReportPack(report);
    expect(parseReportPack(pack)).not.toBeNull();
    expect(parseReportPack({ ...pack, version: 2 })).toBeNull();
    expect(parseReportPack(null)).toBeNull();
    expect(parseReportPack({ ...pack, tools: 'oops' })).not.toBeNull();
  });
});
