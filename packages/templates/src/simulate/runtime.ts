import type {
  ArtifactSummary,
  LevelAction,
  LevelDetail,
  LevelRuntime,
  RuntimeOptions,
  ToolStateMap,
  Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import type { RuntimeVariant } from '../shared/types';
import { costOf, runSimulation, targetChecks, withinBudget } from './engine';
import type { SimParams, SimSeedMetrics } from './engine';
import {
  actionsFor,
  defaultValues,
  makeArtifact,
  normalizeValues,
  paramsOf,
  parseScript,
  summarizeArtifact,
  validateArtifact,
  valuesEqual,
} from './logic';
import type { KnobValues } from './logic';
import type { SimulateArtifact, SimulateScript } from './schema';

/** probe.dataset.id：toolkit-ui/src/metricsRows.ts 据此判断这份数据能不能读。 */
export const METRICS_DATASET_ID = 'sim-runs-v1';

/**
 * probe.dataset.groups 的一行编码，顺序必须与 packages/toolkit-ui/src/metricsRows.ts
 * 的 METRICS_ROW_FIELDS 完全一致（两个包之间没有可直接共享的类型层）。
 */
export const METRICS_ROW_FIELDS = [
  'vehicles',
  'teams',
  'shift',
  'routeIndex',
  'coverageA',
  'waitA',
  'coverageB',
  'waitB',
  'cost',
  'passed',
] as const;

interface SimRunRecord {
  id: string;
  at: number;
  values: KnobValues;
  params: SimParams;
  seeds: SimSeedMetrics[];
  cost: number;
  passed: boolean;
}

interface SimState {
  values: KnobValues;
  /** 锁定过的一组参数；只有它和当前值、上次运行一致时才允许提交。 */
  committed: KnobValues | null;
  /** 最近 10 次运行，给 MetricsTool 的表格用。 */
  history: SimRunRecord[];
  lastRun: SimRunRecord | null;
  focusId: string;
  /** 看过指标（probe/focus 或 knob/compare）——compare 证据位。 */
  compared: boolean;
  /** 运行序号：history 会截断，id 不能靠长度推。 */
  seq: number;
}

function rowOf(record: SimRunRecord): number[] {
  const [first, second] = record.seeds;
  return [
    record.values.vehicles,
    record.values.teams,
    record.values.shift,
    record.values.routeIndex,
    first ? first.coverage : 0,
    first ? first.wait : 0,
    second ? second.coverage : 0,
    second ? second.wait : 0,
    record.cost,
    record.passed ? 1 : 0,
  ];
}

function runMetrics(seeds: SimSeedMetrics[], cost: number): Record<string, number> {
  const metrics: Record<string, number> = { cost };
  for (const seed of seeds) {
    metrics['coverage' + seed.seed] = seed.coverage;
    metrics['wait' + seed.seed] = seed.wait;
  }
  return metrics;
}

export function createSimulateRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script: SimulateScript = parseScript(detail.levelScript);
  const now = (): number => opts.now();

  function initialState(): SimState {
    return {
      values: defaultValues(script),
      committed: null,
      history: [],
      lastRun: null,
      focusId: '',
      compared: false,
      seq: 0,
    };
  }

  function artifactOf(state: SimState): SimulateArtifact | null {
    if (!state.committed || !state.lastRun) return null;
    if (!valuesEqual(state.committed, state.values)) return null;
    if (!valuesEqual(state.committed, state.lastRun.values)) return null;
    return makeArtifact(paramsOf(script, state.committed), state.lastRun.seeds);
  }

  function checkpointsOf(state: SimState): Record<string, boolean> {
    return {
      params: state.committed !== null && valuesEqual(state.committed, state.values),
      run: state.lastRun !== null,
      compare: state.compared,
    };
  }

  function datasetOf(state: SimState): ToolStateMap['probe']['dataset'] | undefined {
    if (state.history.length === 0) return undefined;
    const groups: Record<string, number[]> = {};
    for (const record of state.history) groups[record.id] = rowOf(record);
    const rows = state.history.map(rowOf);
    return {
      id: METRICS_DATASET_ID,
      n: state.history.length,
      values: rows.flat(),
      groups,
      counts: {
        runs: state.history.length,
        passed: state.history.filter((record) => record.passed).length,
        failed: state.history.filter((record) => !record.passed).length,
      },
      digest: digest(rows),
    };
  }

  function toolStateOf(state: SimState): Partial<ToolStateMap> {
    return {
      knob: {
        values: {
          vehicles: state.values.vehicles,
          teams: state.values.teams,
          shift: state.values.shift,
          route: state.values.routeIndex,
        },
        lastRunId: state.lastRun ? state.lastRun.id : undefined,
      },
      probe: {
        dataset: datasetOf(state),
        focusId: state.focusId === '' ? undefined : state.focusId,
      },
    };
  }

  function apply(state: SimState, action: LevelAction): AdapterResult<SimState> {
    switch (action.type) {
      case 'knob/set': {
        const key = action.payload.key;
        if (key !== 'vehicles' && key !== 'teams' && key !== 'shift' && key !== 'route') {
          return { state, error: '这个旋钮不在这一关里。' };
        }
        const draft: KnobValues = { ...state.values };
        if (key === 'vehicles') draft.vehicles = action.payload.value;
        else if (key === 'teams') draft.teams = action.payload.value;
        else if (key === 'shift') draft.shift = action.payload.value;
        else draft.routeIndex = action.payload.value;
        const values = normalizeValues(script, draft);
        const changed = !valuesEqual(values, state.values);
        return {
          state: {
            ...state,
            values,
            // 参数一动，上一次运行就不再代表这组参数：必须重跑。
            lastRun: changed ? null : state.lastRun,
          },
          evidence: {
            phase: 'hypothesize',
            tool: 'knob',
            action: action.type,
            metrics: {
              vehicles: values.vehicles,
              teams: values.teams,
              shift: values.shift,
              route: values.routeIndex,
            },
          },
        };
      }
      case 'knob/run': {
        const params = paramsOf(script, state.values);
        const seeds = runSimulation(script, params);
        const cost = costOf(script, params);
        const passed = withinBudget(script, cost)
          && targetChecks(script, seeds).every((check) => check.coverageOk && check.waitOk);
        const seq = state.seq + 1;
        const record: SimRunRecord = {
          id: 'run-' + seq,
          at: now(),
          values: { ...state.values },
          params,
          seeds,
          cost,
          passed,
        };
        return {
          state: {
            ...state,
            history: [...state.history, record].slice(-10),
            lastRun: record,
            seq,
          },
          evidence: {
            phase: 'run',
            tool: 'knob',
            action: action.type,
            outcome: passed ? 'pass' : 'fail',
            metrics: runMetrics(seeds, cost),
          },
        };
      }
      case 'knob/commit': {
        const params = paramsOf(script, state.values);
        const summary = summarizeArtifact(makeArtifact(params, []));
        return {
          state: { ...state, committed: { ...state.values } },
          evidence: {
            phase: 'construct',
            tool: 'knob',
            action: action.type,
            artifact: summary[0],
          },
        };
      }
      case 'knob/reset': {
        return {
          state: {
            ...state,
            values: defaultValues(script),
            committed: null,
            lastRun: null,
            compared: false,
          },
          evidence: { phase: 'revise', tool: 'knob', action: action.type },
        };
      }
      case 'knob/compare': {
        const runId = action.payload.runId;
        if (!runId) return { state, error: '先选一条运行记录。' };
        return {
          state: { ...state, focusId: runId, compared: true },
          evidence: { phase: 'result', tool: 'knob', action: action.type },
        };
      }
      case 'probe/focus': {
        const focusId = action.payload.id;
        if (!focusId) return { state, error: '先选一个要看的东西。' };
        return {
          state: { ...state, focusId, compared: true },
          evidence: { phase: 'result', tool: 'probe', action: action.type },
        };
      }
      default:
        return { state, error: '这个动作还没有接上。' };
    }
  }

  const adapter: RuntimeAdapter<SimState> = {
    initialState: () => initialState(),
    apply,
    artifact: (state) => artifactOf(state),
    artifactSummaries: (state): ArtifactSummary[] => {
      const artifact = artifactOf(state);
      return artifact ? summarizeArtifact(artifact) : [];
    },
    checkpoints: (state) => checkpointsOf(state),
    toolState: toolStateOf,
    validate: (levelDetail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict => (
      validateArtifact(levelDetail, variant, artifact)
    ),
    actionsFor: (levelDetail: LevelDetail, variant: RuntimeVariant, artifact: unknown) => (
      actionsFor(levelDetail, variant, artifact)
    ),
    // 模拟关不做 transfer 门：换站点顺序/需求分布只要逻辑不变，同一组参数照样成立。
    transferVariants: () => [],
  };

  return createRuntimeWithAdapter(detail, opts, adapter);
}
