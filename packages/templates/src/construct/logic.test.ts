import { describe, expect, it } from 'vitest';
import { LevelDetailSchema } from '@mmf/content/full';
import paymentDetailRaw from '../../../content/src/details/g46-algorithm-payment.level.json';
import paymentSummaryRaw from '../../../content/src/levels/g46-algorithm-payment.json';
import packDetailRaw from '../../../content/src/details/g13-modeling-pack.level.json';
import networkLevelRaw from '../../../content/src/details/g79-structure-network.level.json';
import scheduleDetailRaw from '../../../content/src/details/g79-algorithm-schedule.level.json';
import frontierDetailRaw from '../../../content/src/details/g1012-algorithm-frontier.level.json';
import { constructVerifier } from './verifier';
import { greedyCoins, optimalCoins } from './engine';
import { actionsFor, parseScript, reachableFailureClasses, validateArtifact } from './logic';
import { networkScriptSchema, selectedEdges, validateNetworkArtifact } from './network';
import type { RuntimeVariant } from '../shared/types';
import { createConstructRuntime } from './runtime';
import { createDistributionRuntime } from './distribution';
import { createNetworkRuntime } from './network-runtime';
import { createScheduleRuntime } from './schedule-runtime';
import { createFrontierRuntime } from './frontier-runtime';

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
    expect(result.snapshot.checkpoints.payment).toBe(true);
    expect(result.snapshot.checkpoints.counter).toBe(true);
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


