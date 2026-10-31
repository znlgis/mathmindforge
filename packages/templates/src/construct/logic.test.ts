import { describe, expect, it } from 'vitest';
import { LevelDetailSchema } from '@mmf/content/full';
import paymentDetailRaw from '../../../content/src/details/g46-algorithm-payment.level.json';
import paymentSummaryRaw from '../../../content/src/levels/g46-algorithm-payment.json';
import { greedyCoins, optimalCoins } from './engine';
import { actionsFor, parseScript, reachableFailureClasses, validateArtifact } from './logic';
import type { RuntimeVariant } from '../shared/types';
import { createConstructRuntime } from './runtime';

const detail = LevelDetailSchema.parse(paymentDetailRaw);
const script = parseScript(detail.levelScript);
const base: RuntimeVariant = { id: 'base', axis: 'structure', patch: {} };

const RUN_CONFIG = {
  seed: 101,
  now: () => 1_700_000_000_000,
  locale: 'zh-CN' as const,
  reducedMotion: true,
};

function cloneArtifact(artifact: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
}

describe('coin engine', () => {
  it('finds the optimal payment for the main task', () => {
    const optimal = optimalCoins([1, 3, 4], 6);
    expect(optimal?.count).toBe(2);
    expect(optimal?.coins).toEqual([3, 3]);
  });

  it('simulates greedy paying 4+1+1 for 6', () => {
    const greedy = greedyCoins([1, 3, 4], 6);
    expect(greedy?.count).toBe(3);
    expect(greedy?.coins).toEqual([4, 1, 1]);
  });

  it('computes both golden counterexamples', () => {
    const ten = { greedy: greedyCoins([1, 3, 4], 10), optimal: optimalCoins([1, 3, 4], 10) };
    expect(ten.greedy?.count).toBe(4);
    expect(ten.greedy?.coins).toEqual([4, 4, 1, 1]);
    expect(ten.optimal?.count).toBe(3);
    expect(ten.optimal?.coins).toEqual([4, 3, 3]);

    const twelve = { greedy: greedyCoins([1, 3, 4, 5], 12), optimal: optimalCoins([1, 3, 4, 5], 12) };
    expect(twelve.greedy?.count).toBe(4);
    expect(twelve.greedy?.coins).toEqual([5, 5, 1, 1]);
    expect(twelve.optimal?.count).toBe(3);
    expect(twelve.optimal?.coins.reduce((sum, coin) => sum + coin, 0)).toBe(12);
    expect(twelve.optimal?.coins).toHaveLength(3);
  });

  it('returns null when the target cannot be paid', () => {
    expect(optimalCoins([3, 5], 7)).toBeNull();
    expect(greedyCoins([3, 5], 7)).toBeNull();
  });
});

