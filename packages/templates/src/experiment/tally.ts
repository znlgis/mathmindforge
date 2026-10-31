import type { ClaimInput, FailureCause } from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import type { TallyScript } from './schema';

/**
 * tally（收集 + 手工统计）的纯逻辑：只做计数、极值判定与结论一致性检查。
 * 不 import Phaser/Vue/DOM，不做任何随机；时间与种子都由调用方注入。
 */

export type TallyCounts = Record<string, number>;

export const TALLY_FAILURE_CLASSES = [
  'probe-not-collected',
  'probe-sample-small',
  'probe-tally-wrong',
  'probe-claim-mismatch',
] as const;
export type TallyFailureClass = (typeof TALLY_FAILURE_CLASSES)[number];

export interface TallyCheck {
  passed: boolean;
  failureClass?: TallyFailureClass;
  causes: FailureCause[];
  metrics: Record<string, number>;
}

export interface TallyExtremes {
  most: string[];
  least: string[];
}

function cause(
  kind: FailureCause['kind'],
  ref: string,
  messageKey: string,
  params?: Record<string, string | number>,
): FailureCause {
  const out: FailureCause = { kind, ref, messageKey };
  if (params) out.params = params;
  return out;
}

/** 以 items 为准统计每个类别的真实数量（categories 里没出现的项也保留 0）。 */
export function truthCounts(script: TallyScript): TallyCounts {
  const counts: TallyCounts = {};
  for (const category of script.categories) counts[category.id] = 0;
  for (const item of script.items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

/** 把任意输入收敛成“只有本关类别、非负整数”的统计条。 */
export function normalizeCounts(script: TallyScript, input: Record<string, number> | undefined): TallyCounts {
  const out: TallyCounts = {};
  for (const category of script.categories) {
    const raw = input ? input[category.id] : undefined;
    out[category.id] = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(0, Math.floor(raw))
      : 0;
  }
  return out;
}

export function countsOf(items: readonly string[], script: TallyScript): TallyCounts {
  const known = new Set(script.categories.map((category) => category.id));
  const counts: TallyCounts = {};
  for (const category of script.categories) counts[category.id] = 0;
  for (const item of items) {
    if (!known.has(item)) continue;
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

export function totalOf(counts: TallyCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function extremes(counts: TallyCounts): TallyExtremes {
  const entries = Object.entries(counts);
  if (entries.length === 0) return { most: [], least: [] };
  const values = entries.map(([, value]) => value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  return {
    most: entries.filter(([, value]) => value === max).map(([id]) => id),
    least: entries.filter(([, value]) => value === min).map(([id]) => id),
  };
}

export function sameCounts(a: TallyCounts, b: TallyCounts): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  }
  return true;
}

export function tallyDigest(counts: TallyCounts): string {
  const sorted = Object.keys(counts).sort().map((key) => [key, counts[key]]);
  return digest(sorted);
}

function sortedEqual(a: string[], b: string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * 结论必须和数据对得上：
 * - 方向 most / least 的类别要在对应极值集合里；
 * - 并列时 tiedWith 要把另外几个极值类别都列出来（多列、漏列都算错）；
 * - n 要正好等于采集总数。
 */
export function claimMatches(
  counts: TallyCounts,
  claim: ClaimInput | undefined,
  total: number,
): boolean {
  if (!claim || claim.kind !== 'count-compare') return false;
  if (!Number.isInteger(claim.n) || claim.n !== total) return false;
  if (!(claim.category in counts)) return false;
  const { most, least } = extremes(counts);
  const pool = claim.direction === 'most' ? most : least;
  if (!pool.includes(claim.category)) return false;
  const expected = pool.filter((id) => id !== claim.category);
  return sortedEqual(claim.tiedWith ?? [], expected);
}

interface RawTallyArtifact {
  dataset?: { n?: unknown; counts?: unknown };
  tally?: { counts?: unknown };
  claim?: unknown;
}

function asCounts(input: unknown): TallyCounts | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: TallyCounts = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

function fail(
  failureClass: TallyFailureClass,
  causes: FailureCause[],
  metrics: Record<string, number>,
): TallyCheck {
  return { passed: false, failureClass, causes, metrics };
}

/**
 * 校验无画布实验关的产物：dataset（采集）→ tally（统计条）→ claim（结论）。
 * 任何一环缺失或与 items 不符都给出确定失败类，不依赖玩家自报数字。
 */
export function checkTallyArtifact(script: TallyScript, artifact: unknown): TallyCheck {
  const truth = truthCounts(script);
  const total = script.items.length;
  const metrics: Record<string, number> = { total };
  const raw = (artifact && typeof artifact === 'object' ? artifact : {}) as RawTallyArtifact;

  const datasetCounts = asCounts(raw.dataset?.counts);
  const datasetN = typeof raw.dataset?.n === 'number' ? raw.dataset.n : 0;
  if (!raw.dataset || !datasetCounts || datasetN <= 0) {
    return fail('probe-not-collected', [cause('sample', 'dataset', '先采集一把，再去统计。')], metrics);
  }
  metrics.collected = datasetN;
  if (datasetN !== total) {
    return fail(
      'probe-sample-small',
      [cause('sample', 'dataset', '要把整筐都采完，再下结论。', { n: datasetN, total })],
      metrics,
    );
  }
  if (totalOf(datasetCounts) !== datasetN || !sameCounts(datasetCounts, truth)) {
    return fail(
      'probe-tally-wrong',
      [cause('sample', 'dataset', '采集到的数据和这一筐图形对不上。')],
      metrics,
    );
  }

  const tallyCounts = asCounts(raw.tally?.counts);
  if (!tallyCounts) {
    return fail(
      'probe-tally-wrong',
      [cause('constraint', 'tally', '统计条还是空的：先把每一类记下来。')],
      metrics,
    );
  }
  if (!sameCounts(tallyCounts, truth)) {
    const { most, least } = extremes(truth);
    return fail(
      'probe-tally-wrong',
      [cause('constraint', 'tally', '统计条和真实数量不一致，再数一遍。', {
        most: most.join('/'),
        least: least.join('/'),
      })],
      metrics,
    );
  }

  const claim = raw.claim as ClaimInput | undefined;
  if (!claim) {
    return fail('probe-claim-mismatch', [cause('claim', 'claim', '还差一句结论：哪类最多、哪类最少。')], metrics);
  }
  if (claim.kind !== 'count-compare') {
    return fail('probe-claim-mismatch', [cause('claim', 'claim', '这一类关卡要“最多/最少”的比较结论。')], metrics);
  }
  if (!claimMatches(truth, claim, total)) {
    const { most, least } = extremes(truth);
    return fail(
      'probe-claim-mismatch',
      [cause('claim', 'claim', '结论和数据对不上：再对照一次统计条。', {
        most: most.join('/'),
        least: least.join('/'),
      })],
      metrics,
    );
  }

  return { passed: true, causes: [], metrics };
}
