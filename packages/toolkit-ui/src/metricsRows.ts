import type { RunSnapshot } from '@mmf/game-kit';

/**
 * simulate 模板把「最近运行」编码进 probe 工具的 dataset：
 *   dataset.id = 'sim-runs-v1'
 *   dataset.groups[runId] = 一串按下面顺序摆好的数字
 * 顺序必须与 packages/templates/src/simulate/runtime.ts 的 METRICS_ROW_FIELDS 完全一致；
 * 两个包之间没有能直接共享的类型层，改动时两边一起改。
 */
export const METRICS_ROW_FIELDS = [
  'vehicles',
  'teams',
  'shift',
  'routeIndex',
  'coverageA',
  'waitA',
  'coverageB',
  'waitB',
  'cost',
  'passed',
] as const;

export const METRICS_DATASET_ID = 'sim-runs-v1';

export interface MetricsRow {
  id: string;
  vehicles: number;
  teams: number;
  shift: number;
  routeIndex: number;
  coverageA: number;
  waitA: number;
  coverageB: number;
  waitB: number;
  cost: number;
  passed: boolean;
}

export interface SeedTarget {
  coverageMin: number;
  waitMax: number;
}

export interface MetricsTargets {
  A: SeedTarget;
  B: SeedTarget;
}

export interface MetricsPass {
  a: boolean;
  b: boolean;
  budget: boolean;
  all: boolean;
}

function runOrder(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** 按运行先后读表格；dataset 不在或格式不对时返回空表，UI 退到空状态。 */
export function readMetricsRows(snapshot: RunSnapshot): MetricsRow[] {
  const dataset = snapshot.toolState.probe?.dataset;
  if (!dataset || dataset.id !== METRICS_DATASET_ID) return [];
  const groups = dataset.groups;
  if (!groups) return [];
  const rows: MetricsRow[] = [];
  for (const [id, values] of Object.entries(groups)) {
    if (values.length < METRICS_ROW_FIELDS.length) continue;
    const [
      vehicles = 0,
      teams = 0,
      shift = 0,
      routeIndex = 0,
      coverageA = 0,
      waitA = 0,
      coverageB = 0,
      waitB = 0,
      cost = 0,
      passed = 0,
    ] = values;
    rows.push({
      id,
      vehicles,
      teams,
      shift,
      routeIndex,
      coverageA,
      waitA,
      coverageB,
      waitB,
      cost,
      passed: passed === 1,
    });
  }
  rows.sort((left, right) => runOrder(left.id) - runOrder(right.id));
  return rows;
}

export function latestMetricsRow(snapshot: RunSnapshot): MetricsRow | null {
  const rows = readMetricsRows(snapshot);
  return rows.length === 0 ? null : rows[rows.length - 1];
}

export function seedPasses(row: MetricsRow, targets: MetricsTargets, budget: number): MetricsPass {
  const a = row.coverageA + 1e-9 >= targets.A.coverageMin && row.waitA <= targets.A.waitMax + 1e-9;
  const b = row.coverageB + 1e-9 >= targets.B.coverageMin && row.waitB <= targets.B.waitMax + 1e-9;
  const budgetOk = row.cost <= budget + 1e-9;
  return { a, b, budget: budgetOk, all: a && b && budgetOk };
}
