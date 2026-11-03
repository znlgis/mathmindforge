import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import { SAVE_SCHEMA_VERSION, emptySave, migrate } from './save';

const LEVEL_ID = 'k-structure-pattern-path' as const;
const NOW = 1_700_000_000_000;

describe('migrate 的字段级 sanitize', () => {
  it('坏字段只丢自己：同一关的其他字段与其他关都保留', () => {
    const migrated = migrate(
      {
        schemaVersion: 1,
        updatedAt: 'yesterday',
        profile: { nickname: '  ', startBand: 'not-a-band', createdAt: 'x' },
        levels: {
          [LEVEL_ID]: {
            completed: true,
            completedVariants: ['base', '', 42, 'base'],
            stamps: ['constraint', 'not-a-stamp', 'constraint'],
            attempts: -3,
            lastPlayedAt: 'later',
            lastOutcome: { at: 5, stamps: ['transfer', 'nope'], revisionCount: -2 },
          },
          'g13-algorithm-route': {
            completed: false,
            attempts: 4,
            lastPlayedAt: 9,
          },
        },
        tools: {
          pattern: { uses: 2, lastUsedAt: 6, lastArtifact: { kind: 'program', summary: '跑了' } },
          rule: { uses: 'many', lastUsedAt: -1, lastArtifact: { kind: '', summary: '坏产物' } },
        },
        badges: { observer: { awardedAt: 7, evidenceRefs: ['ev-1', ''] } },
        journal: [],
      },
      NOW,
    );

    expect(migrated.updatedAt).toBe(NOW);
    expect(migrated.profile).toEqual({
      id: 'local-default',
      nickname: '小工匠',
      startBand: 'k',
      createdAt: NOW,
    });
    expect(migrated.levels[LEVEL_ID]).toMatchObject({
      completed: true,
      completedVariants: ['base'],
      stamps: ['constraint'],
      attempts: 0,
      lastPlayedAt: null,
      lastOutcome: { at: 5, stamps: ['transfer'], revisionCount: 0 },
    });
    expect(migrated.levels['g13-algorithm-route']).toMatchObject({
      completed: false,
      attempts: 4,
      lastPlayedAt: 9,
    });
    expect(migrated.tools.pattern).toEqual({
      uses: 2,
      lastUsedAt: 6,
      lastArtifact: { kind: 'program', summary: '跑了' },
    });
    expect(migrated.tools.rule).toEqual({ uses: 0, lastUsedAt: null });
    expect(migrated.badges.observer).toEqual({ awardedAt: 7, evidenceRefs: ['ev-1'] });
  });

  it('未知关卡 key 被忽略，缺失关卡补空档', () => {
    const migrated = migrate(
      {
        levels: {
          'not-a-level': { completed: true, attempts: 9 },
          [LEVEL_ID]: { completed: true, attempts: 1 },
        },
      },
      NOW,
    );

    expect(Object.keys(migrated.levels).sort()).toEqual([...LEVEL_IDS].sort());
    expect(migrated.levels[LEVEL_ID].attempts).toBe(1);
    expect((migrated.levels as Record<string, unknown>)['not-a-level']).toBeUndefined();
  });

  it('未知徽章与坏授予被丢弃，其他徽章保留', () => {
    const migrated = migrate(
      {
        badges: {
          observer: { awardedAt: 3, evidenceRefs: [] },
          'not-a-badge': { awardedAt: 4, evidenceRefs: [] },
          builder: { awardedAt: 'x', evidenceRefs: [] },
        },
      },
      NOW,
    );

    expect(Object.keys(migrated.badges)).toEqual(['observer']);
    expect(migrated.badges).not.toHaveProperty('not-a-badge');
  });

  it('坏日志条目整条丢弃，好条目按时间升序保留', () => {
    const migrated = migrate(
      {
        journal: [
          { at: 3, levelId: LEVEL_ID, variantId: 'b' },
          { at: 'yesterday', levelId: LEVEL_ID },
          { at: 1, levelId: 'not-a-level' },
          { at: 2, levelId: LEVEL_ID, variantId: '', stamps: ['constraint', 'x'] },
        ],
      },
      NOW,
    );

    expect(migrated.journal.map((entry) => entry.at)).toEqual([2, 3]);
    expect(migrated.journal[0].variantId).toBe('');
    expect(migrated.journal[0].stamps).toEqual(['constraint']);
    expect(migrated.journal[1].id).toMatch(/^journal-/);
  });

  it('日志最多保留最近 120 条，并截断到 80 字', () => {
    const journal = [];
    for (let index = 0; index < 130; index += 1) {
      journal.push({
        at: index + 1,
        levelId: LEVEL_ID,
        variantId: 'base',
        note: '字'.repeat(100),
      });
    }
    const migrated = migrate({ journal }, NOW);

    expect(migrated.journal).toHaveLength(120);
    expect(migrated.journal[0].at).toBe(11);
    expect(migrated.journal[119].at).toBe(130);
    expect(Array.from(migrated.journal[0].note ?? '')).toHaveLength(80);
  });

  it('昵称截断到 12 字，且不劈开 emoji', () => {
    const long = migrate({ profile: { nickname: '小明'.repeat(20) } }, NOW);
    expect(Array.from(long.profile.nickname)).toHaveLength(12);

    const emoji = migrate({ profile: { nickname: '😀'.repeat(30) } }, NOW);
    expect(Array.from(emoji.profile.nickname)).toHaveLength(12);
    expect(emoji.profile.nickname).toBe('😀'.repeat(12));
  });
});

