import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';
import * as payment from './logic';
import * as distribution from './distribution';
import { networkScriptSchema, validateNetworkArtifact } from './network';
import { createNetworkRuntime } from './network-runtime';
import { scheduleScriptSchema, validateScheduleArtifact } from './schedule';
import { createScheduleRuntime } from './schedule-runtime';
import { frontierScriptSchema, validateFrontierArtifact } from './frontier';
import { createFrontierRuntime } from './frontier-runtime';
import { createConstructRuntime as createPaymentRuntime } from './runtime';

function modeOf(detail: LevelDetail): 'payment' | 'distribution' | 'network' | 'schedule' | 'frontier' {
  const script = detail.levelScript as { mode?: string } | null;
  if (script?.mode === 'distribution') return 'distribution';
  if (script?.mode === 'network') return 'network';
  if (script?.mode === 'schedule') return 'schedule';
  if (script?.mode === 'frontier') return 'frontier';
  return 'payment';
}

export const constructVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    if (script?.mode === 'distribution') return distribution.parseScript(input);
    if (script?.mode === 'network') return networkScriptSchema.parse(input);
    if (script?.mode === 'schedule') return scheduleScriptSchema.parse(input);
    if (script?.mode === 'frontier') return frontierScriptSchema.parse(input);
    return payment.parseScript(input);
  },
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.validateArtifact(detail, variant, artifact);
    if (mode === 'frontier') {
      const result = validateFrontierArtifact(frontierScriptSchema.parse(detail.levelScript), artifact);
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['argument'] : ['argument', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'frontier-empty',
          variantId: variant.id,
          causes: [{ kind: 'claim', ref: 'frontier', messageKey: '这组边权还不能让贪心走弯路。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    }
    if (mode === 'schedule') {
      const result = validateScheduleArtifact(scheduleScriptSchema.parse(detail.levelScript), artifact);
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'schedule-empty',
          variantId: variant.id,
          causes: [{ kind: 'constraint', ref: 'schedule', messageKey: '课表还没有满足全部约束。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    }
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
    if (mode === 'frontier') {
      const raw = artifact as { costs?: Record<string, number> } | null;
      const script = frontierScriptSchema.parse(detail.levelScript);
      const actions: LevelAction[] = script.edges.map((edge) => ({
        type: 'construct/place' as const,
        payload: { piece: { id: edge.id, shape: edge.id, x: 0, y: raw?.costs?.[edge.id] ?? edge.default } },
      }));
      actions.push({ type: 'submit', payload: {} });
      return actions;
    }
    if (mode === 'schedule') {
      const raw = artifact as { placements?: { lesson: string; slot: string }[] } | null;
      const script = scheduleScriptSchema.parse(detail.levelScript);
      const actions: LevelAction[] = (raw?.placements ?? []).flatMap((placement) => {
        const slotIndex = script.slots.findIndex((slot) => slot.id === placement.slot);
        return slotIndex < 0 ? [] : [{
          type: 'construct/place' as const,
          payload: { piece: { id: placement.lesson, shape: placement.lesson, x: slotIndex, y: 0 } },
        }];
      });
      actions.push({ type: 'submit', payload: {} });
      return actions;
    }
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
    if (mode === 'schedule') return scheduleScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    if (mode === 'frontier') return frontierScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    return payment.constructVerifier.applyVariant(detail, variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    const mode = modeOf(detail);
    if (mode === 'distribution') return distribution.reachableFailureClasses(detail);
    if (mode === 'network') {
      return ['network-empty', 'network-disconnected', 'network-budget', 'network-too-many', 'network-key'];
    }
    if (mode === 'schedule') return ['schedule-empty', 'schedule-incomplete', 'schedule-conflict', 'schedule-bonus', 'schedule-unknown'];
    if (mode === 'frontier') return ['frontier-empty', 'frontier-incomplete', 'frontier-range', 'frontier-not-counter'];
    return payment.reachableFailureClasses(detail);
  },
};

export function createConstructRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const mode = modeOf(detail);
  if (mode === 'distribution') return distribution.createDistributionRuntime(detail, opts);
  if (mode === 'network') return createNetworkRuntime(detail, opts);
  if (mode === 'schedule') return createScheduleRuntime(detail, opts);
  if (mode === 'frontier') return createFrontierRuntime(detail, opts);
  return createPaymentRuntime(detail, opts);
}
