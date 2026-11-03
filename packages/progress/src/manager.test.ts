import { describe, expect, it } from 'vitest';
import type { LevelId, StampId, ToolId } from '@mmf/content/ids';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import type {
  EvidenceAggregate,
  EvidenceDraft,
  EvidenceEvent,
  EvidenceRecord,
  EvidenceStore,
  ProgressStore,
  SaveData,
} from '@mmf/game-kit';
import { ProgressManager } from './manager';
import { SAVE_SCHEMA_VERSION, emptySave, migrate } from './save';

const LEVEL_ID = 'k-structure-pattern-path' as const;
const STARTED_AT = 1_700_000_000_000;

function makeAggregate(): EvidenceAggregate {
  const byTool = {} as Record<ToolId, number>;
  for (const tool of TOOL_IDS) byTool[tool] = 0;
  return { total: 0, byLevel: {}, byTool, byPhase: {}, byFailure: {}, lastAggregatedAt: 0 };
}

/** 内存版 ProgressStore：记录写入次数，方便断言"该存的时候存了"。 */
class MemoryProgressStore implements ProgressStore {
  raw: unknown = null;
  readonly writes: SaveData[] = [];
  reads = 0;

  async load(): Promise<unknown> {
    this.reads += 1;
    return this.raw;
  }

  async save(data: SaveData): Promise<void> {
    const copy = JSON.parse(JSON.stringify(data)) as SaveData;
    this.raw = copy;
    this.writes.push(copy);
  }
}

/** 内存版 EvidenceStore：append-only 语义，clear 计数。 */
class MemoryEvidenceStore implements EvidenceStore {
  events: EvidenceEvent[] = [];
  record: EvidenceRecord | null = null;
  aggregate: EvidenceAggregate = makeAggregate();
  clearCount = 0;
  lastRecentLimit = 0;

  async append(events: EvidenceEvent[]): Promise<void> {
    this.events.push(...events.map((event) => ({ ...event })));
    this.record = { version: 1, events: [...this.events] };
  }

  async recent(limit: number): Promise<EvidenceEvent[]> {
    this.lastRecentLimit = limit;
    return [...this.events].slice(-Math.max(0, limit)).reverse();
  }

  async loadRecord(): Promise<EvidenceRecord | null> {
    return this.record;
  }

  async loadAggregate(): Promise<EvidenceAggregate> {
    return this.aggregate;
  }

  async saveAggregate(agg: EvidenceAggregate): Promise<void> {
    this.aggregate = agg;
  }

  async clear(): Promise<void> {
    this.events = [];
    this.record = null;
    this.aggregate = makeAggregate();
    this.clearCount += 1;
  }
}

/** 第一次写盘会失败的 store：模拟配额满 / 隐私模式。 */
class FlakyProgressStore extends MemoryProgressStore {
  failures = 0;

  override async save(data: SaveData): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('quota exceeded');
    }
    await super.save(data);
  }
}