describe('construct/network minKeyEdges', () => {
  const networkDetail = LevelDetailSchema.parse(networkLevelRaw);
  const networkScript = networkScriptSchema.parse(networkDetail.levelScript);
  const selection = (edges: string[]) => selectedEdges(networkScript, { edges });

  it('counts a key-ending edge once even when both ends are key stations', () => {
    const script = networkScriptSchema.parse({
      ...networkScript,
      nodes: networkScript.nodes.map((node) => ({ ...node, key: node.id === 'A' || node.id === 'B' })),
    });
    // ab 的两端（A、B）都是关键站点：按"边"算 1 条，而不是按端点算 2 条。
    expect(selectedEdges(script, { edges: ['ab'] }).keyEdges).toBe(1);
  });

  it('lets both golden solutions through under the new rule', () => {
    for (const solution of networkDetail.solutions) {
      const verdict = validateNetworkArtifact(networkScript, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failures.join(',')).toBe(true);
    }
  });

  it('rejects a connected, in-budget artifact whose key stations only get two roads', () => {
    // 能连通（A-B-C、B-D、D-E）、成本 7 ≤ 9，但学校和医院只各接 1 条：keyEdges = 2 < minKeyEdges = 3。
    // 旧实现按端点累加（1 + 1 = 2 ≥ 2）会放行，新实现必须落到 network-key。
    const result = validateNetworkArtifact(networkScript, { edges: ['ab', 'bc', 'bd', 'de'] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe('network-key');
    expect(result.metrics.keyEdges).toBe(2);
  });

  it('shows network-key as reachable for this level', () => {
    const reachable = constructVerifier.reachableFailureClasses(networkDetail);
    expect(reachable).toContain('network-key');
    expect(networkDetail.feedback['network-key']).toBeDefined();
  });

  it('rejects every network negative sample with its declared class', () => {
    for (const negative of networkDetail.negativeSamples) {
      const result = validateNetworkArtifact(networkScript, negative.artifact);
      expect(result.passed, negative.id).toBe(false);
      expect(result.failures[0], negative.id).toBe(negative.expectFailure);
    }
  });

  it('selects the new hub solution and reports the key-edge count', () => {
    const verdict = validateNetworkArtifact(networkScript, { edges: ['ab', 'ae', 'bd', 'ce'] });
    expect(verdict.passed).toBe(true);
    expect(selection(['ab', 'ae', 'bd', 'ce']).keyEdges).toBe(3);
    expect(selection(['ab', 'bc', 'bd', 'ce']).keyEdges).toBe(3);
  });
});

describe('construct/distribution validation', () => {
  const packDetail = LevelDetailSchema.parse(packDetailRaw);

  function artifactOf(containers: { id: string; counts: Record<string, number>; total: number }[]) {
    return { distribution: { containers, totals: { block: 3, ball: 3, book: 3 } } };
  }

  it('accepts the golden solutions', () => {
    for (const solution of packDetail.solutions) {
      const verdict = constructVerifier.validateArtifact(packDetail, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('ignores items this level does not define when counting kinds', () => {
    // 每个盒子实际只有一种物品（minKinds=2 不满足）；旧实现把未登记的 zzz 也算一种。
    const verdict = constructVerifier.validateArtifact(packDetail, base, artifactOf([
      { id: 'box0', counts: { block: 3, zzz: 1 }, total: 3 },
      { id: 'box1', counts: { ball: 3, zzz: 1 }, total: 3 },
      { id: 'box2', counts: { book: 3, zzz: 1 }, total: 3 },
    ]));
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('distribution-missing-kind');
  });

  it('counts container size from known items instead of the declared total', () => {
    // 把 total 写小也盖不住真实件数：box0 装了 6 件，超过 maxPerContainer=4。
    const verdict = constructVerifier.validateArtifact(packDetail, base, artifactOf([
      { id: 'box0', counts: { block: 3, ball: 3 }, total: 1 },
      { id: 'box1', counts: {}, total: 1 },
      { id: 'box2', counts: {}, total: 1 },
    ]));
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('distribution-overflow');
  });
});

describe('construct answerComplete 自动判题口径', () => {
  it('payment：硬币够付且反例前提已指出才算填完（对错仍交给 validate）', async () => {
    const runtime = createConstructRuntime(detail, RUN_CONFIG);
    expect(runtime.snapshot().answerComplete).toBe(false);

    // 只放了硬币、反例还没指出前提：还没填完。
    for (const coin of [4, 1, 1]) {
      await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'c-' + coin, shape: String(coin), x: 0, y: 0 } } });
    }
    expect(runtime.snapshot().answerComplete).toBe(false);

    await runtime.dispatch({
      type: 'counter/edit',
      payload: { patch: { ruleId: 'greedy', instance: { target: 10, denominations: [1, 3, 4] } } },
    });
    await runtime.dispatch({ type: 'counter/test', payload: {} });
    await runtime.dispatch({ type: 'counter/annotate', payload: { premiseId: 'greedy-optimal' } });

    // 4+1+1 凑齐了 6 元、前提也选了：算"填完"，尽管它不是最优答案。
    expect(runtime.snapshot().answerComplete).toBe(true);
    const wrong = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(wrong.verdict?.passed).toBe(false);
    expect(wrong.verdict?.failure?.class).toBe('construct-not-optimal');

    // 拿掉一枚硬币，金额不够了，立刻退回"没填完"。
    const first = runtime.snapshot().toolState.construct?.pieces[0];
    await runtime.dispatch({ type: 'construct/remove', payload: { pieceId: first?.id ?? '' } });
    expect(runtime.snapshot().answerComplete).toBe(false);
  });

  it('distribution：每一类物品都分完才算填完', async () => {
    const packDetail = LevelDetailSchema.parse(packDetailRaw);
    const runtime = createDistributionRuntime(packDetail, RUN_CONFIG);
    expect(runtime.snapshot().answerComplete).toBe(false);

    // 8 件：block×3、ball×3、book×2，还差一件书。
    const seq: [string, number][] = [
      ['block', 0], ['block', 1], ['block', 2],
      ['ball', 0], ['ball', 1], ['ball', 2],
      ['book', 0], ['book', 1],
    ];
    for (const [itemId, containerIndex] of seq) {
      await runtime.dispatch({
        type: 'construct/place',
        payload: { piece: { id: 'd-' + itemId + '-' + containerIndex, shape: itemId, x: containerIndex, y: 0 } },
      });
    }
    expect(runtime.snapshot().answerComplete).toBe(false);

    await runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'd-last', shape: 'book', x: 2, y: 0 } },
    });
    expect(runtime.snapshot().answerComplete).toBe(true);
  });

  it('network：选够"站点数 - 1"条边才算填完', async () => {
    const networkDetail = LevelDetailSchema.parse(networkLevelRaw);
    const runtime = createNetworkRuntime(networkDetail, RUN_CONFIG);
    expect(runtime.snapshot().answerComplete).toBe(false);

    for (const edgeId of ['ab', 'bc', 'bd']) {
      await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: 0 } } });
    }
    expect(runtime.snapshot().answerComplete).toBe(false);

    await runtime.dispatch({ type: 'construct/place', payload: { piece: { id: 'ce', shape: 'ce', x: 0, y: 0 } } });
    expect(runtime.snapshot().answerComplete).toBe(true);
  });

  it('schedule：每个课次都排进时段才算填完', async () => {
    const scheduleDetail = LevelDetailSchema.parse(scheduleDetailRaw);
    const runtime = createScheduleRuntime(scheduleDetail, RUN_CONFIG);
    expect(runtime.snapshot().answerComplete).toBe(false);

    const placed: [string, number][] = [['l1', 0], ['l2', 1], ['l3', 2]];
    for (const [lessonId, slotIndex] of placed) {
      await runtime.dispatch({
        type: 'construct/place',
        payload: { piece: { id: lessonId, shape: lessonId, x: slotIndex, y: 0 } },
      });
    }
    expect(runtime.snapshot().answerComplete).toBe(false);

    await runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'l4', shape: 'l4', x: 2, y: 0 } },
    });
    expect(runtime.snapshot().answerComplete).toBe(true);
  });

  it('frontier：没动过边不算填完，改过一条就算', async () => {
    const frontierDetail = LevelDetailSchema.parse(frontierDetailRaw);
    const runtime = createFrontierRuntime(frontierDetail, RUN_CONFIG);
    expect(runtime.snapshot().answerComplete).toBe(false);

    await runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'sa', shape: 'sa', x: 0, y: 1 } },
    });
    expect(runtime.snapshot().answerComplete).toBe(true);
  });
});
