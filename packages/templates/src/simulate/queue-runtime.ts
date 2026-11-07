import type {
  ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import type { RuntimeVariant } from '../shared/types';
import { queueArtifact, queueScriptSchema, runQueue, validateQueueArtifact } from './queue';
import type { QueueParams, QueueScript } from './queue';

export const QUEUE_DATASET_ID = 'queue-runs-v1';

interface QueueRunRecord {
  id: string;
  params: QueueParams;
  run: ReturnType<typeof runQueue>;
  passed: boolean;
}

interface QueueState {
  params: QueueParams;
  lastRun: QueueRunRecord | null;
  history: QueueRunRecord[];
  compared: boolean;
  seq: number;
}

function same(a: QueueParams, b: QueueParams): boolean {
  return a.servers === b.servers && a.serviceTime === b.serviceTime && a.openMinutes === b.openMinutes;
}

function defaults(script: QueueScript): QueueParams {
  return {
    servers: script.servers.default,
    serviceTime: script.serviceTime.default,
    openMinutes: script.openMinutes.default,
  };
}

function createQueueAdapter(script: QueueScript): RuntimeAdapter<QueueState> {
  /**
   * 「运行即锁定」：一次运行就是这组参数的结论。
   * 编辑即运行之后，knob/set 会直接用新参数跑一次，产物照旧只认「最近一次运行 + 参数没变」。
   */

  /**
   * 用一组参数跑一次，产出运行记录（knob/run 与 knob/set 共用）。
   * 编辑即运行：改一个旋钮就等价于「设参数 + 跑一次」，指标当场就绪。
   */
  function computeRecord(state: QueueState, params: QueueParams): QueueRunRecord {
    const run = runQueue(script, params);
    return {
      id: 'run-' + (state.seq + 1),
      params: { ...params },
      run,
      passed: run.passed,
    };
  }

  function withRun(state: QueueState, record: QueueRunRecord): QueueState {
    return {
      ...state,
      seq: state.seq + 1,
      lastRun: record,
      history: [...state.history, record].slice(-10),
      compared: false,
    };
  }

  function runEvidence(action: string, record: QueueRunRecord) {
    return {
      phase: 'run' as const,
      tool: 'knob' as const,
      action,
      metrics: { avgWait: record.run.avgWait, overtime: record.run.overtime, cost: record.run.cost },
      outcome: record.passed ? 'pass' as const : 'fail' as const,
    };
  }

  function artifactOf(state: QueueState): unknown | null {
    if (!state.lastRun) return null;
    if (!same(state.lastRun.params, state.params)) return null;
    return queueArtifact(script, state.lastRun.params);
  }

  function datasetOf(state: QueueState): ToolStateMap['probe']['dataset'] | undefined {
    if (state.history.length === 0) return undefined;
    const rows = state.history.map((record) => [
      record.params.servers,
      record.params.serviceTime,
      record.params.openMinutes,
      record.run.avgWait,
      record.run.maxQueue,
      record.run.overtime,
      record.run.cost,
      record.passed ? 1 : 0,
    ]);
    return {
      id: QUEUE_DATASET_ID,
      n: rows.length,
      values: rows.flat(),
      groups: Object.fromEntries(state.history.map((record, index) => [record.id, rows[index] ?? []])),
      counts: {
        runs: state.history.length,
        passed: state.history.filter((record) => record.passed).length,
        failed: state.history.filter((record) => !record.passed).length,
      },
      digest: digest(rows),
    };
  }

  return {
    initialState(): QueueState {
      return {
        params: defaults(script),
        lastRun: null,
        history: [],
        compared: false,
        seq: 0,
      };
    },
    apply(state, action: LevelAction): AdapterResult<QueueState> {
      switch (action.type) {
        case 'knob/set': {
          const key = action.payload.key;
          if (key !== 'servers' && key !== 'serviceTime' && key !== 'openMinutes') {
            return { state, error: '这个旋钮不属于排队关。' };
          }
          const range = key === 'servers' ? script.servers : key === 'serviceTime' ? script.serviceTime : script.openMinutes;
          const clamped = Math.max(range.min, Math.min(range.max, Math.trunc(action.payload.value)));
          const value = range.min + Math.round((clamped - range.min) / range.step) * range.step;
          const params: QueueParams = { ...state.params, [key]: value };
          const changed = !same(params, state.params);
          // 编辑即运行：参数一动就立刻用新参数跑一次，指标与产物当场就绪，
          // 玩家不需要再点「运行」。值没变（点回同一档）则不重复记一条运行。
          const record = changed ? computeRecord(state, params) : null;
          const next = record ? withRun({ ...state, params }, record) : { ...state, params };
          return {
            state: next,
            evidence: record
              ? runEvidence(action.type, record)
              : { phase: 'construct', tool: 'knob', action: action.type, metrics: { [key]: value } },
          };
        }
        case 'knob/run': {
          // 动作保留给 autoplay 与旧单测：界面已经不再渲染「运行」按钮（编辑即运行）。
          const record = computeRecord(state, state.params);
          return {
            state: withRun(state, record),
            evidence: runEvidence(action.type, record),
          };
        }
        case 'knob/commit': {
          // 旧动作保留为幂等空操作：产物已改成「运行即锁定」，界面不再渲染这个按钮。
          return {
            state,
            evidence: { phase: 'construct', tool: 'knob', action: action.type },
          };
        }
        case 'knob/reset': {
          return {
            state: { ...state, params: defaults(script), lastRun: null, compared: false },
            evidence: { phase: 'construct', tool: 'knob', action: action.type },
          };
        }
        case 'probe/focus': {
          return {
            state: { ...state, compared: true },
            evidence: { phase: 'result', tool: 'probe', action: action.type },
          };
        }
        default:
          return { state, error: '这个动作不属于排队关。' };
      }
    },
    artifact: artifactOf,
    // 自动判题口径：最近一次运行存在且参数没变（= 有产物）就说明答案填完了，对错交给 validate。
    answerComplete: (state) => artifactOf(state) !== null,
    artifactSummaries(state): ArtifactSummary[] {
      if (!state.lastRun) return [];
      const run = state.lastRun.run;
      return [{
        id: 'queue-run',
        kind: 'dataset',
        digest: digest(run),
        summary: '平均等待 ' + run.avgWait + ' 分 · 加班 ' + run.overtime + ' 分 · 成本 ' + run.cost,
      }];
    },
    checkpoints(state) {
      return {
        params: state.lastRun !== null && same(state.lastRun.params, state.params),
        run: state.lastRun !== null,
        // 运行之后指标就在同一张卡上：对照是事实，不需要再点一次「查看排队指标」。
        // 编辑即运行保证 lastRun 总对应最新参数，对照不再会因为「改过参数」而作废。
        compare: state.lastRun !== null,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      const run = state.lastRun;
      return {
        knob: {
          values: { servers: state.params.servers, serviceTime: state.params.serviceTime, openMinutes: state.params.openMinutes },
          lastRunId: run ? run.id : undefined,
        },
        probe: { dataset: datasetOf(state), focusId: state.compared ? 'queue-metrics' : undefined },
      };
    },
    validate(_detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
      const applied = applyQueueVariant(script, variant);
      const result = validateQueueArtifact(applied, artifact);
      if (!result.passed) {
        return {
          passed: false,
          stamps: [],
          failure: {
            class: result.failures[0] ?? 'queue-not-run',
            variantId: variant.id,
            causes: [{ kind: 'constraint', ref: 'queue', messageKey: '排队指标还没有全部达标。' }],
          },
          missingEvidence: [],
          artifacts: [],
        };
      }
      return { passed: true, stamps: variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer'], missingEvidence: [], artifacts: [] };
    },
    actionsFor(_detail, _variant, artifact) {
      const raw = artifact as { params?: Partial<QueueParams> } | null;
      const params = {
        servers: raw?.params?.servers ?? script.servers.default,
        serviceTime: raw?.params?.serviceTime ?? script.serviceTime.default,
        openMinutes: raw?.params?.openMinutes ?? script.openMinutes.default,
      };
      const actions: LevelAction[] = [
        { type: 'knob/set', payload: { key: 'servers', value: params.servers } },
        { type: 'knob/set', payload: { key: 'serviceTime', value: params.serviceTime } },
        { type: 'knob/set', payload: { key: 'openMinutes', value: params.openMinutes } },
        { type: 'knob/run', payload: {} },
        { type: 'knob/commit', payload: {} },
        { type: 'probe/focus', payload: { id: 'queue-metrics' } },
        { type: 'submit', payload: {} },
      ];
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function applyQueueVariant(script: QueueScript, variant: RuntimeVariant): QueueScript {
  if (!variant.patch || Object.keys(variant.patch).length === 0) return script;
  return queueScriptSchema.parse({ ...script, ...variant.patch });
}

export function createQueueRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = queueScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createQueueAdapter(script));
}