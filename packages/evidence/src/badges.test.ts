import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import type { LevelId, ToolId } from '@mmf/content/ids';
import { LEVEL_SUMMARIES } from '@mmf/content';
import type { EvidenceEvent, LevelProgress, SaveData, ToolUsage } from '@mmf/game-kit';
import { evaluateBadges } from './badges';
import type { BadgeView } from './types';

const NOW = 1_700_000_000_000;
let seq = 0;

/** 本地空档：不依赖 @mmf/progress（依赖图见 docs/02 §3.1）。 */
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

function complete(save: SaveData, levelId: LevelId, attempts = 1, stamps: string[] = []): SaveData {
  const levels = { ...save.levels };
  levels[levelId] = {
    levelId,
    completed: true,
    completedVariants: ['base'],
    stamps: stamps as LevelProgress['stamps'],
    attempts,
    lastPlayedAt: NOW,
    lastOutcome: {
      at: NOW,
      stamps: stamps as LevelProgress['stamps'],
      failureClassesSeen: [],
      revisionCount: 0,
      materials: [],
    },
  };
  return { ...save, levels };
}

function event(levelId: LevelId, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  seq += 1;
  return {
    v: 1,
    id: 'ev-' + seq,
    at: NOW + seq * 1000,
    profileId: 'local-default',
    levelId,
    phase: 'observe',
    variantId: 'base',
    action: '看一格',
    ...overrides,
  };
}

function badgeById(badges: BadgeView[], id: BadgeView['id']): BadgeView {
  const found = badges.find((badge) => badge.id === id);
  if (!found) throw new Error('缺少徽章：' + id);
  return found;
}

describe('evaluateBadges：A9 反例（徽章不能只看通关次数）', () => {
  it('同一关反复通关 9 次，不授予观察者、迁移者或任何证据类徽章', () => {
    const save = complete(emptySave(), 'k-data-tally', 9, ['constraint', 'transfer']);
    const badges = evaluateBadges(save, [], LEVEL_SUMMARIES);

    expect(badgeById(badges, 'observer').earned).toBe(false);
    expect(badgeById(badges, 'observer').progress).toEqual({ current: 0, target: 2 });
    // 同一次通关的 transfer 印章只算一个关卡，不能靠重复通关凑数。
    expect(badgeById(badges, 'transferer').earned).toBe(false);
    expect(badgeById(badges, 'transferer').progress).toEqual({ current: 1, target: 2 });
  });

  it('没有观察事件时，即使通关很多关也不授予观察者', () => {
    let save = emptySave();
    save = complete(save, 'k-structure-pattern-path', 3);
    save = complete(save, 'k-data-tally', 3);
    save = complete(save, 'g13-algorithm-route', 3);
    expect(badgeById(evaluateBadges(save, [], LEVEL_SUMMARIES), 'observer').earned).toBe(false);
  });

  it('观察事件只按关卡去重：同一关两条观察事件仍算 1 个关卡', () => {
    const events = [
      event('k-data-tally', { phase: 'observe' }),
      event('k-data-tally', { phase: 'observe' }),
    ];
    const observer = badgeById(evaluateBadges(emptySave(), events, LEVEL_SUMMARIES), 'observer');
    expect(observer.earned).toBe(false);
    expect(observer.progress).toEqual({ current: 1, target: 2 });
  });
});

describe('evaluateBadges：授予规则与幂等', () => {
  it('存档已授予的徽章优先，带上 awardedAt 且不因证据清空而倒退', () => {
    const save = emptySave();
    save.badges['boundary-explorer'] = { awardedAt: NOW - 500, evidenceRefs: ['ev-old'] };
    const badge = badgeById(evaluateBadges(save, [], LEVEL_SUMMARIES), 'boundary-explorer');

    expect(badge.earned).toBe(true);
    expect(badge.awardedAt).toBe(NOW - 500);
    expect(badge.progress.current).toBe(0);
  });

  it('重复计算是纯函数：两次结果深相等，且不改存档', () => {
    const save = complete(emptySave(), 'k-structure-pattern-path', 1, ['constraint', 'transfer']);
    const snapshot = JSON.stringify(save);

    const first = evaluateBadges(save, [], LEVEL_SUMMARIES);
    const second = evaluateBadges(save, [], LEVEL_SUMMARIES);

    expect(second).toEqual(first);
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('边界探索者只认 outcome=pass 的反例产物，失败反例不授予', () => {
    const artifact = {
      id: 'counterexample',
      kind: 'counterexample' as const,
      digest: 'd',
      summary: '贪心失效',
    };
    const failed = [event('g46-algorithm-payment', { artifact, outcome: 'fail' })];
    const passed = [event('g46-algorithm-payment', { artifact, outcome: 'pass' })];

    expect(badgeById(evaluateBadges(emptySave(), failed, LEVEL_SUMMARIES), 'boundary-explorer').earned).toBe(false);
    expect(badgeById(evaluateBadges(emptySave(), passed, LEVEL_SUMMARIES), 'boundary-explorer').earned).toBe(true);
  });

  it('事件数组里的坏行只跳过自己，不抛错', () => {
    const events = [
      null,
      { id: 'broken', phase: 'observe' },
      event('k-data-tally', { phase: 'observe' }),
    ] as unknown as EvidenceEvent[];
    const observer = badgeById(evaluateBadges(emptySave(), events, LEVEL_SUMMARIES), 'observer');
    expect(observer.progress.current).toBe(1);
  });

  it('locale=en 时标题与条件用英文，关卡条件带英文关卡名', () => {
    const save = complete(emptySave(), 'k-structure-pattern-path');
    const badges = evaluateBadges(save, [], LEVEL_SUMMARIES, 'en');
    const spotter = badgeById(badges, 'pattern-spotter');
    const observer = badgeById(badges, 'observer');

    expect(spotter.title).toBe('Pattern Spotter');
    expect(spotter.criteria).toBe('Complete "Pattern Tinkerer"');
    expect(observer.title).toBe('Observer');
    expect(observer.criteria).toBe('Leave observation records in at least 2 levels.');
  });

  it('默认中文：标题与 cond 不发散，关卡条件用中文关卡名', () => {
    const badges = evaluateBadges(emptySave(), [], LEVEL_SUMMARIES);
    expect(badgeById(badges, 'observer').title).toBe('观察者');
    expect(badgeById(badges, 'pattern-spotter').criteria).toBe('完成「模式修补匠」');
  });
});
