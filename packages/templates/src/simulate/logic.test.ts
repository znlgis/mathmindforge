import { describe, expect, it } from 'vitest';
import type { LevelAction, LevelDetail } from '@mmf/game-kit';
import detailJson from '../../../content/src/details/g79-modeling-dispatch.level.json';
import { costOf, coverageOf, runSimulation, waitOf } from './engine';
import type { SimParams } from './engine';
import {
  actionsFor,
  applyVariant,
  parseScript,
  reachableFailureClasses,
  validateArtifact,
} from './logic';
import type { SimVariant } from './logic';
import { createSimulateRuntime } from './runtime';

// 直接读内容文件：不依赖 Lead 集成时对 @mmf/content/full 的登记，也不拖入整个内容层。
const detail = detailJson as unknown as LevelDetail;
const script = parseScript(detail.levelScript);
const base: SimVariant = { id: 'base', axis: 'structure', patch: {} };

function options() {
  return { seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN' as const, reducedMotion: true };
}

function metricsFor(params: SimParams) {
  const runs = runSimulation(script, params);
  return {
    runs,
    cost: costOf(script, params),
    coverageA: coverageOf(script, params, script.seeds[0]),
    waitA: waitOf(script, params, script.seeds[0]),
    waitB: waitOf(script, params, script.seeds[1]),
  };
}

const GOLDEN_A: SimParams = { vehicles: 3, teams: 1, shift: 90, route: 'single' };
const GOLDEN_B: SimParams = { vehicles: 2, teams: 2, shift: 90, route: 'single' };

describe('simulate · g79 城市调度', () => {
  it('与文档公式逐项对账：3/1/90、2/2/90、4/1/90、1/1/90', () => {
    const goldenA = metricsFor(GOLDEN_A);
    expect(goldenA.cost).toBe(103);
    expect(goldenA.waitA).toBe(16);
    expect(goldenA.waitB).toBe(17);
    expect(goldenA.coverageA).toBe(1);
    expect(goldenA.runs[0].demand).toBe(18);
    expect(goldenA.runs[1].demand).toBe(18);

    const goldenB = metricsFor(GOLDEN_B);
    expect(goldenB.cost).toBe(88);
    expect(goldenB.waitA).toBe(18);
    expect(goldenB.waitB).toBe(19);
    expect(goldenB.coverageA).toBe(1);

    // 4 辆车 1 队 90 分钟：成本 128，超预算 120
    expect(metricsFor({ vehicles: 4, teams: 1, shift: 90, route: 'single' }).cost).toBe(128);

    // 1 辆车 1 队 90 分钟：运力 10，两个种子日需求都是 18 → 覆盖率 10/18
    const small = metricsFor({ vehicles: 1, teams: 1, shift: 90, route: 'single' });
    expect(small.runs[0].capacity).toBe(10);
    expect(small.coverageA).toBeCloseTo(10 / 18, 12);
    expect(small.waitA).toBe(24);

    // 公式里的班次/路线增量也要对得上：60 分钟班次 +6 等待，快线 +2
    expect(metricsFor({ vehicles: 3, teams: 1, shift: 60, route: 'single' }).waitA).toBe(22);
    expect(metricsFor({ vehicles: 3, teams: 1, shift: 90, route: 'fast' }).waitA).toBe(18);
    expect(metricsFor({ vehicles: 3, teams: 1, shift: 90, route: 'fast' }).cost).toBe(103);
  });

  it('两组黄金参数都通过两个种子', () => {
    for (const solution of detail.solutions) {
      const verdict = validateArtifact(detail, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.failure).toBeUndefined();
      expect(verdict.metrics?.cost).toBeGreaterThan(0);
      expect(verdict.metrics?.coverageA).toBe(1);
      expect(verdict.metrics?.coverageB).toBe(1);
      expect(verdict.stamps).toContain('constraint');
    }
    expect(validateArtifact(detail, base, detail.solutions[0]?.artifact).metrics?.cost).toBe(103);
    expect(validateArtifact(detail, base, detail.solutions[1]?.artifact).metrics?.cost).toBe(88);
  });

  it('指标按参数重算，产物里手写的数字不作数', () => {
    const artifact = {
      params: { ...GOLDEN_A },
      runs: [
        { seed: 'A', coverage: 0.01, wait: 999, cost: 1 },
        { seed: 'B', coverage: 0.01, wait: 999, cost: 1 },
      ],
    };
    const verdict = validateArtifact(detail, base, artifact);
    expect(verdict.passed).toBe(true);
    expect(verdict.metrics?.coverageA).toBe(1);
    expect(verdict.metrics?.waitA).toBe(16);
    expect(verdict.metrics?.cost).toBe(103);
  });

  it('负例命中声明的失败类', () => {
    for (const negative of detail.negativeSamples) {
      const verdict = validateArtifact(detail, base, negative.artifact);
      expect(verdict.passed, negative.id).toBe(false);
      expect(verdict.failure?.class, negative.id).toBe(negative.expectFailure);
      expect(verdict.missingEvidence).toHaveLength(0);
    }
    const classes = new Set(detail.negativeSamples.map((negative) => negative.expectFailure));
    expect(classes.size).toBeGreaterThanOrEqual(4);
  });

  it('失败类清单与内容反馈表对齐', () => {
    const reachable = reachableFailureClasses(detail);
    expect(reachable).toEqual([
      'sim-not-run',
      'sim-budget',
      'sim-coverage',
      'sim-wait',
      'sim-overfit-seed',
    ]);
    for (const failureClass of reachable) {
      expect(detail.feedback[failureClass], failureClass).toBeTruthy();
    }
  });

  it('两个变体只换表示，不换逻辑：黄金解照样通过', () => {
    for (const patch of detail.variants) {
      const patched = applyVariant(detail, patch as SimVariant);
      expect(patched.mode).toBe('dispatch');
      const verdict = validateArtifact(patched, base, detail.solutions[0]?.artifact);
      expect(verdict.passed, patch.id + ' ' + verdict.failure?.class).toBe(true);
    }
    const swapped = applyVariant(detail, detail.variants[1] as SimVariant);
    expect(swapped.seeds[0].demand).toEqual([2, 4, 3, 2, 4, 3]);
    expect(swapped.stations.length).toBe(6);
  });

  it('无工具提交被拒，并列出三条缺失证据', async () => {
    const runtime = createSimulateRuntime(detail, options());
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.map((item) => item.checkpointId)).toEqual([
      'params',
      'run',
      'compare',
    ]);
    expect(result.snapshot.phase).toBe('failed');
  });

  it('一次运行同时产出两个种子日，指标进 probe 数据集', async () => {
    const runtime = createSimulateRuntime(detail, options());
    const unknown = await runtime.dispatch({ type: 'knob/set', payload: { key: 'vehicle', value: 4 } });
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toBe('这个旋钮不在这一关里。');

    const actions: LevelAction[] = [
      { type: 'knob/set', payload: { key: 'vehicles', value: 3 } },
      { type: 'knob/set', payload: { key: 'teams', value: 1 } },
      { type: 'knob/set', payload: { key: 'shift', value: 90 } },
      { type: 'knob/set', payload: { key: 'route', value: 0 } },
      { type: 'knob/run', payload: {} },
      { type: 'knob/commit', payload: {} },
    ];
    for (const action of actions) {
      const result = await runtime.dispatch(action);
      expect(result.ok, action.type).toBe(true);
    }
    const snapshot = runtime.snapshot();
    expect(snapshot.toolState.knob?.values).toEqual({ vehicles: 3, teams: 1, shift: 90, route: 0 });
    expect(snapshot.artifacts.map((item) => item.id)).toEqual(['params', 'runs']);
    expect(snapshot.artifacts[1]?.summary).toBe('2 个种子日');

    const dataset = snapshot.toolState.probe?.dataset;
    expect(dataset?.id).toBe('sim-runs-v1');
    expect(dataset?.n).toBe(1);
    expect(dataset?.groups?.['run-1']).toEqual([3, 1, 90, 0, 1, 16, 1, 17, 103, 1]);

    // 只看指标不算看过：compare 证据还没到手
    const first = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(first.verdict?.missingEvidence.map((item) => item.checkpointId)).toEqual(['compare']);

    const focused = await runtime.dispatch({ type: 'probe/focus', payload: { id: 'metrics-table' } });
    expect(focused.ok).toBe(true);
    expect(runtime.snapshot().toolState.probe?.focusId).toBe('metrics-table');

    const submitted = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(submitted.verdict?.passed).toBe(true);
  });

  it('改参数后旧运行失效，必须重跑', async () => {
    const runtime = createSimulateRuntime(detail, options());
    await runtime.autoplay();
    expect(runtime.snapshot().checkpoints.run).toBe(true);
    await runtime.dispatch({ type: 'knob/set', payload: { key: 'vehicles', value: 4 } });
    const snapshot = runtime.snapshot();
    expect(snapshot.checkpoints.run).toBe(false);
    expect(snapshot.checkpoints.params).toBe(false);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.map((item) => item.checkpointId)).toEqual(['params', 'run']);
  });

  it('autoplay 走公开动作路径通关', async () => {
    const runtime = createSimulateRuntime(detail, options());
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.verdict?.failure).toBeUndefined();
    expect(result.snapshot.checkpoints).toEqual({ params: true, run: true, compare: true });
    expect(result.snapshot.stamps).toContain('constraint');
    expect(result.snapshot.phase).toBe('passed');
    expect(result.snapshot.toolState.knob?.values).toEqual({ vehicles: 3, teams: 1, shift: 90, route: 0 });
  });

  it('actionsFor 只返回公开动作，且先摆参数再跑再提交', () => {
    const actions = actionsFor(detail, base, detail.solutions[0]?.artifact);
    expect(actions.map((action) => action.type)).toEqual([
      'knob/set',
      'knob/set',
      'knob/set',
      'knob/set',
      'knob/run',
      'knob/commit',
      'probe/focus',
      'submit',
    ]);
    const sets = actions.filter((action) => action.type === 'knob/set');
    expect(sets.map((action) => action.payload.value)).toEqual([3, 1, 90, 0]);
  });

  it('工具配置与关卡脚本不漂移（旋钮档位、路线名、目标、预算）', () => {
    const knob = detail.tools.find((tool) => tool.kind === 'knob');
    const probe = detail.tools.find((tool) => tool.kind === 'probe');
    expect(knob).toBeTruthy();
    expect(probe).toBeTruthy();
    if (!knob || knob.kind !== 'knob' || !probe || probe.kind !== 'probe') return;

    const extras = knob.config as unknown as {
      options?: Record<string, { value: number; label: string }[]>;
      labels?: Record<string, string>;
      budget?: number;
    };
    const keys = new Map(knob.config.keys.map((key) => [key.key, key]));
    expect([...keys.keys()]).toEqual(['vehicles', 'teams', 'shift', 'route']);
    expect(keys.get('vehicles')?.min).toBe(script.params.vehicles.min);
    expect(keys.get('vehicles')?.max).toBe(script.params.vehicles.max);
    expect(keys.get('vehicles')?.step).toBe(script.params.vehicles.step);
    expect(keys.get('teams')?.max).toBe(script.params.teams.max);

    const shiftOptions = extras.options?.shift ?? [];
    expect(shiftOptions.map((option) => option.value)).toEqual(script.params.shifts);
    expect(shiftOptions.some((option) => option.value === script.params.shiftDefault)).toBe(true);

    const routeOptions = extras.options?.route ?? [];
    expect(routeOptions.map((option) => option.value)).toEqual([0, 1, 2]);
    expect(routeOptions.map((option) => option.label)).toEqual(script.routes.map((route) => route.label));
    expect(extras.labels?.route).toBe('路线');
    expect(extras.budget).toBe(script.budget);

    const probeExtras = probe.config as unknown as {
      targets?: Record<string, { coverageMin: number; waitMax: number }>;
      budget?: number;
      routeLabels?: string[];
    };
    expect(probeExtras.targets).toEqual(script.targets);
    expect(probeExtras.budget).toBe(script.budget);
    expect(probeExtras.routeLabels).toEqual(script.routes.map((route) => route.label));

    expect(detail.requiredToolArtifacts).toEqual(['params', 'runs']);
    const produced = new Set(detail.tools.flatMap((tool) => tool.requiredArtifacts));
    for (const artifact of detail.requiredToolArtifacts) expect(produced.has(artifact)).toBe(true);
    expect(detail.evidencePlan.map((item) => item.id)).toEqual(['params', 'run', 'compare']);
  });

  it('站点数、种子数与需求长度自洽', () => {
    expect(script.stations).toHaveLength(6);
    expect(script.seeds).toHaveLength(2);
    for (const seed of script.seeds) expect(seed.demand).toHaveLength(6);
    expect(script.budget).toBe(120);
    expect(script.targets.A).toEqual({ coverageMin: 0.9, waitMax: 18 });
    expect(script.targets.B).toEqual({ coverageMin: 0.85, waitMax: 20 });
  });
});