/** 首次通关那次写盘很慢：用来验证并发通关时落盘顺序不会倒退。 */
class SlowFirstCompletionStore extends MemoryProgressStore {
  override async save(data: SaveData): Promise<void> {
    if (data.levels[LEVEL_ID].attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await super.save(data);
  }
}

interface Harness {
  progress: MemoryProgressStore;
  evidence: MemoryEvidenceStore;
  manager: ProgressManager;
  setNow: (value: number) => void;
}

function createHarness(
  startedAt = STARTED_AT,
  makeProgress: () => MemoryProgressStore = () => new MemoryProgressStore(),
): Harness {
  const progress = makeProgress();
  const evidence = new MemoryEvidenceStore();
  let now = startedAt;
  const manager = new ProgressManager(progress, evidence, () => now);
  return {
    progress,
    evidence,
    manager,
    setNow: (value: number) => {
      now = value;
    },
  };
}

function makeEvent(id: string, levelId: LevelId, at: number): EvidenceEvent {
  return {
    v: 1,
    id,
    at,
    profileId: 'local-default',
    levelId,
    phase: 'observe',
    variantId: 'base',
    action: '看一格',
  };
}

describe('ProgressManager', () => {
  it('init 从空档生成 20 关 × 6 工具的完整存档并回写一次', async () => {
    const { progress, manager } = createHarness();
    const save = await manager.init();

    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(save.updatedAt).toBe(STARTED_AT);
    expect(save.profile).toEqual({
      id: 'local-default',
      nickname: '小工匠',
      startBand: 'k',
      createdAt: STARTED_AT,
    });
    expect(Object.keys(save.levels).sort()).toEqual([...LEVEL_IDS].sort());
    for (const levelId of LEVEL_IDS) {
      expect(save.levels[levelId]).toMatchObject({
        levelId,
        completed: false,
        completedVariants: [],
        stamps: [],
        attempts: 0,
        lastPlayedAt: null,
      });
    }
    expect(Object.keys(save.tools).sort()).toEqual([...TOOL_IDS].sort());
    for (const toolId of TOOL_IDS) {
      expect(save.tools[toolId]).toEqual({ uses: 0, lastUsedAt: null });
    }
    expect(save.badges).toEqual({});
    expect(save.journal).toEqual([]);
    expect(progress.writes).toHaveLength(1);
  });

  it('init 是 single-flight：并发调用只读一次盘', async () => {
    const { progress, manager } = createHarness();
    const [first, second] = await Promise.all([manager.init(), manager.init()]);

    expect(progress.reads).toBe(1);
    expect(first).toEqual(second);
  });

  it('completeLevel 写通关、工具用量与日志，并持久化', async () => {
    const { progress, manager, setNow } = createHarness();
    await manager.init();
    const completedAt = STARTED_AT + 5_000;
    setNow(completedAt);

    const save = await manager.completeLevel({
      levelId: LEVEL_ID,
      variantId: 'base',
      stamps: ['constraint', 'simple'],
      failureClassesSeen: ['step-overshoot', 'step-overshoot'],
      revisionCount: 2,
      toolIds: ['pattern', 'rule'],
      durationMs: 1_234,
    });

    const level = save.levels[LEVEL_ID];
    expect(level.completed).toBe(true);
    expect(level.completedVariants).toEqual(['base']);
    expect(level.stamps).toEqual(['constraint', 'simple']);
    expect(level.attempts).toBe(1);
    expect(level.lastPlayedAt).toBe(completedAt);
    expect(level.lastOutcome).toEqual({
      at: completedAt,
      stamps: ['constraint', 'simple'],
      failureClassesSeen: ['step-overshoot'],
      revisionCount: 2,
      materials: [],
    });
    expect(save.tools.pattern).toEqual({ uses: 1, lastUsedAt: completedAt });
    expect(save.tools.rule.uses).toBe(1);
    expect(save.tools.knob).toEqual({ uses: 0, lastUsedAt: null });
    expect(save.journal).toHaveLength(1);
    expect(save.journal[0]).toMatchObject({
      levelId: LEVEL_ID,
      variantId: 'base',
      stamps: ['constraint', 'simple'],
      toolIds: ['pattern', 'rule'],
      failureClasses: ['step-overshoot'],
      revisionCount: 2,
      at: completedAt,
    });
    expect(save.updatedAt).toBe(completedAt);
    expect(progress.writes).toHaveLength(2);
    expect(progress.raw).toEqual(save);

    // 第二次通关：尝试数递增、变体合并、印章并集、日志追加
    setNow(completedAt + 1_000);
    const second = await manager.completeLevel({
      levelId: LEVEL_ID,
      variantId: 'transfer-a',
      stamps: ['transfer'],
      failureClassesSeen: [],
      revisionCount: 0,
      toolIds: ['pattern'],
      durationMs: 800,
    });
    expect(second.levels[LEVEL_ID].attempts).toBe(2);
    expect(second.levels[LEVEL_ID].completedVariants).toEqual(['base', 'transfer-a']);
    expect(second.levels[LEVEL_ID].stamps).toEqual(['constraint', 'simple', 'transfer']);
    expect(second.journal).toHaveLength(2);
    expect(second.tools.pattern.uses).toBe(2);
  });

  it('recordEvidence 补齐 id/at/profileId/levelId/revision 后追加', async () => {
    const { evidence, manager, setNow } = createHarness();
    await manager.init();
    const recordedAt = STARTED_AT + 2_000;
    setNow(recordedAt);

    await manager.recordEvidence(LEVEL_ID, [
      {
        phase: 'observe',
        variantId: 'base',
        action: 'pattern/inspect',
        tool: 'pattern',
        outcome: 'info',
      },
      {
        phase: 'run',
        variantId: 'base',
        action: 'run',
        failureClass: 'step-overshoot',
        outcome: 'fail',
      },
    ]);

    expect(evidence.events).toHaveLength(2);
    const [first, second] = evidence.events;
    expect(first).toMatchObject({
      v: 1,
      at: recordedAt,
      profileId: 'local-default',
      levelId: LEVEL_ID,
      phase: 'observe',
      action: 'pattern/inspect',
      tool: 'pattern',
      revision: 0,
    });
    expect(first.id).toBe(`ev-${recordedAt}-0`);
    expect(second.id).toBe(`ev-${recordedAt}-1`);
    expect(first.id).not.toBe(second.id);
    expect(evidence.record?.version).toBe(1);
    expect(evidence.record?.events).toHaveLength(2);
  });

  it('clear 清空存档与证据，回到空档', async () => {
    const { progress, evidence, manager, setNow } = createHarness();
    await manager.init();
    setNow(STARTED_AT + 3_000);
    await manager.completeLevel({
      levelId: LEVEL_ID,
      variantId: 'base',
      stamps: ['constraint'],
      failureClassesSeen: [],
      revisionCount: 1,
      toolIds: ['pattern'],
      durationMs: 1_000,
    });
    await manager.recordEvidence(LEVEL_ID, [
      { phase: 'result', variantId: 'base', action: 'submit', outcome: 'pass' },
    ]);

    const clearedAt = STARTED_AT + 4_000;
    setNow(clearedAt);
    const cleared = await manager.clear();

    expect(cleared).toEqual(emptySave(clearedAt));
    expect(cleared.levels[LEVEL_ID].completed).toBe(false);
    expect(cleared.journal).toEqual([]);
    expect(progress.raw).toEqual(emptySave(clearedAt));
    expect(evidence.events).toEqual([]);
    expect(evidence.clearCount).toBe(1);
  });
});

describe('ProgressManager 健壮性与并发', () => {
  it('写盘失败不打断通关：仍更新内存快照，后续写盘继续尝试', async () => {
    const progress = new FlakyProgressStore();
    progress.failures = 1;
    const { manager, setNow } = createHarness(STARTED_AT, () => progress);
    // 首次 init 的回写就失败：init 不能因此 reject（读档失败按空档继续）。
    await expect(manager.init()).resolves.toBeDefined();
    expect(progress.raw).toBeNull();

    // 通关时的写盘也失败：快照照常更新，不向调用方抛错。
    progress.failures = 1;
    setNow(STARTED_AT + 1_000);
    const save = await manager.completeLevel({
      levelId: LEVEL_ID,
      variantId: 'base',
      stamps: ['constraint'],
      failureClassesSeen: [],
      revisionCount: 0,
      toolIds: ['pattern'],
      durationMs: 0,
    });
    expect(save.levels[LEVEL_ID].completed).toBe(true);
    expect(progress.raw).toBeNull();

    // 写盘恢复后，磁盘追上内存（含上一关的进度）。
    setNow(STARTED_AT + 2_000);
    const second = await manager.completeLevel({
      levelId: 'g13-algorithm-route',
      variantId: 'base',
      stamps: [],
      failureClassesSeen: [],
      revisionCount: 0,
      toolIds: [],
      durationMs: 0,
    });
    expect(second.levels[LEVEL_ID].completed).toBe(true);
    expect(progress.raw).toEqual(second);
  });

  it('未知关卡 id 不写存档、不写日志；运行时的脏输入被清洗', async () => {
    const { progress, evidence, manager } = createHarness();
    await manager.init();
    const before = manager.snapshot();
    const writes = progress.writes.length;

    const unknown = await manager.completeLevel({
      levelId: 'not-a-level' as LevelId,
      variantId: 'base',
      stamps: [],
      failureClassesSeen: [],
      revisionCount: 0,
      toolIds: [],
      durationMs: 0,
    });
    expect(unknown).toEqual(before);
    expect(progress.writes).toHaveLength(writes);

    const messy = await manager.completeLevel({
      levelId: LEVEL_ID,
      variantId: '   ',
      stamps: ['constraint', 'not-a-stamp' as StampId],
      failureClassesSeen: ['', 'x'],
      revisionCount: Number.NaN,
      toolIds: ['pattern', 'saw' as ToolId],
      durationMs: 0,
    });
    expect(messy.levels[LEVEL_ID].completedVariants).toEqual(['base']);
    expect(messy.levels[LEVEL_ID].stamps).toEqual(['constraint']);
    expect(messy.levels[LEVEL_ID].lastOutcome?.failureClassesSeen).toEqual(['x']);
    expect(messy.levels[LEVEL_ID].lastOutcome?.revisionCount).toBe(0);
    expect(messy.tools.pattern.uses).toBe(1);
    expect(messy.tools.rule.uses).toBe(0);

    await manager.recordEvidence('not-a-level' as LevelId, [
      { phase: 'observe', variantId: 'base', action: 'x' },
    ]);
    expect(evidence.events).toHaveLength(0);
  });

  it('并发 completeLevel 不丢更新：两次都记进内存，落盘顺序不倒退', async () => {
    const { progress, manager, setNow } = createHarness(STARTED_AT, () => new SlowFirstCompletionStore());
    await manager.init();
    setNow(STARTED_AT + 1_000);

    const input = {
      levelId: LEVEL_ID,
      variantId: 'base',
      stamps: ['constraint' as StampId],
      failureClassesSeen: [] as string[],
      revisionCount: 1,
      toolIds: ['pattern' as ToolId],
      durationMs: 0,
    };
    await Promise.all([manager.completeLevel(input), manager.completeLevel(input)]);

    const snapshot = manager.snapshot();
    expect(snapshot.levels[LEVEL_ID].attempts).toBe(2);
    expect(snapshot.journal).toHaveLength(2);
    expect(snapshot.tools.pattern.uses).toBe(2);
    // 慢的第一次写盘不能把最后落盘的存档覆盖回 attempts=1。
    expect(progress.raw).toEqual(snapshot);
    expect(progress.writes[progress.writes.length - 1].levels[LEVEL_ID].attempts).toBe(2);
  });

  it('refreshBadges 按时间倒序取最新证据作引用，重复调用是幂等的', async () => {
    const { evidence, manager, setNow } = createHarness();
    await manager.init();
    // 25 条观察事件，跨两关（观察者要求 2 关）。
    for (let index = 0; index < 25; index += 1) {
      evidence.events.push(
        makeEvent('ev-' + index, index % 2 === 0 ? LEVEL_ID : 'k-data-tally', STARTED_AT + index),
      );
    }
    setNow(STARTED_AT + 10_000);

    const first = await manager.refreshBadges();
    expect(first).toContain('observer');
    expect(evidence.lastRecentLimit).toBe(3000);

    const save = manager.snapshot();
    const refs = save.badges.observer?.evidenceRefs ?? [];
    expect(refs).toHaveLength(20);
    // 最新在前：引用应从 ev-24 开始（而不是窗口里最旧的 20 条）。
    expect(refs[0]).toBe('ev-24');
    expect(refs[19]).toBe('ev-5');

    const again = await manager.refreshBadges();
    expect(again).toEqual([]);
    expect(manager.snapshot().badges).toEqual(save.badges);
  });

  it('recordEvidence 裁剪体积：metrics 最多 8 键，单条事件 ≤ 1.5 KB', async () => {
    const { evidence, manager, setNow } = createHarness();
    await manager.init();
    setNow(STARTED_AT + 1_000);
    const metrics: Record<string, number> = {};
    for (let index = 0; index < 20; index += 1) metrics['m' + index] = index;
    metrics.bad = Number.NaN;

    await manager.recordEvidence(LEVEL_ID, [
      {
        phase: 'run',
        variantId: 'base',
        action: '跑'.repeat(5_000),
        tool: 'knob',
        outcome: 'info',
        metrics,
        artifact: {
          id: 'artifact-1',
          kind: 'dataset',
          digest: 'd'.repeat(10_000),
          summary: '摘'.repeat(5_000),
        },
      },
    ]);

    expect(evidence.events).toHaveLength(1);
    const event = evidence.events[0];
    expect(Object.keys(event.metrics ?? {})).toHaveLength(8);
    expect(event.metrics).not.toHaveProperty('bad');
    expect(event.action.length).toBeLessThanOrEqual(200);
    expect(Array.from(event.artifact?.digest ?? '')).toHaveLength(128);
    expect(Array.from(event.artifact?.summary ?? '')).toHaveLength(120);
    expect(Buffer.byteLength(JSON.stringify(event), 'utf8')).toBeLessThanOrEqual(1536);
  });

  it('坏草稿整条丢弃且不占 revision；全部坏掉时不写空批次', async () => {
    const { evidence, manager, setNow } = createHarness();
    await manager.init();
    setNow(STARTED_AT + 1_000);

    const invalid = [
      { phase: 'not-a-phase', variantId: 'base', action: 'x' },
      null,
      'oops',
    ] as unknown as EvidenceDraft[];
    await manager.recordEvidence(LEVEL_ID, invalid);
    expect(evidence.events).toHaveLength(0);

    await manager.recordEvidence(LEVEL_ID, [
      { phase: 'observe', variantId: 'base', action: 'ok' },
      { phase: 'not-a-phase', variantId: 'base', action: 'bad' } as unknown as EvidenceDraft,
    ]);
    expect(evidence.events).toHaveLength(1);
    expect(evidence.events[0].revision).toBe(0);

    await manager.recordEvidence(LEVEL_ID, [
      { phase: 'result', variantId: 'base', action: 'done' },
    ]);
    expect(evidence.events[1].revision).toBe(1);
  });

  it('clear 后 revision 批次与证据聚合一起重置', async () => {
    const { evidence, manager, setNow } = createHarness();
    await manager.init();
    setNow(STARTED_AT + 1_000);
    await manager.recordEvidence(LEVEL_ID, [
      { phase: 'observe', variantId: 'base', action: 'first' },
    ]);
    setNow(STARTED_AT + 2_000);
    await manager.clear();
    await manager.recordEvidence(LEVEL_ID, [
      { phase: 'observe', variantId: 'base', action: 'after-clear' },
    ]);
    expect(evidence.events).toHaveLength(1);
    expect(evidence.events[0].revision).toBe(0);
    expect(evidence.clearCount).toBe(1);
    expect(evidence.aggregate.total).toBe(0);
  });
});

describe('migrate', () => {
  it('旧版本只补字段不清空，坏字段独立丢弃', () => {
    const migrated = migrate(
      {
        schemaVersion: 0,
        updatedAt: 7,
        profile: { nickname: '旧档', startBand: 'g46', createdAt: 5 },
        levels: {
          [LEVEL_ID]: {
            completed: true,
            completedVariants: ['base'],
            stamps: ['constraint', 'not-a-stamp'],
            attempts: 3,
            lastPlayedAt: 6,
          },
        },
        tools: { pattern: { uses: 2, lastUsedAt: 6 } },
        badges: {},
        journal: [],
      },
      42,
    );

    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.profile).toEqual({
      id: 'local-default',
      nickname: '旧档',
      startBand: 'g46',
      createdAt: 5,
    });
    expect(migrated.levels[LEVEL_ID]).toMatchObject({
      completed: true,
      completedVariants: ['base'],
      stamps: ['constraint'],
      attempts: 3,
      lastPlayedAt: 6,
    });
    expect(migrated.tools.pattern).toMatchObject({ uses: 2, lastUsedAt: 6 });
  });

  it('来自未来版本的存档整体回空档', () => {
    const future = migrate({ schemaVersion: SAVE_SCHEMA_VERSION + 1, profile: { nickname: '未来' } }, 42);
    expect(future).toEqual(emptySave(42));
  });

  it('无法识别的输入回空档且不抛错', () => {
    expect(migrate('not json', 42)).toEqual(emptySave(42));
    expect(migrate(null, 42)).toEqual(emptySave(42));
    expect(migrate(123, 42)).toEqual(emptySave(42));
  });
});
