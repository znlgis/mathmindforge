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
      history: [],
      lastRun: null,
      focusId: '',
      compared: false,
      seq: 0,
    };
  }

  /**
   * 「运行即锁定」：一次运行同时锁定参数并产出两个种子日的指标。
   * 编辑即运行之后，knob/set 会直接用新参数跑一次，所以这里正常情况取「最近一次运行」；
   * 但仍要校验「参数没变」，防止状态被旧动作或直接构造破坏。产物只认这一组事实。
   */
  function artifactOf(state: SimState): SimulateArtifact | null {
    if (!state.lastRun) return null;
    if (!valuesEqual(state.lastRun.values, state.values)) return null;
    return makeArtifact(paramsOf(script, state.lastRun.values), state.lastRun.seeds);
  }

  /**
   * 用当前参数跑一次，产出运行记录（knob/run 与 knob/set 共用）。
   * 编辑即运行：改一个旋钮就等价于「设参数 + 跑一次」，不再需要「运行」按钮。
   */
  function computeRecord(state: SimState, values: KnobValues): SimRunRecord {
    const params = paramsOf(script, values);
    const seeds = runSimulation(script, params);
    const cost = costOf(script, params);
    const passed = withinBudget(script, cost)
      && targetChecks(script, seeds).every((check) => check.coverageOk && check.waitOk);
    const seq = state.seq + 1;
    return {
      id: 'run-' + seq,
      at: now(),
      values: { ...values },
      params,
      seeds,
      cost,
      passed,
    };
  }

  function withRun(state: SimState, record: SimRunRecord): SimState {
    return {
      ...state,
      history: [...state.history, record].slice(-10),
      lastRun: record,
      seq: state.seq + 1,
    };
  }

  function checkpointsOf(state: SimState): Record<string, boolean> {
    return {
      params: state.lastRun !== null && valuesEqual(state.lastRun.values, state.values),
      run: state.lastRun !== null,
      // 跑完指标就在同一张卡上：对照是事实，删掉「查看指标」死按钮（docs/12 T0-4）。
      // 编辑即运行保证 lastRun 永远对应最新参数，所以对照不再会因为「改过参数」而作废。
      compare: state.lastRun !== null,
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
        // 编辑即运行：参数一动就立刻用新参数跑一次，指标与产物当场就绪，
        // 玩家不需要再点「运行」。值没变（点回同一档）则不重复记一条运行。
        const record = changed ? computeRecord(state, values) : null;
        return {
          state: record
            ? withRun({ ...state, values }, record)
            : { ...state, values },
          evidence: {
            phase: changed ? 'run' : 'hypothesize',
            tool: 'knob',
            action: action.type,
            outcome: record ? (record.passed ? 'pass' : 'fail') : undefined,
            metrics: record
              ? runMetrics(record.seeds, record.cost)
              : {
                vehicles: values.vehicles,
                teams: values.teams,
                shift: values.shift,
                route: values.routeIndex,
              },
          },
        };
      }
      case 'knob/run': {
        // 动作保留给 autoplay 与旧单测：界面已经不再渲染「运行」按钮（编辑即运行）。
        const record = computeRecord(state, state.values);
        return {
          state: withRun(state, record),
          evidence: {
            phase: 'run',
            tool: 'knob',
            action: action.type,
            outcome: record.passed ? 'pass' : 'fail',
            metrics: runMetrics(record.seeds, record.cost),
          },
        };
      }
      case 'knob/commit': {
        // 旧动作保留为幂等空操作：autoplay/旧内容里的 knob/commit 不再决定产物，
        // 但也不该把玩家的正当动作打成错误（界面已不再渲染这个按钮）。
        const params = paramsOf(script, state.values);
        const summary = summarizeArtifact(makeArtifact(params, []));
        return {
          state,
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
    // 自动判题口径：只要「最近一次运行 + 参数没变」就有产物，说明答案填完了（对错交给 validate）。
    // 注意不能写成 state.lastRun !== null：改参数但还没重跑的中间态必须算未完成。
    answerComplete: (state) => artifactOf(state) !== null,
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