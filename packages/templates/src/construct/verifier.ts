import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';
import * as payment from './logic';
import * as distribution from './distribution';
import { networkScriptSchema, validateNetworkArtifact } from './network';
import { createNetworkRuntime } from './network-runtime';
import { createConstructRuntime as createPaymentRuntime } from './runtime';

function modeOf(detail: LevelDetail): 'payment' | 'distribution' | 'network' {
  const script = detail.levelScript as { mode?: string } | null;
  if (script?.mode === 'distribution') return 'distribution';
  if (script?.mode === 'network') return 'network';
  return 'payment';
}

export const constructVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    if (script?.mode === 'distribution') return distribution.parseScript(input);
    if (script?.mode === 'network') return networkScriptSchema.parse(input);
    return payment.parseScript(input);
  },
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.validateArtifact(detail, variant, artifact);
    if (mode === 'network') {
      const result = validateNetworkArtifact(networkScriptSchema.parse(detail.levelScript), artifact);
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'network-empty',
          variantId: variant.id,
          causes: [{ kind: 'constraint', ref: 'network', messageKey: '路网还没有连通或超出预算。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    }
    return payment.validateArtifact(detail, variant, artifact);
  },
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.actionsFor(detail, variant, artifact);
    if (mode === 'network') {
      const raw = artifact as { edges?: string[] } | null;
      const actions: LevelAction[] = (raw?.edges ?? []).map((edgeId) => ({
        type: 'construct/place' as const,
        payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: 0 } },
      }));
      actions.push({ type: 'submit', payload: {} });
      return actions;
    }
    return payment.actionsFor(detail, variant, artifact);
  },
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.applyVariant(distribution.parseScript(detail.levelScript), variant);
    if (mode === 'network') return networkScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    return payment.constructVerifier.applyVariant(detail, variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.reachableFailureClasses(detail);
    if (mode === 'network') {
      return ['network-empty', 'network-disconnected', 'network-budget', 'network-too-many', 'network-key'];
    }
    return payment.reachableFailureClasses(detail);
  },
};

export function createConstructRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const mode = modeOf(detail);
  if (mode === 'distribution') return distribution.createDistributionRuntime(detail, opts);
  if (mode === 'network') return createNetworkRuntime(detail, opts);
  return createPaymentRuntime(detail, opts);
}
