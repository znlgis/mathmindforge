import type {
  ArtifactSummary, ClaimInput, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { inferenceScriptSchema, inferenceStats, validateInferenceArtifact } from './inference';
import type { InferenceScript } from './inference';

interface InferenceState {
  claim: ClaimInput | null;
  focused: boolean;
}

function statsArtifact(script: InferenceScript) {
  const stats = inferenceStats(script);
  return {
    a: {
      n: stats.a.n,
      successes: stats.a.successes,
      proportion: stats.a.proportion,
      ci: stats.a.ci,
    },
    b: {
      n: stats.b.n,
      successes: stats.b.successes,
      proportion: stats.b.proportion,
      ci: stats.b.ci,
    },
  };
}

function createInferenceAdapter(script: InferenceScript): RuntimeAdapter<InferenceState> {
  function artifactOf(state: InferenceState): unknown | null {
    if (!state.claim) return null;
    return {
      stats: statsArtifact(script),
      claim: state.claim,
    };
  }

  return {
    initialState(): InferenceState {
      return { claim: null, focused: false };
    },
    apply(state, action: LevelAction): AdapterResult<InferenceState> {
      switch (action.type) {
        case 'probe/claim': {
          const claim = action.payload.claim;
          if (!claim || claim.kind !== 'difference') {
            return { state, error: '这一关要写“哪一组更高 / 看不出差异”的差值结论。' };
          }
          return {
            state: { ...state, claim },
            evidence: { phase: 'result', tool: 'probe', action: action.type },
          };
        }
        case 'probe/focus': {
          return {
            state: { ...state, focused: true },
            evidence: { phase: 'observe', tool: 'probe', action: action.type },
          };
        }
        default:
          return { state, error: '这个动作不属于推断关。' };
      }
    },
    artifact: artifactOf,
    artifactSummaries(state): ArtifactSummary[] {
      if (!state.claim) return [];
      const stats = inferenceStats(script);
      return [{
        id: 'inference',
        kind: 'dataset',
        digest: digest(statsArtifact(script)),
        summary: stats.a.proportion.toFixed(2) + ' vs ' + stats.b.proportion.toFixed(2),
      }];
    },
    checkpoints(state) {
      return {
        compare: state.focused,
        claim: state.claim !== null,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      const stats = inferenceStats(script);
      return {
        probe: {
          dataset: {
            id: 'inference-v1',
            n: stats.a.n + stats.b.n,
            values: [stats.a.proportion, stats.b.proportion],
            counts: {
              aN: stats.a.n,
              bN: stats.b.n,
              aSuccess: stats.a.successes,
              bSuccess: stats.b.successes,
              aLow: stats.a.ci[0] * 10000,
              aHigh: stats.a.ci[1] * 10000,
              bLow: stats.b.ci[0] * 10000,
              bHigh: stats.b.ci[1] * 10000,
              overlap: stats.a.overlaps ? 1 : 0,
            },
            digest: digest(statsArtifact(script)),
          },
          focusId: state.focused ? 'inference-table' : undefined,
          claim: state.claim ?? undefined,
        },
      };
    },
    validate(_detail, variant, artifact) {
      const result = validateInferenceArtifact(script, artifact);
      if (result.passed) {
        return {
          passed: true,
          stamps: variant.id === 'base' ? ['argument'] : ['argument', 'transfer'],
          missingEvidence: [],
          artifacts: [],
          metrics: result.metrics,
        };
      }
      return {
        passed: false,
        stamps: [],
        failure: {
          class: result.failures[0] ?? 'inference-no-sample',
          variantId: variant.id,
          causes: [{ kind: 'claim', ref: 'inference', messageKey: '两组比较的结论还没有被区间支持。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    },
    actionsFor(_detail, _variant, _artifact) {
      const stats = inferenceStats(script);
      const delta = Math.round((stats.a.proportion - stats.b.proportion) * 10000) / 10000;
      const low = Math.round((stats.a.ci[0] - stats.b.ci[1]) * 10000) / 10000;
      const high = Math.round((stats.a.ci[1] - stats.b.ci[0]) * 10000) / 10000;
      const actions: LevelAction[] = [
        { type: 'probe/focus', payload: { id: 'inference-table' } },
        { type: 'probe/claim', payload: { claim: { kind: 'difference', delta, ci: [low, high], n: stats.a.n + stats.b.n } } },
        { type: 'submit', payload: {} },
      ];
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function createInferenceRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = inferenceScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createInferenceAdapter(script));
}
