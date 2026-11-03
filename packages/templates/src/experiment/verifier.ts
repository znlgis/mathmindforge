import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';
import * as experiment from './logic';
import { samplingScriptSchema, validateSamplingArtifact } from './sampling';
import { createSamplingRuntime } from './sampling-runtime';
import { createExperimentRuntime as createTallyDuelRuntime } from './runtime';

function isSampling(detail: LevelDetail): boolean {
  const script = detail.levelScript as { mode?: string } | null;
  return script?.mode === 'sampling';
}

export const experimentVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    return script?.mode === 'sampling' ? samplingScriptSchema.parse(input) : experiment.parseScript(input);
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
    return experiment.actionsFor(detail, variant, artifact);
  },
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown {
    if (isSampling(detail)) {
      return samplingScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    }
    return experiment.applyVariant(experiment.parseScript(detail.levelScript), variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    return isSampling(detail)
      ? ['sampling-no-sample', 'sampling-too-small', 'sampling-no-claim', 'sampling-claim-mismatch', 'sampling-too-few-batches', 'sampling-far', 'sampling-ci-miss']
      : experiment.reachableFailureClasses(detail);
  },
  transferVariants(detail: LevelDetail) {
    return isSampling(detail) ? [] : experiment.transferVariants(detail);
  },
  transferFailureClass(detail: LevelDetail) {
    return isSampling(detail) ? 'sampling-ci-miss' : experiment.transferFailureClass(detail);
  },
};

export function createExperimentRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return isSampling(detail) ? createSamplingRuntime(detail, opts) : createTallyDuelRuntime(detail, opts);
}
