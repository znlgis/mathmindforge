import type {
  ArtifactSummary,
  FailureCause,
  LevelAction,
  LevelDetail,
  Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { costOf, runSimulation, targetChecks, withinBudget } from './engine';
import type { SimParams, SimSeedMetrics } from './engine';
import { simulateArtifactSchema, simulateScriptSchema } from './schema';
import type { SimulateArtifact, SimulateScript } from './schema';

export type { SimulateArtifact, SimulateScript };

/** 失败类（docs/06 §2.4）；detial.feedback 必须逐条有文案，audit 会查。 */
export const FAILURE_CLASSES = [
  'sim-not-run',
  'sim-budget',
  'sim-coverage',
  'sim-wait',
  'sim-overfit-seed',
] as const;
export type SimFailureClass = (typeof FAILURE_CLASSES)[number];

export interface SimVariant {
  id: string;
  axis: string;
  patch: Record<string, unknown>;
}

export const BASE_VARIANT: SimVariant = { id: 'base', axis: 'structure', patch: {} };

/** 校验/动作函数既接受详情也接受已解析的脚本，审计脚本与单测都能直接复用。 */
export type ScriptSource = LevelDetail | SimulateScript;

/** 旋钮中间态：路线用下标存放，运行时与 UI 之间只搬数字。 */
export interface KnobValues {
  vehicles: number;
  teams: number;
  shift: number;
  routeIndex: number;
}

const MESSAGE_KEYS = {
  notRun: 'level.g79.sim.notRun.message',
  budget: 'level.g79.sim.budget.message',
  coverage: 'level.g79.sim.coverage.message',
  wait: 'level.g79.sim.wait.message',
  overfit: 'level.g79.sim.overfit.message',
} as const;

export function parseScript(input: unknown): SimulateScript {
  const script = simulateScriptSchema.parse(input);
  checkScriptSemantics(script);
  return script;
}

/** schema 管结构，这里管「结构合法但内容自相矛盾」的脚本。 */
function checkScriptSemantics(script: SimulateScript): void {
  const seen = new Set<string>();
  for (const seed of script.seeds) {
    if (seen.has(seed.id)) throw new Error('种子日 id 重复：' + seed.id);
    seen.add(seed.id);
    if (seed.demand.length !== script.stations.length) {
      throw new Error('种子日 ' + seed.id + ' 的需求数必须等于站点数');
    }
    if (!script.targets[seed.id]) throw new Error('种子日 ' + seed.id + ' 缺少目标');
  }
  if (!script.routes.some((route) => route.id === script.params.routeDefault)) {
    throw new Error('默认路线不在路线表里：' + script.params.routeDefault);
  }
  if (!script.params.shifts.includes(script.params.shiftDefault)) {
    throw new Error('默认班次不在班次表里：' + script.params.shiftDefault);
  }
}

function isLevelDetail(input: ScriptSource): input is LevelDetail {
  return typeof input === 'object' && input !== null && 'levelScript' in input;
}

export function scriptOf(input: ScriptSource): SimulateScript {
  return isLevelDetail(input) ? parseScript(input.levelScript) : input;
}

function mergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (
      current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)
    ) {
      out[key] = mergeRecords(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function applyScriptVariant(script: SimulateScript, variant: SimVariant): SimulateScript {
  if (!variant.patch || Object.keys(variant.patch).length === 0) return script;
  return parseScript(mergeRecords(script as unknown as Record<string, unknown>, variant.patch));
}

/** verifier 入口：变体补丁作用在关卡脚本上（v-layout 换站点顺序、v-demand 换需求分布）。 */
export function applyVariant(input: ScriptSource, variant: SimVariant): SimulateScript {
  return applyScriptVariant(scriptOf(input), variant);
}

export function defaultValues(script: SimulateScript): KnobValues {
  const routeIndex = script.routes.findIndex((route) => route.id === script.params.routeDefault);
  return {
    vehicles: script.params.vehicles.default,
    teams: script.params.teams.default,
    shift: script.params.shiftDefault,
    routeIndex: routeIndex < 0 ? 0 : routeIndex,
  };
}

function snapToStep(value: number, range: { min: number; max: number; step: number }): number {
  const stepped = range.min + Math.round((value - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
}

/** 把 UI/动作里来的任意数字夹回合法档位；班次不在表里就回默认值。 */
export function normalizeValues(script: SimulateScript, values: KnobValues): KnobValues {
  const shift = script.params.shifts.includes(Math.round(values.shift))
    ? Math.round(values.shift)
    : script.params.shiftDefault;
  return {
    vehicles: snapToStep(values.vehicles, script.params.vehicles),
    teams: snapToStep(values.teams, script.params.teams),
    shift,
    routeIndex: Math.min(script.routes.length - 1, Math.max(0, Math.round(values.routeIndex))),
  };
}

export function valuesEqual(a: KnobValues, b: KnobValues): boolean {
  return a.vehicles === b.vehicles
    && a.teams === b.teams
    && a.shift === b.shift
    && a.routeIndex === b.routeIndex;
}

export function paramsOf(script: SimulateScript, values: KnobValues): SimParams {
  const route = script.routes[values.routeIndex] ?? script.routes[0];
  return {
    vehicles: values.vehicles,
    teams: values.teams,
    shift: values.shift,
    route: route ? route.id : script.params.routeDefault,
  };
}

export function routeIndexOf(script: SimulateScript, routeId: string): number {
  const index = script.routes.findIndex((route) => route.id === routeId);
  return index < 0 ? 0 : index;
}

function fitsRange(value: number, range: { min: number; max: number; step: number }): boolean {
  if (!Number.isInteger(value)) return false;
  if (value < range.min || value > range.max) return false;
  return (value - range.min) % range.step === 0;
}

/** 产物里的参数也要过一遍关卡允许范围：写死一组越界数字不能算跑过。 */
export function normalizeParams(script: SimulateScript, params: SimParams): SimParams | null {
  if (!fitsRange(params.vehicles, script.params.vehicles)) return null;
  if (!fitsRange(params.teams, script.params.teams)) return null;
  if (!Number.isInteger(params.shift) || !script.params.shifts.includes(params.shift)) return null;
  if (!script.routes.some((route) => route.id === params.route)) return null;
  return params;
}

export function makeArtifact(params: SimParams, runs: SimSeedMetrics[]): SimulateArtifact {
  return {
    params,
    runs: runs.map((run) => ({
      seed: run.seed,
      demand: run.demand,
      capacity: run.capacity,
      coverage: run.coverage,
      wait: run.wait,
      cost: run.cost,
    })),
  };
}

export function summarizeArtifact(artifact: unknown): ArtifactSummary[] {
  const parsed = simulateArtifactSchema.safeParse(artifact);
  if (!parsed.success) return [];
  const params = parsed.data.params;
  const out: ArtifactSummary[] = [
    {
      id: 'params',
      kind: 'params',
      digest: digest(params),
      summary: params.vehicles + ' 车 · ' + params.teams + ' 队 · ' + params.shift + ' 分 · ' + params.route,
    },
  ];
  if (parsed.data.runs.length > 0) {
    out.push({
      id: 'runs',
      kind: 'dataset',
      digest: digest(parsed.data.runs),
      summary: parsed.data.runs.length + ' 个种子日',
    });
  }
  return out;
}

function metricsOf(script: SimulateScript, runs: SimSeedMetrics[], cost: number): Record<string, number> {
  const metrics: Record<string, number> = { cost, budget: script.budget };
  for (const run of runs) {
    metrics['coverage' + run.seed] = run.coverage;
    metrics['wait' + run.seed] = run.wait;
    metrics['demand' + run.seed] = run.demand;
  }
  return metrics;
}

function reject(
  failureClass: string,
  causes: FailureCause[],
  artifacts: ArtifactSummary[],
  metrics: Record<string, number>,
): Verdict {
  return {
    passed: false,
    stamps: [],
    failure: { class: failureClass, causes },
    missingEvidence: [],
    metrics,
    artifacts,
  };
}

/**
 * 指标一律从 params 重算；runs 只用来证明「两个种子日都跑过」，
 * 里面的数字写成什么都不影响判定。
 */
export function validateArtifact(input: ScriptSource, variant: SimVariant, artifact: unknown): Verdict {
  const script = applyScriptVariant(scriptOf(input), variant);
  const artifacts = summarizeArtifact(artifact);

  const parsed = simulateArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    return reject(
      'sim-not-run',
      [{ kind: 'constraint', ref: 'artifact', messageKey: MESSAGE_KEYS.notRun }],
      artifacts,
      {},
    );
  }

  const params = normalizeParams(script, parsed.data.params);
  if (!params) {
    return reject(
      'sim-not-run',
      [{ kind: 'constraint', ref: 'params', messageKey: MESSAGE_KEYS.notRun }],
      artifacts,
      {},
    );
  }

  const recordedSeeds = new Set(parsed.data.runs.map((run) => run.seed));
  if (recordedSeeds.size === 0) {
    return reject(
      'sim-not-run',
      [{ kind: 'sample', ref: 'runs', messageKey: MESSAGE_KEYS.notRun }],
      artifacts,
      {},
    );
  }
  const missingSeeds = script.seeds
    .filter((seed) => !recordedSeeds.has(seed.id))
    .map((seed) => seed.id);
  if (missingSeeds.length > 0) {
    return reject(
      'sim-overfit-seed',
      [{
        kind: 'sample',
        ref: missingSeeds.join(','),
        messageKey: MESSAGE_KEYS.overfit,
        params: { seeds: missingSeeds.join(',') },
      }],
      artifacts,
      {},
    );
  }

  const runs = runSimulation(script, params);
  const cost = costOf(script, params);
  const metrics = metricsOf(script, runs, cost);

  if (!withinBudget(script, cost)) {
    return reject(
      'sim-budget',
      [{
        kind: 'constraint',
        ref: 'cost',
        messageKey: MESSAGE_KEYS.budget,
        params: { cost, budget: script.budget },
      }],
      artifacts,
      metrics,
    );
  }

  const checks = targetChecks(script, runs);
  for (const [index, check] of checks.entries()) {
    const run = runs[index];
    const seed = script.seeds[index];
    // 第一个种子日不达标 → 覆盖率/等待；后面的种子日不达标 → 过拟合一个种子。
    const overfit = index > 0;
    if (!check.coverageOk) {
      const failureClass: SimFailureClass = overfit ? 'sim-overfit-seed' : 'sim-coverage';
      return reject(
        failureClass,
        [{
          kind: 'constraint',
          ref: seed.id,
          messageKey: overfit ? MESSAGE_KEYS.overfit : MESSAGE_KEYS.coverage,
          params: { seed: seed.id, coverage: Math.round(run.coverage * 1000) / 1000, target: check.coverageMin },
        }],
        artifacts,
        metrics,
      );
    }
    if (!check.waitOk) {
      const failureClass: SimFailureClass = overfit ? 'sim-overfit-seed' : 'sim-wait';
      return reject(
        failureClass,
        [{
          kind: 'constraint',
          ref: seed.id,
          messageKey: overfit ? MESSAGE_KEYS.overfit : MESSAGE_KEYS.wait,
          params: { seed: seed.id, wait: run.wait, target: check.waitMax },
        }],
        artifacts,
        metrics,
      );
    }
  }

  return {
    passed: true,
    stamps: ['constraint'],
    missingEvidence: [],
    metrics,
    artifacts,
  };
}

/**
 * 自动演示/审计用：只用公开动作，先摆参数、再跑一次（运行即锁定，指标同卡）、提交。
 * 「锁定参数」与「查看指标」两个仪式动作已经删掉：run 就是锁定，指标跑完就同屏。
 */
export function actionsFor(input: ScriptSource, _variant: SimVariant, artifact: unknown): LevelAction[] {
  const script = scriptOf(input);
  const parsed = simulateArtifactSchema.safeParse(artifact);
  if (!parsed.success) return [];
  const params = normalizeParams(script, parsed.data.params);
  if (!params) return [];
  return [
    { type: 'knob/set', payload: { key: 'vehicles', value: params.vehicles } },
    { type: 'knob/set', payload: { key: 'teams', value: params.teams } },
    { type: 'knob/set', payload: { key: 'shift', value: params.shift } },
    { type: 'knob/set', payload: { key: 'route', value: routeIndexOf(script, params.route) } },
    { type: 'knob/run', payload: {} },
    { type: 'submit', payload: {} },
  ];
}

export function reachableFailureClasses(_input?: ScriptSource): string[] {
  return [...FAILURE_CLASSES];
}

/** 约定入口：构建期/审计只认这五个函数（docs/06 §1）。 */
export const simulateVerifier = {
  parseScript,
  validateArtifact,
  actionsFor,
  applyVariant,
  reachableFailureClasses,
};
