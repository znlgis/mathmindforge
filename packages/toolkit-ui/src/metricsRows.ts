import type { RunSnapshot } from '@mmf/game-kit';

/**
 * simulate 模板把「最近运行」编码进 probe 工具的 dataset：
 *   dataset.id = 'sim-runs-v1'（dispatch）或 'queue-runs-v1'（queue）
 *   dataset.groups[runId] = 一串按下面顺序摆好的数字
 * 顺序必须与 packages/templates/src/simulate/runtime.ts 的 METRICS_ROW_FIELDS
 * （以及 queue-runtime.ts 的排队行）完全一致；两个包之间没有能直接共享的类型层，
 * 改动时两边一起改。
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

/** 排队关（simulate/queue）的数据集 id 与行顺序，与 queue-runtime.ts 的 datasetOf 一致。 */
export const QUEUE_METRICS_DATASET_ID = 'queue-runs-v1';

export const QUEUE_ROW_FIELDS = [
  'servers',
  'serviceTime',
  'openMinutes',
  'avgWait',
  'maxQueue',
  'overtime',
  'cost',
  'passed',
] as const;

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

/** 排队关的一行：3 个参数 + 4 个指标 + 达标位。 */
export interface QueueMetricsRow {
  id: string;
  servers: number;
  serviceTime: number;
  openMinutes: number;
  avgWait: number;
  maxQueue: number;
  overtime: number;
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

/** 当前快照里的指标数据集 id；没有数据集时返回 null。 */
export function metricsDatasetIdOf(snapshot: RunSnapshot): string | null {
  const id = snapshot.toolState.probe?.dataset?.id;
  return typeof id === 'string' ? id : null;
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

/** 排队关的运行记录：只读 queue-runs-v1，其余数据集原样返回空表。 */
export function readQueueMetricsRows(snapshot: RunSnapshot): QueueMetricsRow[] {
  const dataset = snapshot.toolState.probe?.dataset;
  if (!dataset || dataset.id !== QUEUE_METRICS_DATASET_ID) return [];
  const groups = dataset.groups;
  if (!groups) return [];
  const rows: QueueMetricsRow[] = [];
  for (const [id, values] of Object.entries(groups)) {
    if (values.length < QUEUE_ROW_FIELDS.length) continue;
    const [
      servers = 0,
      serviceTime = 0,
      openMinutes = 0,
      avgWait = 0,
      maxQueue = 0,
      overtime = 0,
      cost = 0,
      passed = 0,
    ] = values;
    rows.push({
      id,
      servers,
      serviceTime,
      openMinutes,
      avgWait,
      maxQueue,
      overtime,
      cost,
      passed: passed === 1,
    });
  }
  rows.sort((left, right) => runOrder(left.id) - runOrder(right.id));
  return rows;
}

export function latestQueueMetricsRow(snapshot: RunSnapshot): QueueMetricsRow | null {
  const rows = readQueueMetricsRows(snapshot);
  return rows.length === 0 ? null : rows[rows.length - 1];
}

export function seedPasses(row: MetricsRow, targets: MetricsTargets, budget: number): MetricsPass {
  const a = row.coverageA + 1e-9 >= targets.A.coverageMin && row.waitA <= targets.A.waitMax + 1e-9;
  const b = row.coverageB + 1e-9 >= targets.B.coverageMin && row.waitB <= targets.B.waitMax + 1e-9;
  const budgetOk = row.cost <= budget + 1e-9;
  return { a, b, budget: budgetOk, all: a && b && budgetOk };
}

export interface QueueTargets {
  avgWaitMax: number;
  overtimeMax: number;
}

export interface QueuePass {
  wait: boolean;
  overtime: boolean;
  budget: boolean;
  all: boolean;
}

/** 排队关的达标灯：平均等待、加班上限、成本预算。 */
export function queuePasses(row: QueueMetricsRow, targets: QueueTargets, budget: number): QueuePass {
  const wait = row.avgWait <= targets.avgWaitMax + 1e-9;
  const overtime = row.overtime <= targets.overtimeMax + 1e-9;
  const budgetOk = row.cost <= budget + 1e-9;
  return { wait, overtime, budget: budgetOk, all: wait && overtime && budgetOk };
}
