import { describe, expect, it } from 'vitest';
import type { LevelDetail } from '@mmf/content';
import tallyDetailJson from '../../../content/src/details/k-data-tally.level.json';
import winrateDetailJson from '../../../content/src/details/g1012-modeling-winrate.level.json';
import { simulateDuel, paramsValid } from './duel';
import {
  actionsFor, applyVariant, measureDuel, parseScript, reachableFailureClasses,
  scriptIssues, transferVariants, validateArtifact,
} from './logic';
import type { DuelScript, TallyScript } from './schema';
import { createExperimentRuntime } from './runtime';
import { extremes, truthCounts } from './tally';

const tallyDetail = tallyDetailJson as unknown as LevelDetail;
const winrateDetail = winrateDetailJson as unknown as LevelDetail;
const baseVariant = { id: 'base', axis: 'structure', patch: {} };

function runtimeOf(detail: LevelDetail) {
  return createExperimentRuntime(detail, {
    seed: 101,
    now: () => 1_700_000_000_000,
    locale: 'zh-CN',
    reducedMotion: true,
  });
}

describe('experiment template · tally', () => {
  const script = parseScript(tallyDetail.levelScript) as TallyScript;

  it('derives the same counts as the declared categories', () => {
    const counts = truthCounts(script);
    expect(counts).toEqual({ circle: 6, square: 5, triangle: 6, star: 3 });
    expect(script.items).toHaveLength(20);
    for (const category of script.categories) {
      expect(counts[category.id], category.id).toBe(category.count);
    }
    expect(extremes(counts)).toEqual({ most: ['circle', 'triangle'], least: ['star'] });
  });

  it('accepts both golden solutions', () => {
    for (const solution of tallyDetail.solutions) {
      const verdict = validateArtifact(tallyDetail, baseVariant, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('rejects every negative sample with its declared class', () => {
    for (const negative of tallyDetail.negativeSamples) {
      const verdict = validateArtifact(tallyDetail, baseVariant, negative.artifact);
      expect(verdict.passed, negative.id).toBe(false);
      expect(verdict.failure?.class, negative.id).toBe(negative.expectFailure);
    }
  });

  it('rejects a tie claim that forgets the other category', () => {
    const artifact = {
      dataset: { n: 20, counts: { circle: 6, square: 5, triangle: 6, star: 3 } },
      tally: { counts: { circle: 6, square: 5, triangle: 6, star: 3 } },
      claim: { kind: 'count-compare', category: 'circle', direction: 'most', n: 20 },
    };
    const verdict = validateArtifact(tallyDetail, baseVariant, artifact);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('probe-claim-mismatch');
  });

  it('applies representation variants and keeps them parseable', () => {
    const fruit = tallyDetail.variants.find((variant) => variant.id === 'v-fruit');
    const five = tallyDetail.variants.find((variant) => variant.id === 'v-five');
    expect(fruit && five).toBeTruthy();
    const fruitScript = applyVariant(script, fruit!) as TallyScript;
    expect(fruitScript.categories[0]?.token).toBe('🍎');
    const fiveScript = applyVariant(script, five!) as TallyScript;
    expect(fiveScript.items).toHaveLength(25);
    expect(fiveScript.categories).toHaveLength(5);
  });

  it('has no content issues and no transfer gate', () => {
    expect(scriptIssues(script)).toEqual([]);
    expect(transferVariants(tallyDetail)).toEqual([]);
    expect(reachableFailureClasses(tallyDetail)).toHaveLength(4);
  });

  it('refuses submit without tool artifacts', async () => {
    const runtime = runtimeOf(tallyDetail);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect((result.verdict?.missingEvidence.length ?? 0)).toBeGreaterThan(0);
  });

  it('autoplays through collect → tally → claim', async () => {
    const runtime = runtimeOf(tallyDetail);
    const result = await runtime.autoplay();
    expect(result.verdict?.passed, result.verdict?.failure?.class).toBe(true);
    expect(result.snapshot.checkpoints.sample).toBe(true);
    expect(result.snapshot.checkpoints.tally).toBe(true);
    expect(result.snapshot.checkpoints.claim).toBe(true);
    expect(result.snapshot.toolState.probe?.items).toHaveLength(20);
    expect(result.snapshot.toolState.probe?.dataset?.n).toBe(20);
  });

  it('does not let a partial collection reach the tally step', async () => {
    const runtime = runtimeOf(tallyDetail);
    await runtime.dispatch({ type: 'probe/sample', payload: {} });
    const tallyStep = await runtime.dispatch({
      type: 'probe/tally',
      payload: { counts: { circle: 2, square: 1, triangle: 1, star: 1 } },
    });
    expect(tallyStep.ok).toBe(false);
  });

  it('exposes every declared action through actionsFor（一次倒出整筐）', () => {
    const actions = actionsFor(tallyDetail, baseVariant, tallyDetail.solutions[0]?.artifact);
    const samples = actions.filter((action) => action.type === 'probe/sample');
    expect(samples).toHaveLength(1);
    expect(samples[0]?.payload.n).toBe(tallyDetail.levelScript && (tallyDetail.levelScript as { items?: string[] }).items?.length);
    expect(actions.some((action) => action.type === 'probe/tally')).toBe(true);
    expect(actions.some((action) => action.type === 'submit')).toBe(true);
  });

  it('一次性倒出整筐：probe/sample 的 payload.n 覆盖剩余量', async () => {
    const runtime = runtimeOf(tallyDetail);
    const result = await runtime.dispatch({ type: 'probe/sample', payload: { n: 20 } });
    expect(result.ok).toBe(true);
    expect(result.snapshot.toolState.probe?.items).toHaveLength(20);
    expect(result.snapshot.checkpoints.sample).toBe(true);
  });

  it('界面读的两份配置与关卡脚本不漂移（整筐总数、批次大小）', () => {
    const probe = tallyDetail.tools.find((tool) => tool.kind === 'probe');
    expect(probe).toBeTruthy();
    if (!probe || probe.kind !== 'probe') return;
    const extras = probe.config as unknown as { total?: number; batchSize?: number };
    const script = parseScript(tallyDetail.levelScript) as TallyScript;
    expect(extras.total).toBe(script.items.length);
    expect(extras.batchSize).toBe(script.batchSize);
  });
});

describe('experiment template · duel', () => {
  const script = parseScript(winrateDetail.levelScript) as DuelScript;

  it('is deterministic for a fixed seed', () => {
    const first = simulateDuel(script, { attack: 50, defense: 50, economy: 0 }, 101, 1000);
    const second = simulateDuel(script, { attack: 50, defense: 50, economy: 0 }, 101, 1000);
    expect(first.wins).toBe(851);
    expect(second.wins).toBe(first.wins);
    expect(first.winRate).toBe(0.851);
    expect(simulateDuel(script, { attack: 50, defense: 50, economy: 0 }, 202, 1000).wins).toBe(847);
    expect(simulateDuel(script, { attack: 45, defense: 35, economy: 20 }, 101, 1000).wins).toBe(691.5);
    expect(simulateDuel(script, { attack: 45, defense: 35, economy: 20 }, 202, 1000).wins).toBe(696.5);
  });

  it('keeps the calibrated claims consistent with simulateDuel', () => {
    for (const solution of winrateDetail.solutions) {
      const artifact = solution.artifact as {
        params: { attack: number; defense: number; economy: number };
        dataset: { n: number; wins: number; seed?: number };
        claim: { value: number; n: number; ci?: [number, number] };
      };
      const measured = measureDuel(script, artifact.params, 0, artifact.dataset.n);
      expect(measured.wins, solution.id).toBe(artifact.dataset.wins);
      expect(measured.winRate).toBeCloseTo(artifact.claim.value, 4);
      if (artifact.claim.ci) {
        expect(measured.ci[0]).toBeCloseTo(artifact.claim.ci[0], 3);
        expect(measured.ci[1]).toBeCloseTo(artifact.claim.ci[1], 3);
      }
      expect(measured.winRate).toBeGreaterThanOrEqual(script.targets.winRate);
      expect(measured.ci[0]).toBeGreaterThanOrEqual(script.targets.winRateLow);
    }
  });

  it('accepts both golden solutions and rejects negatives with declared classes', () => {
    for (const solution of winrateDetail.solutions) {
      const verdict = validateArtifact(winrateDetail, baseVariant, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
    }
    for (const negative of winrateDetail.negativeSamples) {
      const verdict = validateArtifact(winrateDetail, baseVariant, negative.artifact);
      expect(verdict.passed, negative.id).toBe(false);
      expect(verdict.failure?.class, negative.id).toBe(negative.expectFailure);
    }
  });

  it('keeps the sample floor and the tie-breaking rules', () => {
    const artifact = {
      params: { attack: 50, defense: 50, economy: 0 },
      dataset: { n: 999, wins: 850, seed: 101 },
      claim: { kind: 'stat', statistic: 'proportion', value: 0.85, n: 999 },
    };
    const verdict = validateArtifact(winrateDetail, baseVariant, artifact);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('exp-sample-small');
    expect(paramsValid(script, { attack: 50, defense: 50, economy: 5 })).toBe(false);
  });

  it('gates on the B seed and reports exp-overfit-seed', () => {
    const variants = transferVariants(winrateDetail);
    expect(variants).toHaveLength(1);
    const overfit = {
      params: { attack: 100, defense: 0, economy: 0 },
      dataset: { n: 1000, wins: 500, seed: 101 },
      claim: { kind: 'stat', statistic: 'proportion', value: 0.48, n: 1000 },
    };
    const verdict = validateArtifact(winrateDetail, variants[0]!, overfit);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('exp-overfit-seed');
  });

  it('applies both variants and keeps them parseable', () => {
    for (const variant of winrateDetail.variants) {
      const patched = applyVariant(script, variant);
      expect(patched.mode).toBe('duel');
    }
    const resources = applyVariant(
      script,
      winrateDetail.variants.find((variant) => variant.id === 'v-resources')!,
    ) as DuelScript;
    expect(resources.resources).toBe(80);
    expect(resources.rounds).toBe(12);
    expect(paramsValid(resources, { attack: 25, defense: 25, economy: 30 })).toBe(true);
    const opponents = applyVariant(
      script,
      winrateDetail.variants.find((variant) => variant.id === 'v-opponents')!,
    ) as DuelScript;
    expect(opponents.opponents.map((opponent) => opponent.weight)).toEqual([5, 3, 2]);
  });

  it('has no content issues', () => {
    expect(scriptIssues(script)).toEqual([]);
    expect(reachableFailureClasses(winrateDetail)).toHaveLength(5);
  });

  it('refuses submit without sampling', async () => {
    const runtime = runtimeOf(winrateDetail);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.map((item) => item.checkpointId)).toContain('run');
  });

  it('autoplays and earns the transfer stamp', async () => {
    const runtime = runtimeOf(winrateDetail);
    const result = await runtime.autoplay();
    expect(result.verdict?.passed, result.verdict?.failure?.class).toBe(true);
    expect(result.verdict?.stamps).toContain('transfer');
    expect(result.snapshot.checkpoints.strategy).toBe(true);
    expect(result.snapshot.toolState.probe?.dataset?.n).toBe(1000);
    expect(result.snapshot.toolState.probe?.dataset?.counts?.wins).toBe(851);
  });

  it('treats knob/run as commit + default sample', async () => {
    const runtime = runtimeOf(winrateDetail);
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'attack', value: 50 } });
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'defense', value: 50 } });
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'economy', value: 0 } });
    const run = await runtime.dispatch({ type: 'knob/run', payload: {} });
    expect(run.ok).toBe(true);
    expect(runtime.snapshot().toolState.probe?.dataset?.n).toBe(1000);
    expect(runtime.snapshot().toolState.probe?.dataset?.counts?.wins).toBe(851);
    expect(runtime.snapshot().checkpoints.strategy).toBe(true);
    expect(runtime.snapshot().checkpoints.run).toBe(true);
  });

  it('drops the old sample when a knob is turned', async () => {
    const runtime = runtimeOf(winrateDetail);
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'attack', value: 50 } });
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'defense', value: 50 } });
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'economy', value: 0 } });
    await runtime.dispatch({ type: 'knob/commit', payload: {} });
    await runtime.dispatch({ type: 'probe/sample', payload: { n: 1000 } });
    expect(runtime.snapshot().toolState.probe?.dataset?.n).toBe(1000);
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'attack', value: 45 } });
    expect(runtime.snapshot().toolState.probe?.dataset).toBeUndefined();
    const commit = await runtime.dispatch({ type: 'knob/commit', payload: {} });
    expect(commit.ok).toBe(false);
  });

  it('旋钮配置把三条目标线与运行入口写给界面（目标线必须上屏）', () => {
    const knob = winrateDetail.tools.find((tool) => tool.kind === 'knob');
    expect(knob).toBeTruthy();
    if (!knob || knob.kind !== 'knob') return;
    const extras = knob.config as unknown as {
      runLabel?: string;
      sumTo?: number;
      metricsMode?: string;
      presets?: Record<string, number>[];
      targets?: { winRate?: number; winRateLow?: number; baselineB?: number };
    };
    expect(extras.runLabel).toBeTruthy();
    expect(extras.sumTo).toBe(script.resources);
    expect(extras.metricsMode).toBe('duel');
    expect(extras.presets?.length).toBeGreaterThan(0);
    expect(extras.targets?.winRate).toBe(script.targets.winRate);
    expect(extras.targets?.winRateLow).toBe(script.targets.winRateLow);
    expect(extras.targets?.baselineB).toBe(script.targets.baselineB);
  });

  it('exposes every declared action through actionsFor（单一运行入口）', () => {
    const actions = actionsFor(winrateDetail, baseVariant, winrateDetail.solutions[0]?.artifact);
    expect(actions.filter((action) => action.type === 'knob/set')).toHaveLength(3);
    expect(actions.some((action) => action.type === 'knob/run')).toBe(true);
    expect(actions.some((action) => action.type === 'knob/commit')).toBe(false);
    expect(actions.some((action) => action.type === 'probe/sample')).toBe(false);
    expect(actions.at(-1)?.type).toBe('submit');
  });

  it('knob/run 是唯一运行入口：它同时锁定配置并跑满默认局数', async () => {
    const runtime = runtimeOf(winrateDetail);
    const actions = actionsFor(winrateDetail, baseVariant, winrateDetail.solutions[0]?.artifact);
    for (const action of actions.filter((item) => item.type !== 'submit')) {
      const result = await runtime.dispatch(action);
      expect(result.ok, action.type).toBe(true);
    }
    const snapshot = runtime.snapshot();
    expect(snapshot.checkpoints.strategy).toBe(true);
    expect(snapshot.checkpoints.run).toBe(true);
    expect(snapshot.toolState.probe?.dataset?.n).toBe(script.matches);
  });

  it('rejects an out-of-range match count without re-running the whole simulation', () => {
    // 旧实现只挡 n <= 0，1e9 这种产物会让重算卡死；超上限应直接按“没跑过”拒绝。
    const artifact = {
      params: { attack: 50, defense: 50, economy: 0 },
      dataset: { n: 5001, wins: 5000, seed: 101 },
      claim: { kind: 'stat', statistic: 'proportion', value: 0.85, n: 5001 },
    };
    const verdict = validateArtifact(winrateDetail, baseVariant, artifact);
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('exp-not-run');
  });
});
