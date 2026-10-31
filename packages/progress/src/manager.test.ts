import { describe, expect, it } from 'vitest';
import type { ToolId } from '@mmf/content/ids';
import { LEVEL_IDS, TOOL_IDS } from '@mmf/content/ids';
import type {
  EvidenceAggregate,
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

  async append(events: EvidenceEvent[]): Promise<void> {
    this.events.push(...events.map((event) => ({ ...event })));
    this.record = { version: 1, events: [...this.events] };
  }

  async recent(limit: number): Promise<EvidenceEvent[]> {
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

interface Harness {
  progress: MemoryProgressStore;
  evidence: MemoryEvidenceStore;
  manager: ProgressManager;
  setNow: (value: number) => void;
}

function createHarness(startedAt = STARTED_AT): Harness {
  const progress = new MemoryProgressStore();
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
