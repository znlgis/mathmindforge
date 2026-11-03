import type {
  ArtifactSummary, ClaimInput, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap,
} from '@mmf/game-kit';
import { digest, wilsonInterval } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { drawSample, samplingScriptSchema, validateSamplingArtifact } from './sampling';
import { wilsonInterval as intervalOf } from '@mmf/toolkit/shared';
import type { SamplingScript } from './sampling';

interface SamplingState {
  red: number;
  total: number;
  batches: number;
  /** 每批的原始结果：两批的比例波动才是这一关要看的东西，不能只留累计值。 */
  records: { n: number; red: number }[];
  claim: ClaimInput | null;
  focusId?: string;
}

function summarize(state: SamplingState): ArtifactSummary[] {
  if (state.total === 0) return [];
  const interval = wilsonInterval(state.red, state.total);
  return [{
    id: 'sample',
    kind: 'dataset',
    digest: digest({ red: state.red, total: state.total }),
    summary: state.red + '/' + state.total + ' · 区间 ' + (interval.low * 100).toFixed(1) + '–' + (interval.high * 100).toFixed(1) + '%',
  }];
}

function createSamplingAdapter(script: SamplingScript): RuntimeAdapter<SamplingState> {
  function artifactOf(state: SamplingState): unknown | null {
    if (state.total === 0 || !state.claim) return null;
    const interval = wilsonInterval(state.red, state.total);
    return {
      sample: {
        n: state.total,
        red: state.red,
        proportion: state.red / state.total,
        ci: [interval.low, interval.high],
        seed: 101,
      },
      claim: state.claim,
      batches: state.batches,
    };
  }

  return {
    initialState(): SamplingState {
      return { red: 0, total: 0, batches: 0, records: [], claim: null };
    },
    apply(state, action: LevelAction): AdapterResult<SamplingState> {
      switch (action.type) {
        case 'probe/sample': {
          const requested = action.payload.n;
          const size = typeof requested === 'number' && Number.isFinite(requested)
            ? Math.max(1, Math.floor(requested))
            : script.batchSizes[0] ?? 20;
          const draw = drawSample(script, size, 101 + state.batches);
          return {
            state: {
              ...state,
              red: state.red + draw.red,
              total: state.total + draw.n,
              batches: state.batches + 1,
              records: [...state.records, { n: draw.n, red: draw.red }],
              claim: null,
            },
            evidence: {
              phase: 'observe',
              tool: 'probe',
              action: action.type,
              metrics: { n: draw.n, red: draw.red, batches: state.batches + 1 },
            },
          };
        }
        case 'probe/clear': {
          return {
            state: { red: 0, total: 0, batches: 0, records: [], claim: null },
            evidence: { phase: 'revise', tool: 'probe', action: action.type },
          };
        }
        case 'probe/claim': {
          const claim = action.payload.claim;
          if (!claim || claim.kind !== 'stat') {
            return { state, error: '这一关要用样本比例与区间下结论。' };
          }
          return {
            state: { ...state, claim },
            evidence: { phase: 'result', tool: 'probe', action: action.type, metrics: { n: claim.n ?? 0 } },
          };
        }
        case 'probe/focus': {
          return {
            state: { ...state, focusId: action.payload.id },
            evidence: { phase: 'observe', tool: 'probe', action: action.type },
          };
        }
        default:
          return { state, error: '这个动作不属于抽样关。' };
      }
    },
    artifact: artifactOf,
    artifactSummaries: (state) => summarize(state),
    checkpoints(state) {
      return {
        sample: state.total >= script.minSample,
        batches: state.batches >= script.minBatches,
        claim: state.claim !== null,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      return {
        probe: {
          dataset: state.total > 0
            ? {
                id: 'sampling-v1',
                n: state.total,
                values: [state.red, state.total - state.red],
                counts: { red: state.red, total: state.total, batches: state.batches },
                // 每批存成 [n, red]：面板据此逐批显示比例（第二批与第一批差多少）。
                groups: Object.fromEntries(
                  state.records.map((record, index) => ['batch-' + (index + 1), [record.n, record.red]]),
                ),
                digest: digest({ red: state.red, total: state.total, records: state.records }),
              }
            : undefined,
          focusId: state.focusId,
          claim: state.claim ?? undefined,
        },
      };
    },
    validate(_detail, variant, artifact) {
      const result = validateSamplingArtifact(script, artifact);
      if (result.passed) {
        return {
          passed: true,
          stamps: variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer'],
          missingEvidence: [],
          artifacts: [],
          metrics: result.metrics,
        };
      }
      return {
        passed: false,
        stamps: [],
        failure: {
          class: result.failures[0] ?? 'sampling-no-sample',
          variantId: variant.id,
          causes: [{ kind: 'constraint', ref: 'sample', messageKey: '抽样证据还没有全部达标。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    },
    actionsFor(_detail, _variant, _artifact) {
      const actions: LevelAction[] = [];
      let red = 0;
      let total = 0;
      for (let i = 0; i < script.minBatches; i += 1) {
        const draw = drawSample(script, script.batchSizes[0] ?? 20, 101 + i);
        red += draw.red;
        total += draw.n;
        actions.push({ type: 'probe/sample', payload: { n: script.batchSizes[0] ?? 20 } });
      }
      const interval = intervalOf(red, total);
      const value = Math.round((red / total) * 10000) / 10000;
      actions.push({
        type: 'probe/claim',
        payload: { claim: { kind: 'stat', statistic: 'proportion', value, n: total, ci: [Math.round(interval.low * 10000) / 10000, Math.round(interval.high * 10000) / 10000] } },
      });
      actions.push({ type: 'submit', payload: {} });
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function createSamplingRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = samplingScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createSamplingAdapter(script));
}