describe('construct/payment template', () => {
  it('matches its summary entry', () => {
    expect(paymentSummaryRaw.template).toBe(detail.template);
    expect(paymentSummaryRaw.band).toBe(detail.band);
    expect(paymentSummaryRaw.thread).toBe(detail.thread);
    expect([...paymentSummaryRaw.tools].sort()).toEqual(detail.tools.map((tool) => tool.kind).sort());
    const produced = new Set(detail.tools.flatMap((tool) => tool.requiredArtifacts));
    for (const artifact of detail.requiredToolArtifacts) {
      expect(produced.has(artifact), artifact).toBe(true);
    }
  });

  it('covers every reachable failure class with feedback copy', () => {
    for (const failure of reachableFailureClasses(detail)) {
      expect(detail.feedback[failure], failure).toBeDefined();
    }
  });

  it('parses the level script with both tool configs', () => {
    expect(script.target).toBe(6);
    expect(script.denominations).toEqual([1, 3, 4]);
    expect(script.counter.minTargetGap).toBe(4);
  });

  it('accepts both golden solutions', () => {
    for (const solution of detail.solutions) {
      const verdict = validateArtifact(detail, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.artifacts.map((item) => item.id)).toEqual(['payment', 'counterexample']);
    }
  });

  it('rejects every negative sample with its declared class', () => {
    for (const negative of detail.negativeSamples) {
      const verdict = validateArtifact(detail, base, negative.artifact);
      expect(verdict.passed, negative.id).toBe(false);
      expect(verdict.failure?.class, negative.id).toBe(negative.expectFailure);
    }
  });

  it('keeps the golden solution valid under representation variants', () => {
    for (const variant of detail.variants) {
      const verdict = validateArtifact(detail, variant, detail.solutions[0]?.artifact);
      expect(verdict.passed, variant.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('rejects reusing the main task even when greedy is worse', () => {
    const artifact = cloneArtifact(detail.solutions[0]?.artifact as Record<string, unknown>);
    const counter = artifact.counterexample as Record<string, unknown>;
    counter.target = 6;
    counter.denominations = [1, 3, 4];
    counter.greedyCoins = 3;
    counter.optimalCoins = 2;
    const verdict = validateArtifact(detail, base, artifact);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('counter-reused-main');
    expect(verdict.failure?.causes[0]?.ref).toBe('same-instance');
  });

  it('rejects counterexamples closer than minTargetGap to the main target', () => {
    const artifact = cloneArtifact(detail.solutions[0]?.artifact as Record<string, unknown>);
    const counter = artifact.counterexample as Record<string, unknown>;
    counter.target = 7;
    counter.denominations = [1, 3, 4, 5];
    counter.greedyCoins = 3;
    counter.optimalCoins = 2;
    const verdict = validateArtifact(detail, base, artifact);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('counter-reused-main');
    expect(verdict.failure?.causes[0]?.ref).toBe('target-gap');
  });

  it('fails submit without any tool artifact', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.length ?? 0).toBeGreaterThan(0);
  });

  it('autoplays the golden solution through public actions', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    const result = await runtime.autoplay();
    expect(result.verdict?.passed, result.verdict?.failure?.class).toBe(true);
    expect(result.snapshot.checkpoints.construct).toBe(true);
    expect(result.snapshot.checkpoints.test).toBe(true);
    expect(result.snapshot.checkpoints.annotate).toBe(true);
    expect(result.snapshot.checkpoints.commit).toBe(true);
    expect(result.snapshot.artifacts.map((item) => item.id)).toEqual(['payment', 'counterexample']);
    const coins = result.snapshot.toolState.construct?.pieces.map((piece) => Number(piece.shape));
    expect(coins).toEqual([3, 3]);
  });

  it('builds an autoplay action list from the golden artifact', () => {
    const actions = actionsFor(detail, base, detail.solutions[0]?.artifact);
    expect(actions[0]?.type).toBe('construct/place');
    expect(actions.map((action) => action.type)).toEqual([
      'construct/place',
      'construct/place',
      'counter/edit',
      'counter/test',
      'counter/annotate',
      'counter/commit',
      'submit',
    ]);
  });

  it('does not grant a transfer gate for representation-only variants', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    const result = await runtime.autoplay();
    expect(result.verdict?.stamps).toEqual(['constraint']);
  });

  it('tracks coins, totals and removals through construct actions', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'x', shape: '4', x: 0, y: 0 } } });
    await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'y', shape: '1', x: 1, y: 0 } } });
    let snapshot = runtime.snapshot();
    let payment = snapshot.artifacts.find((item) => item.id === 'payment');
    expect(payment?.summary).toBe('1 + 4 = 5 · 2 枚');

    const first = snapshot.toolState.construct?.pieces[0];
    expect(first?.shape).toBe('4');
    await runtime.dispatch({ type: 'construct/remove', payload: { pieceId: first?.id ?? '' } });
    snapshot = runtime.snapshot();
    payment = snapshot.artifacts.find((item) => item.id === 'payment');
    expect(payment?.summary).toBe('1 = 1 · 1 枚');
  });

  it('rejects an out-of-range counterexample target and resets the test flag on edit', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'x', shape: '3', x: 0, y: 0 } } });
    await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'y', shape: '3', x: 1, y: 0 } } });

    const invalid = await runtime.dispatch({
      type: 'counter/edit',
      payload: { patch: { ruleId: 'greedy', instance: { target: 99, denominations: [1, 3, 4] } } },
    });
    expect(invalid.ok).toBe(false);

    await runtime.dispatch({
      type: 'counter/edit',
      payload: { patch: { ruleId: 'greedy', instance: { target: 10, denominations: [1, 3, 4] } } },
    });
    await runtime.dispatch({ type: 'counter/test', payload: {} });
    await runtime.dispatch({ type: 'counter/annotate', payload: { premiseId: 'greedy-optimal' } });
    expect(runtime.snapshot().toolState.counter?.lastTest?.passed).toBe(true);

    await runtime.dispatch({
      type: 'counter/edit',
      payload: { patch: { ruleId: 'greedy', instance: { target: 12, denominations: [1, 3, 4, 5] } } },
    });
    expect(runtime.snapshot().toolState.counter?.lastTest).toBeUndefined();
    const commit = await runtime.dispatch({ type: 'counter/commit', payload: {} });
    expect(commit.ok).toBe(false);
  });

  it('reports construct-not-optimal through submit when paying 4+1+1', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    for (const coin of [4, 1, 1]) {
      await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'x', shape: String(coin), x: 0, y: 0 } } });
    }
    await runtime.dispatch({
      type: 'counter/edit',
      payload: { patch: { ruleId: 'greedy', instance: { target: 10, denominations: [1, 3, 4] } } },
    });
    await runtime.dispatch({ type: 'counter/test', payload: {} });
    await runtime.dispatch({ type: 'counter/annotate', payload: { premiseId: 'greedy-optimal' } });
    await runtime.dispatch({ type: 'counter/commit', payload: {} });

    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('construct-not-optimal');
    expect(result.verdict?.failure?.causes[0]?.params?.count).toBe(3);
  });
});
