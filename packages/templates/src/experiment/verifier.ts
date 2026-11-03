import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';
import * as experiment from './logic';
import { samplingScriptSchema, validateSamplingArtifact } from './sampling';
import { createSamplingRuntime } from './sampling-runtime';
import { inferenceScriptSchema, inferenceStats as inferenceStatsFor, validateInferenceArtifact } from './inference';
import { createInferenceRuntime } from './inference-runtime';
import { createExperimentRuntime as createTallyDuelRuntime } from './runtime';

function modeOf(detail: LevelDetail): 'tally' | 'duel' | 'sampling' | 'inference' {
  const script = detail.levelScript as { mode?: string } | null;
  if (script?.mode === 'sampling') return 'sampling';
  if (script?.mode === 'inference') return 'inference';
  return 'tally';
}

function isSampling(detail: LevelDetail): boolean {
  return modeOf(detail) === 'sampling';
}

function isInference(detail: LevelDetail): boolean {
  return modeOf(detail) === 'inference';
}

export const experimentVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    if (script?.mode === 'sampling') return samplingScriptSchema.parse(input);
    if (script?.mode === 'inference') return inferenceScriptSchema.parse(input);
    return experiment.parseScript(input);
  },
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
    if (isSampling(detail)) {
      const result = validateSamplingArtifact(samplingScriptSchema.parse(detail.levelScript), artifact);
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'sampling-no-sample',
          variantId: variant.id,
          causes: [{ kind: 'constraint', ref: 'sample', messageKey: '抽样证据还没有全部达标。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    }
    if (isInference(detail)) {
      const result = validateInferenceArtifact(inferenceScriptSchema.parse(detail.levelScript), artifact);
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['argument'] : ['argument', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'inference-no-sample',
          variantId: variant.id,
          causes: [{ kind: 'claim', ref: 'inference', messageKey: '两组比较的结论还没有被区间支持。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    }
    return experiment.validateArtifact(detail, variant, artifact);
  },
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
    if (isSampling(detail)) {
      const script = samplingScriptSchema.parse(detail.levelScript);
      const actions: LevelAction[] = [];
      for (let i = 0; i < script.minBatches; i += 1) {
        actions.push({ type: 'probe/sample', payload: { n: script.batchSizes[0] ?? 20 } });
      }
      actions.push({ type: 'probe/claim', payload: { claim: { kind: 'stat', statistic: 'proportion', value: 0, n: 0, ci: [0, 1] } } });
      actions.push({ type: 'submit', payload: {} });
      return actions;
    }
    if (isInference(detail)) {
      const stats = inferenceStatsFor(inferenceScriptSchema.parse(detail.levelScript));
      const delta = Math.round((stats.a.proportion - stats.b.proportion) * 10000) / 10000;
      const low = Math.round((stats.a.ci[0] - stats.b.ci[1]) * 10000) / 10000;
      const high = Math.round((stats.a.ci[1] - stats.b.ci[0]) * 10000) / 10000;
      return [
        { type: 'probe/focus', payload: { id: 'inference-table' } },
        { type: 'probe/claim', payload: { claim: { kind: 'difference', delta, ci: [low, high], n: stats.a.n + stats.b.n } } },
        { type: 'submit', payload: {} },
      ];
    }
    return experiment.actionsFor(detail, variant, artifact);
  },
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown {
    if (isSampling(detail)) {
      return samplingScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    }
    if (isInference(detail)) return inferenceScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    return experiment.applyVariant(experiment.parseScript(detail.levelScript), variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    return isSampling(detail)
      ? ['sampling-no-sample', 'sampling-too-small', 'sampling-no-claim', 'sampling-claim-mismatch', 'sampling-too-few-batches', 'sampling-far', 'sampling-ci-miss']
      : isInference(detail)
        ? ['inference-no-sample', 'inference-too-small', 'inference-sample-mismatch', 'inference-no-claim', 'inference-claim-wrong']
        : experiment.reachableFailureClasses(detail);
  },
  transferVariants(detail: LevelDetail) {
    return isSampling(detail) || isInference(detail) ? [] : experiment.transferVariants(detail);
  },
  transferFailureClass(detail: LevelDetail) {
    return isSampling(detail) ? 'sampling-ci-miss' : isInference(detail) ? 'inference-claim-wrong' : experiment.transferFailureClass(detail);
  },
};

export function createExperimentRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  if (isSampling(detail)) return createSamplingRuntime(detail, opts);
  if (isInference(detail)) return createInferenceRuntime(detail, opts);
  return createTallyDuelRuntime(detail, opts);
}
