import type { LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, Verdict } from '@mmf/game-kit';
import type { RuntimeVariant } from '../shared/types';
import { scriptForVariant } from '../shared/variant-script';
import * as dispatch from './logic';
import { queueScriptSchema, validateQueueArtifact } from './queue';
import { createQueueRuntime } from './queue-runtime';

function isQueue(detail: LevelDetail): boolean {
  const script = detail.levelScript as { mode?: string } | null;
  return script?.mode === 'queue';
}

export const simulateVerifier = {
  parseScript(input: unknown): unknown {
    const script = input as { mode?: string } | null;
    return script?.mode === 'queue' ? queueScriptSchema.parse(input) : dispatch.parseScript(input);
  },
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
    if (isQueue(detail)) {
      const result = validateQueueArtifact(
        scriptForVariant(detail, variant, (input) => queueScriptSchema.parse(input)),
        artifact,
      );
      return {
        passed: result.passed,
        stamps: result.passed ? (variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer']) : [],
        failure: result.passed ? undefined : {
          class: result.failures[0] ?? 'queue-not-run',
          variantId: variant.id,
          causes: [{ kind: 'constraint', ref: 'queue', messageKey: '排队指标还没有全部达标。' }],
        },
        missingEvidence: [],
        artifacts: [],
      };
    }
    return dispatch.validateArtifact(detail, variant, artifact);
  },
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
    if (isQueue(detail)) {
      const script = queueScriptSchema.parse(detail.levelScript);
      const raw = artifact as { params?: { servers?: number; serviceTime?: number; openMinutes?: number } } | null;
      const params = {
        servers: raw?.params?.servers ?? script.servers.default,
        serviceTime: raw?.params?.serviceTime ?? script.serviceTime.default,
        openMinutes: raw?.params?.openMinutes ?? script.openMinutes.default,
      };
      return [
        { type: 'knob/set', payload: { key: 'servers', value: params.servers } },
        { type: 'knob/set', payload: { key: 'serviceTime', value: params.serviceTime } },
        { type: 'knob/set', payload: { key: 'openMinutes', value: params.openMinutes } },
        { type: 'knob/run', payload: {} },
        { type: 'knob/commit', payload: {} },
        { type: 'probe/focus', payload: { id: 'queue-metrics' } },
        { type: 'submit', payload: {} },
      ];
    }
    return dispatch.actionsFor(detail, variant, artifact);
  },
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): unknown {
    if (isQueue(detail)) {
      return queueScriptSchema.parse({ ...(detail.levelScript as object), ...(variant.patch ?? {}) });
    }
    return dispatch.applyVariant(detail, variant);
  },
  reachableFailureClasses(detail: LevelDetail): string[] {
    // queue-unserved 在当前排队模型里不可达：服务台永远接客、没有接待上限，
    // 所以 runQueue 的 served 恒等于到达人数。把它留在"可达类"里会让 A4 的
    // "每个可达类都要有负例"变成假要求（内容只能写一个永远触发不了的负例）。
    // 若以后给排队加"打烊后不再接待"或"队列上限"，先改 runQueue，再把类加回来。
    return isQueue(detail)
      ? ['queue-not-run', 'queue-wait', 'queue-overtime', 'queue-budget']
      : dispatch.reachableFailureClasses(detail);
  },
};

export function createSimulateRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return isQueue(detail) ? createQueueRuntime(detail, opts) : createSimulateDispatchRuntime(detail, opts);
}

function createSimulateDispatchRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return createSimulateRuntimeImpl(detail, opts);
}

import { createSimulateRuntime as createSimulateRuntimeImpl } from './runtime';
