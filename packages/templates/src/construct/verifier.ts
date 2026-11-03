import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { TemplateId } from '@mmf/content/ids';
import * as payment from './logic';
import * as distribution from './distribution';
import type { RuntimeVariant } from '../shared/types';
import { createConstructRuntime as createPaymentRuntime } from './runtime';

function modeOf(detail: LevelDetail): 'payment' | 'distribution' {
  const script = detail.levelScript as { mode?: string } | null;
  return script?.mode === 'distribution' ? 'distribution' : 'payment';
}

export const constructVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    return script?.mode === 'distribution' ? distribution.parseScript(input) : payment.parseScript(input);
  },
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
    return modeOf(detail) === 'distribution'
      ? distribution.validateArtifact(detail, variant, artifact)
      : payment.validateArtifact(detail, variant, artifact);
  },
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
    return modeOf(detail) === 'distribution'
      ? distribution.actionsFor(detail, variant, artifact)
      : payment.actionsFor(detail, variant, artifact);
  },
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown {
    return modeOf(detail) === 'distribution'
      ? distribution.applyVariant(distribution.parseScript(detail.levelScript), variant)
      : payment.constructVerifier.applyVariant(detail, variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    return modeOf(detail) === 'distribution'
      ? distribution.reachableFailureClasses(detail)
      : payment.reachableFailureClasses(detail);
  },
};

export function createConstructRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return modeOf(detail) === 'distribution'
    ? distribution.createDistributionRuntime(detail, opts)
    : createPaymentRuntime(detail, opts);
}

export type { TemplateId };
