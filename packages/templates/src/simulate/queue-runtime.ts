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
  committed: QueueParams | null;
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
  function artifactOf(state: QueueState): unknown | null {
    if (!state.committed || !state.lastRun) return null;
    if (!same(state.committed, state.params) || !same(state.committed, state.lastRun.params)) return null;
    return queueArtifact(script, state.committed);
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
        committed: null,
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
          const value = Math.max(range.min, Math.min(range.max, Math.trunc(action.payload.value)));
          return {
            state: { ...state, params: { ...state.params, [key]: value } },
            evidence: { phase: 'construct', tool: 'knob', action: action.type, metrics: { [key]: value } },
          };
        }
        case 'knob/run': {
          const run = runQueue(script, state.params);
          const record: QueueRunRecord = {
            id: 'run-' + (state.seq + 1),
            params: { ...state.params },
            run,
            passed: run.passed,
          };
          return {
            state: {
              ...state,
              seq: state.seq + 1,
              lastRun: record,
              history: [...state.history, record].slice(-10),
              compared: false,
            },
            evidence: {
              phase: 'run',
              tool: 'knob',
              action: action.type,
              metrics: { avgWait: run.avgWait, overtime: run.overtime, cost: run.cost },
              outcome: run.passed ? 'pass' : 'fail',
            },
          };
        }
        case 'knob/commit': {
          return {
            state: { ...state, committed: { ...state.params } },
            evidence: { phase: 'construct', tool: 'knob', action: action.type },
          };
        }
        case 'knob/reset': {
          return {
            state: { ...state, params: defaults(script), committed: null },
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
        params: state.committed !== null && same(state.committed, state.params),
        run: state.lastRun !== null,
        // 运行之后指标表就在同一块面板上：对照是事实，不需要再点一次「查看排队指标」。
        compare: state.compared || state.lastRun !== null,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      return {
        knob: { values: { servers: state.params.servers, serviceTime: state.params.serviceTime, openMinutes: state.params.openMinutes } },
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