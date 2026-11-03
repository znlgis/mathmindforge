import { z } from 'zod';
import { wilsonInterval } from '@mmf/toolkit/shared';

/** 推断关：两组样本比例 + 区间；结论必须由样本与区间共同支持。 */
export const inferenceScriptSchema = z.object({
  mode: z.literal('inference'),
  groups: z.object({
    a: z.object({ label: z.string().min(1).max(20), n: z.number().int().min(10).max(200), successes: z.number().int().min(0).max(200) }),
    b: z.object({ label: z.string().min(1).max(20), n: z.number().int().min(10).max(200), successes: z.number().int().min(0).max(200) }),
  }),
  minN: z.number().int().min(10).max(200),
  overlapTolerance: z.number().min(0).max(0.2),
  claimOptions: z.array(z.enum(['a-higher', 'b-higher', 'no-clear'])).min(2),
});
export type InferenceScript = z.infer<typeof inferenceScriptSchema>;

export interface GroupStats {
  label: string;
  n: number;
  successes: number;
  proportion: number;
  ci: [number, number];
  overlaps: boolean;
}

export interface InferenceStats {
  a: GroupStats;
  b: GroupStats;
  truthfulClaim: 'a-higher' | 'b-higher' | 'no-clear';
}

function statsOf(group: { label: string; n: number; successes: number }): GroupStats {
  const interval = wilsonInterval(group.successes, group.n);
  return {
    label: group.label,
    n: group.n,
    successes: group.successes,
    proportion: group.n > 0 ? group.successes / group.n : 0,
    ci: [interval.low, interval.high],
    overlaps: false,
  };
}

export function inferenceStats(script: InferenceScript): InferenceStats {
  const a = statsOf(script.groups.a);
  const b = statsOf(script.groups.b);
  const overlap = a.ci[0] <= b.ci[1] + script.overlapTolerance && b.ci[0] <= a.ci[1] + script.overlapTolerance;
  a.overlaps = overlap;
  b.overlaps = overlap;
  let truthfulClaim: InferenceStats['truthfulClaim'] = 'no-clear';
  if (!overlap) truthfulClaim = a.proportion > b.proportion ? 'a-higher' : 'b-higher';
  return { a, b, truthfulClaim };
}

export interface InferenceArtifact {
  stats: {
    a: { n: number; successes: number; proportion: number; ci: [number, number] };
    b: { n: number; successes: number; proportion: number; ci: [number, number] };
  };
  claim: { kind: 'difference'; delta: number; ci: [number, number]; n: number };
}

export interface InferenceValidation {
  passed: boolean;
  failures: string[];
  metrics: Record<string, number>;
}

export function validateInferenceArtifact(script: InferenceScript, artifact: unknown): InferenceValidation {
  const raw = artifact as InferenceArtifact | null;
  const truth = inferenceStats(script);
  const metrics = {
    aN: raw?.stats?.a?.n ?? 0,
    bN: raw?.stats?.b?.n ?? 0,
    aProportion: raw?.stats?.a?.proportion ?? 0,
    bProportion: raw?.stats?.b?.proportion ?? 0,
    truthful: truth.truthfulClaim === 'a-higher' ? 1 : truth.truthfulClaim === 'b-higher' ? 2 : 0,
  };
  if (!raw?.stats || !raw.claim) {
    return { passed: false, failures: ['inference-no-sample'], metrics };
  }
  if (raw.stats.a.n < script.minN || raw.stats.b.n < script.minN) {
    return { passed: false, failures: ['inference-too-small'], metrics };
  }
  if (raw.stats.a.n !== script.groups.a.n || raw.stats.b.n !== script.groups.b.n) {
    return { passed: false, failures: ['inference-sample-mismatch'], metrics };
  }
  if (raw.claim.kind !== 'difference') {
    return { passed: false, failures: ['inference-no-claim'], metrics };
  }
  const claimDirection = raw.claim.delta > 0 ? 'a-higher' : raw.claim.delta < 0 ? 'b-higher' : 'no-clear';
  if (claimDirection !== truth.truthfulClaim) {
    return { passed: false, failures: ['inference-claim-wrong'], metrics };
  }
  if (!Array.isArray(raw.claim.ci) || raw.claim.ci.length !== 2) {
    return { passed: false, failures: ['inference-no-claim'], metrics };
  }
  if (truth.truthfulClaim !== 'no-clear' && raw.claim.ci[0] <= 0) {
    return { passed: false, failures: ['inference-ci-includes-zero'], metrics };
  }
  return { passed: true, failures: [], metrics };
}
