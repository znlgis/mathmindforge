import type { ArtifactSummary, FailureCause, LevelAction, LevelDetail, Verdict } from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import type { RuntimeVariant } from '../shared/types';
import {
  coinsTotal, evaluateCounterexample, optimalCoins, premiseIsCorrect,
} from './engine';
import type { CounterEvaluation } from './engine';
import { paymentScriptSchema } from './schema';
import type { PaymentScript } from './schema';

export type { PaymentScript };

export const FAILURE_CLASSES = [
  'construct-not-optimal',
  'construct-overpay',
  'counter-not-tested',
  'counter-invalid',
  'counter-reused-main',
  'counter-wrong-premise',
] as const;
export type ConstructFailureClass = (typeof FAILURE_CLASSES)[number];

const MESSAGE_KEYS: Record<ConstructFailureClass, string> = {
  'construct-not-optimal': 'level.payment.notOptimal.message',
  'construct-overpay': 'level.payment.overpay.message',
  'counter-not-tested': 'level.payment.notTested.message',
  'counter-invalid': 'level.payment.invalid.message',
  'counter-reused-main': 'level.payment.reused.message',
  'counter-wrong-premise': 'level.payment.premise.message',
};

export function parseScript(input: unknown): PaymentScript {
  return paymentScriptSchema.parse(input);
}

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)) {
      out[key] = mergeRecord(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 变体补丁只允许改表征/文案；判定逻辑与主任务一致。 */
export function applyVariant(script: PaymentScript, variant: RuntimeVariant): PaymentScript {
  if (!variant.patch || Object.keys(variant.patch).length === 0) return script;
  const merged = mergeRecord(script as unknown as Record<string, unknown>, variant.patch);
  return parseScript(merged);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function asCoinList(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const coin = asPositiveInt(item);
    if (coin === null) return null;
    out.push(coin);
  }
  return out.length > 0 ? out : null;
}

function asDenominations(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const coin = asPositiveInt(item);
    if (coin === null) return null;
    if (!out.includes(coin)) out.push(coin);
  }
  return out.length >= 2 ? out.sort((a, b) => a - b) : null;
}

function sameNumberSet(a: readonly number[], b: readonly number[]): boolean {
  const left = [...new Set(a)].sort((x, y) => x - y);
  const right = [...new Set(b)].sort((x, y) => x - y);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function summarizePayment(coins: readonly number[]): ArtifactSummary {
  const total = coinsTotal(coins);
  const ordered = [...coins].sort((a, b) => a - b);
  return {
    id: 'payment',
    kind: 'placement-set',
    digest: digest({ coins: ordered }),
    summary: ordered.join(' + ') + ' = ' + total + ' · ' + ordered.length + ' 枚',
  };
}

export function summarizeCounter(instance: { target: number; denominations: number[] }): ArtifactSummary {
  const evaluation = evaluateCounterexample({
    target: instance.target,
    denominations: instance.denominations,
  });
  const greedy = evaluation.greedy ? evaluation.greedy.count + ' 枚' : '付不清';
  const optimal = evaluation.optimal ? evaluation.optimal.count + ' 枚' : '付不清';
  return {
    id: 'counterexample',
    kind: 'counterexample',
    digest: digest({
      target: instance.target,
      denominations: [...new Set(instance.denominations)].sort((a, b) => a - b),
    }),
    summary: '贪心 ' + greedy + '，最优 ' + optimal,
  };
}

export function summarizeArtifact(artifact: unknown): ArtifactSummary[] {
  const raw = asRecord(artifact);
  if (!raw) return [];
  const out: ArtifactSummary[] = [];
  const payment = asRecord(raw.payment);
  const coins = payment ? asCoinList(payment.coins) : null;
  if (coins) out.push(summarizePayment(coins));
  const counter = asRecord(raw.counterexample);
  if (counter) {
    const target = asPositiveInt(counter.target);
    const denominations = asDenominations(counter.denominations);
    if (target !== null && denominations) out.push(summarizeCounter({ target, denominations }));
  }
  return out;
}

interface Failure {
  class: ConstructFailureClass;
  causes: FailureCause[];
}

function failure(
  failureClass: ConstructFailureClass,
  ref: string,
  params?: Record<string, string | number>,
): Failure {
  return {
    class: failureClass,
    causes: [{ kind: 'constraint', ref, messageKey: MESSAGE_KEYS[failureClass], params }],
  };
}

function paymentFailure(script: PaymentScript, payment: Record<string, unknown> | null): Failure | null {
  const coins = payment ? asCoinList(payment.coins) : null;
  if (!payment || !coins) return failure('construct-not-optimal', 'payment-missing');
  const total = coinsTotal(coins);
  const count = coins.length;

  if (payment.total !== undefined) {
    const declaredTotal = asNonNegativeInt(payment.total);
    if (declaredTotal === null) return failure('construct-overpay', 'total-invalid');
    if (declaredTotal !== total) {
      return failure('construct-overpay', 'total-mismatch', { declared: declaredTotal, actual: total });
    }
  }
  if (payment.count !== undefined) {
    const declaredCount = asNonNegativeInt(payment.count);
    if (declaredCount === null || declaredCount !== count) {
      return failure('construct-not-optimal', 'count-mismatch', {
        declared: declaredCount ?? -1,
        actual: count,
      });
    }
  }

  const allowed = new Set(script.denominations);
  const unknown = coins.find((coin) => !allowed.has(coin));
  if (unknown !== undefined) return failure('construct-not-optimal', 'coin-not-allowed', { coin: unknown });

  if (total > script.target) return failure('construct-overpay', 'total', { total, target: script.target });
  if (total < script.target) return failure('construct-not-optimal', 'short', { total, target: script.target });

  const best = optimalCoins(script.denominations, script.target);
  if (!best) return failure('construct-not-optimal', 'main-unreachable');
  if (count > best.count) return failure('construct-not-optimal', 'count', { count, optimal: best.count });
  if (count < best.count) {
    return failure('construct-not-optimal', 'count-below-optimal', { count, optimal: best.count });
  }
  return null;
}

/**
 * 顺序有意义：
 * 1) 复用了主任务参数 → counter-reused-main（即使贪心确实更差，也不接受）；
 * 2) 目标离主任务太近（< minTargetGap）→ 同样按"和主任务太像"拒绝；
 * 3) 没测试过 → counter-not-tested；
 * 4) 贪心并不差 / 数字对不上 → counter-invalid；
 * 5) 前提不对 → counter-wrong-premise。
 */
function counterFailure(script: PaymentScript, raw: unknown): Failure | null {
  const cfg = script.counter;
  const counter = asRecord(raw);
  if (!counter) return failure('counter-not-tested', 'missing');

  const target = asPositiveInt(counter.target);
  const denominations = asDenominations(counter.denominations);
  if (target === null || denominations === null) return failure('counter-invalid', 'structure');

  const [minTarget, maxTarget] = cfg.targetRange;
  if (target < minTarget || target > maxTarget) {
    return failure('counter-invalid', 'target-range', { target, min: minTarget, max: maxTarget });
  }
  const pool = new Set(cfg.denominationPool);
  const outside = denominations.find((coin) => !pool.has(coin));
  if (outside !== undefined) return failure('counter-invalid', 'denomination-pool', { coin: outside });

  if (target === script.target && sameNumberSet(denominations, script.denominations)) {
    return failure('counter-reused-main', 'same-instance');
  }
  const targetGap = Math.abs(target - script.target);
  if (cfg.minTargetGap > 0 && targetGap < cfg.minTargetGap) {
    return failure('counter-reused-main', 'target-gap', { gap: targetGap, minGap: cfg.minTargetGap });
  }

  if (counter.tested !== true) return failure('counter-not-tested', 'untested');

  const evaluation: CounterEvaluation = evaluateCounterexample({ target, denominations });
  if (!evaluation.greedy) return failure('counter-invalid', 'greedy-cannot-pay', { target });
  if (!evaluation.isCounterexample) {
    return failure('counter-invalid', 'not-counter', {
      greedy: evaluation.greedyCount ?? -1,
      optimal: evaluation.optimalCount ?? -1,
    });
  }

  if (counter.greedyCoins !== undefined) {
    const declared = asNonNegativeInt(counter.greedyCoins);
    if (declared === null || declared !== evaluation.greedyCount) {
      return failure('counter-invalid', 'greedy-mismatch', {
        declared: declared ?? -1,
        actual: evaluation.greedyCount ?? -1,
      });
    }
  }
  if (counter.optimalCoins !== undefined) {
    const declared = asNonNegativeInt(counter.optimalCoins);
    if (declared === null || declared !== evaluation.optimalCount) {
      return failure('counter-invalid', 'optimal-mismatch', {
        declared: declared ?? -1,
        actual: evaluation.optimalCount ?? -1,
      });
    }
  }

  const premise = typeof counter.failedPremise === 'string' ? counter.failedPremise : '';
  if (premise.length === 0) return failure('counter-wrong-premise', 'missing-premise');
  if (!cfg.premises.includes(premise)) {
    return failure('counter-wrong-premise', 'unknown-premise', { premise });
  }
  if (!premiseIsCorrect(premise, evaluation)) {
    return failure('counter-wrong-premise', 'premise', { premise });
  }
  return null;
}

function artifactFailure(script: PaymentScript, artifact: unknown): Failure | null {
  const raw = asRecord(artifact);
  if (!raw) return failure('construct-not-optimal', 'payment-missing');
  return paymentFailure(script, asRecord(raw.payment)) ?? counterFailure(script, raw.counterexample);
}

export interface ConstructVerifier {
  parseScript(input: unknown): PaymentScript;
  validateArtifact(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict;
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[];
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): PaymentScript;
  reachableFailureClasses(detail: LevelDetail): string[];
}

export function validateArtifact(
  detail: LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): Verdict {
  const script = applyVariant(parseScript(detail.levelScript), variant);
  const artifacts = summarizeArtifact(artifact);
  const found = artifactFailure(script, artifact);
  if (found) {
    return {
      passed: false,
      stamps: [],
      failure: { class: found.class, variantId: variant.id, causes: found.causes },
      missingEvidence: [],
      artifacts,
    };
  }
  const stamps: Verdict['stamps'] = ['constraint'];
  if (variant.id !== 'base') stamps.push('transfer');
  return { passed: true, stamps, missingEvidence: [], artifacts };
}

export function actionsFor(
  detail: LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): LevelAction[] {
  const script = applyVariant(parseScript(detail.levelScript), variant);
  const raw = asRecord(artifact);
  const actions: LevelAction[] = [];

  const payment = raw ? asRecord(raw.payment) : null;
  const coins = payment ? asCoinList(payment.coins) : null;
  if (coins) {
    for (const coin of coins) {
      actions.push({
        type: 'construct/place',
        payload: { piece: { id: 'coin-auto', shape: String(coin), x: actions.length, y: 0 } },
      });
    }
  }

  const counter = raw ? asRecord(raw.counterexample) : null;
  if (counter) {
    const target = asPositiveInt(counter.target);
    const denominations = asDenominations(counter.denominations);
    if (target !== null && denominations) {
      actions.push({
        type: 'counter/edit',
        payload: { patch: { ruleId: 'greedy', instance: { target, denominations } } },
      });
      actions.push({ type: 'counter/test', payload: {} });
      const premise = typeof counter.failedPremise === 'string'
        ? counter.failedPremise
        : (script.counter.premises[0] ?? 'greedy-optimal');
      actions.push({ type: 'counter/annotate', payload: { premiseId: premise } });
      actions.push({ type: 'counter/commit', payload: {} });
    }
  }

  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_detail: LevelDetail): string[] {
  return [...FAILURE_CLASSES];
}

export const constructVerifier: ConstructVerifier = {
  parseScript,
  validateArtifact,
  actionsFor,
  applyVariant(detail: LevelDetail, variant: RuntimeVariant): PaymentScript {
    return applyVariant(parseScript(detail.levelScript), variant);
  },
  reachableFailureClasses,
};