describe('migrate 的版本与输入容错', () => {
  it('缺 schemaVersion 视为旧档：只补字段，不清空已有关卡进度', () => {
    const migrated = migrate(
      { levels: { [LEVEL_ID]: { completed: true, attempts: 2 } } },
      NOW,
    );
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.levels[LEVEL_ID].completed).toBe(true);
    expect(migrated.levels[LEVEL_ID].attempts).toBe(2);
  });

  it('来自未来版本的存档整体回空档', () => {
    const future = migrate(
      { schemaVersion: SAVE_SCHEMA_VERSION + 1, levels: { [LEVEL_ID]: { completed: true } } },
      42,
    );
    expect(future).toEqual(emptySave(42));
  });

  it('历史实现把存档写成 JSON 字符串时也能读', () => {
    const raw = JSON.stringify({ levels: { [LEVEL_ID]: { completed: true } } });
    const migrated = migrate(raw, NOW);
    expect(migrated.levels[LEVEL_ID].completed).toBe(true);
  });

  it('坏 JSON / 数组 / 原始类型一律回空档且不抛错', () => {
    for (const input of ['not json', '[1,2]', 42, null, undefined, true]) {
      expect(migrate(input, 42)).toEqual(emptySave(42));
    }
  });

  it('结构奇怪的旧档不抛错，坏容器按空容器处理', () => {
    const migrated = migrate(
      {
        schemaVersion: 0,
        levels: [],
        tools: null,
        badges: 'oops',
        journal: { not: 'an array' },
        profile: [],
      },
      42,
    );
    expect(migrated.levels[LEVEL_ID]).toMatchObject({ completed: false, attempts: 0 });
    expect(migrated.tools.pattern).toEqual({ uses: 0, lastUsedAt: null });
    expect(migrated.badges).toEqual({});
    expect(migrated.journal).toEqual([]);
    expect(migrated.profile.nickname).toBe('小工匠');
  });

  it('空档覆盖全部 20 关与 6 件工具', () => {
    const save = emptySave(NOW);
    expect(Object.keys(save.levels)).toHaveLength(LEVEL_IDS.length);
    expect(Object.keys(save.tools).sort()).toEqual([...TOOL_IDS].sort());
    expect(save.updatedAt).toBe(NOW);
  });
});
