import { describe, expect, it } from 'vitest';
import type { RunSnapshot } from '@mmf/game-kit';
import { latestMetricsRow, readMetricsRows, seedPasses } from './metricsRows';
import type { MetricsRow, MetricsTargets } from './metricsRows';

function dataset(groups: Record<string, number[]> | undefined, id = 'sim-runs-v1') {
  return {
    probe: {
      dataset: { id, n: groups ? Object.keys(groups).length : 0, values: [], groups, digest: 'd' },
    },
  };
}

function snapshot(toolState: unknown): RunSnapshot {
  return { toolState } as unknown as RunSnapshot;
}

function row(id: string, overrides: Partial<MetricsRow> = {}): MetricsRow {
  return {
    id,
    vehicles: 3,
    teams: 1,
    shift: 90,
    routeIndex: 0,
    coverageA: 0.95,
    waitA: 16,
    coverageB: 0.9,
    waitB: 17,
    cost: 103,
    passed: true,
    ...overrides,
  };
}

const TARGETS: MetricsTargets = {
  A: { coverageMin: 0.9, waitMax: 18 },
  B: { coverageMin: 0.85, waitMax: 20 },
};

describe('readMetricsRows', () => {
  it('没有 probe 数据集时返回空表', () => {
    expect(readMetricsRows(snapshot({}))).toEqual([]);
    expect(readMetricsRows(snapshot({ probe: {} }))).toEqual([]);
  });

  it('数据集 id 不是 sim-runs-v1 时返回空表', () => {
    expect(readMetricsRows(snapshot(dataset({ 'run-1': [3, 1, 90, 0, 0.9, 16, 0.9, 17, 100, 1] }, 'inference-v1'))))
      .toEqual([]);
  });

  it('没有 groups 时返回空表', () => {
    expect(readMetricsRows(snapshot(dataset(undefined)))).toEqual([]);
  });

  it('一行不足 10 个字段时跳过，不把半行当数据', () => {
    expect(readMetricsRows(snapshot(dataset({ 'run-1': [3, 1] })))).toEqual([]);
  });

  it('按运行序号排序，而不是按字符串顺序', () => {
    const rows = readMetricsRows(snapshot(dataset({
      'run-10': [4, 1, 90, 1, 0.8, 20, 0.7, 21, 128, 0],
      'run-2': [2, 2, 90, 2, 0.9, 18, 0.85, 19, 88, 0],
    })));
    expect(rows.map((item) => item.id)).toEqual(['run-2', 'run-10']);
  });

  it('字段按约定顺序解码，passed 只看是否等于 1', () => {
    const [parsed] = readMetricsRows(snapshot(dataset({
      'run-1': [3, 1, 90, 0, 0.95, 16, 0.9, 17, 103, 1],
    })));
    expect(parsed).toMatchObject({
      vehicles: 3, teams: 1, shift: 90, routeIndex: 0,
      coverageA: 0.95, waitA: 16, coverageB: 0.9, waitB: 17, cost: 103, passed: true,
    });

    const [notPassed] = readMetricsRows(snapshot(dataset({
      'run-1': [3, 1, 90, 0, 0.95, 16, 0.9, 17, 103, 2],
    })));
    expect(notPassed?.passed).toBe(false);
  });
});

describe('latestMetricsRow', () => {
  it('没有数据时返回 null', () => {
    expect(latestMetricsRow(snapshot({}))).toBeNull();
  });

  it('返回序号最大的那一行', () => {
    const latest = latestMetricsRow(snapshot(dataset({
      'run-9': [1, 1, 90, 0, 0.1, 16, 0.1, 17, 10, 0],
      'run-12': [3, 1, 90, 0, 0.95, 16, 0.9, 17, 103, 1],
    })));
    expect(latest?.id).toBe('run-12');
  });
});

describe('seedPasses', () => {
  it('全部达标时 all 为真', () => {
    expect(seedPasses(row('run-1'), TARGETS, 120)).toEqual({ a: true, b: true, budget: true, all: true });
  });

  it('覆盖率差一点或等待超一点就判不达标', () => {
    expect(seedPasses(row('run-1', { coverageA: 0.89 }), TARGETS, 120).a).toBe(false);
    expect(seedPasses(row('run-1', { waitA: 19 }), TARGETS, 120).a).toBe(false);
    expect(seedPasses(row('run-1', { coverageB: 0.84 }), TARGETS, 120).b).toBe(false);
  });

  it('成本超预算时只有 budget 失败，但不影响 a/b', () => {
    const result = seedPasses(row('run-1', { cost: 121 }), TARGETS, 120);
    expect(result).toEqual({ a: true, b: true, budget: false, all: false });
  });

  it('浮点误差留 1e-9 容差：刚好卡在边界上算通过', () => {
    const edge = row('run-1', { coverageA: 0.9 - 1e-12, waitA: 18, cost: 120 + 1e-12 });
    expect(seedPasses(edge, TARGETS, 120).all).toBe(true);
    expect(seedPasses(row('run-1', { coverageA: 0.9 - 1e-6 }), TARGETS, 120).a).toBe(false);
  });
});
