import { z } from 'zod';
import { mulberry32, wilsonInterval } from '@mmf/toolkit/shared';

/** 抽样关：已知总体里按批次无放回抽样，用样本比例与区间估计总体。 */
export const samplingScriptSchema = z.object({
  mode: z.literal('sampling'),
  population: z.object({
    red: z.number().int().min(1).max(500),
    blue: z.number().int().min(1).max(500),
    label: z.string().min(1).max(20).default('红球'),
  }),
  batchSizes: z.array(z.number().int().min(5).max(200)).min(1),
  minSample: z.number().int().min(10).max(500),
  tolerance: z.number().min(0.01).max(0.2),
  minBatches: z.number().int().min(1).max(8),
});
export type SamplingScript = z.infer<typeof samplingScriptSchema>;

export interface SamplingSample {
  n: number;
  red: number;
  proportion: number;
  ci: [number, number];
  trueProportion: number;
}

export function trueProportion(script: SamplingScript): number {
  const total = script.population.red + script.population.blue;
  return total > 0 ? script.population.red / total : 0;
}

/** 从总体中按 seed 做一次无放回抽样；同一 seed 结果一致。 */
export function drawSample(script: SamplingScript, n: number, seed: number): SamplingSample {
  const total = script.population.red + script.population.blue;
  const size = Math.max(1, Math.min(total, Math.trunc(n)));
  const rng = mulberry32(seed);
  const pool: boolean[] = [];
  for (let i = 0; i < total; i += 1) pool.push(i < script.population.red);
  // Fisher-Yates 只抽前 size 个
  for (let i = 0; i < size; i += 1) {
    const j = i + Math.floor(rng() * (total - i));
    const tmp = pool[i] as boolean;
    pool[i] = pool[j] as boolean;
    pool[j] = tmp;
  }
  let red = 0;
  for (let i = 0; i < size; i += 1) if (pool[i]) red += 1;
  const proportion = red / size;
  const interval = wilsonInterval(red, size);
  return {
    n: size,
    red,
    proportion,
    ci: [interval.low, interval.high],
    trueProportion: trueProportion(script),
  };
}

export interface SamplingValidation {
  passed: boolean;
  failures: string[];
  metrics: Record<string, number>;
}

export function validateSamplingArtifact(script: SamplingScript, artifact: unknown): SamplingValidation {
  const raw = artifact as {
    sample?: { n?: number; red?: number; proportion?: number; ci?: [number, number]; seed?: number };
    claim?: { kind?: string; value?: number; n?: number; ci?: [number, number] };
    batches?: number;
  } | null;
  const sample = raw?.sample;
  const claim = raw?.claim;
  const metrics = {
    n: sample?.n ?? 0,
    red: sample?.red ?? 0,
    batches: raw?.batches ?? 0,
    trueProportion: trueProportion(script),
  };
  if (!sample || typeof sample.n !== 'number' || sample.n <= 0) {
    return { passed: false, failures: ['sampling-no-sample'], metrics };
  }
  if (sample.n < script.minSample) {
    return { passed: false, failures: ['sampling-too-small'], metrics };
  }
  if (!claim || claim.kind !== 'stat' || typeof claim.value !== 'number' || typeof claim.n !== 'number') {
    return { passed: false, failures: ['sampling-no-claim'], metrics };
  }
  const sampleRed = sample.red ?? 0;
  if (claim.n !== sample.n || Math.abs(claim.value - (sampleRed / sample.n)) > 1e-6) {
    return { passed: false, failures: ['sampling-claim-mismatch'], metrics };
  }
  if (!Array.isArray(claim.ci) || claim.ci.length !== 2) {
    return { passed: false, failures: ['sampling-no-claim'], metrics };
  }
  if ((raw?.batches ?? 0) < script.minBatches) {
    return { passed: false, failures: ['sampling-too-few-batches'], metrics };
  }
  const trueValue = trueProportion(script);
  if (Math.abs(claim.value - trueValue) > script.tolerance) {
    return { passed: false, failures: ['sampling-far'], metrics };
  }
  if (claim.ci[0] > trueValue || claim.ci[1] < trueValue) {
    return { passed: false, failures: ['sampling-ci-miss'], metrics };
  }
  return { passed: true, failures: [], metrics };
}
