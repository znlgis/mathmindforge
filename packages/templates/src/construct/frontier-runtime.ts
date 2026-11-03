import type {
  ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { evaluateFrontier, frontierScriptSchema, validateFrontierArtifact } from './frontier';
import type { FrontierScript } from './frontier';

interface FrontierState {
  costs: Record<string, number>;
}

function createFrontierAdapter(script: FrontierScript): RuntimeAdapter<FrontierState> {
  function artifactOf(state: FrontierState): unknown | null {
    if (Object.keys(state.costs).length === 0) return null;
    return { costs: { ...state.costs } };
  }

  return {
    initialState(): FrontierState {
      return {
        costs: Object.fromEntries(script.edges.map((edge) => [edge.id, edge.default])),
      };
    },
    apply(state, action: LevelAction): AdapterResult<FrontierState> {
      if (action.type === 'construct/place') {
        const edgeId = action.payload.piece.shape;
        const edge = script.edges.find((item) => item.id === edgeId);
        if (!edge) return { state, error: '这条边不存在。' };
        const cost = Math.max(edge.min, Math.min(edge.max, Math.trunc(action.payload.piece.y)));
        return {
          state: { costs: { ...state.costs, [edgeId]: cost } },
          evidence: {
            phase: 'construct',
            tool: 'construct',
            action: action.type,
            metrics: { cost },
          },
        };
      }
      if (action.type === 'construct/remove') {
        const edgeId = action.payload.pieceId;
        const edge = script.edges.find((item) => item.id === edgeId);
        if (!edge) return { state, error: '这条边不存在。' };
        return {
          state: { costs: { ...state.costs, [edgeId]: edge.default } },
          evidence: { phase: 'revise', tool: 'construct', action: action.type },
        };
      }
      return { state, error: '这个动作不属于算法边界关。' };
    },
    artifact: artifactOf,
    artifactSummaries(state): ArtifactSummary[] {
      const result = evaluateFrontier(script, state.costs);
      if (!result.greedy.reached) return [];
      return [{
        id: 'frontier',
        kind: 'counterexample',
        digest: digest(state.costs),
        summary: '贪心 ' + result.greedy.cost + ' / 最优 ' + result.optimal.cost,
      }];
    },
    checkpoints(state) {
      const result = evaluateFrontier(script, state.costs);
      return {
        set: Object.keys(state.costs).length === script.edges.length,
        run: result.greedy.reached,
        counter: result.counterexample,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      return {
        construct: {
          pieces: script.edges.map((edge, index) => ({
            id: edge.id,
            shape: edge.id,
            x: index,
            y: state.costs[edge.id] ?? edge.default,
          })),
        },
      };
    },
    validate(_detail, variant, artifact) {
      const result = validateFrontierArtifact(script, artifact);
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
          class: result.failures[0] ?? 'frontier-empty',
          variantId: variant.id,
          causes: [{ kind: 'claim', ref: 'frontier', messageKey: '这组边权还不能让贪心走弯路。' }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    },
    actionsFor(_detail, _variant, artifact) {
      const raw = artifact as { costs?: Record<string, number> } | null;
      const actions: LevelAction[] = [];
      for (const edge of script.edges) {
        const cost = raw?.costs?.[edge.id] ?? edge.default;
        actions.push({
          type: 'construct/place',
          payload: { piece: { id: edge.id, shape: edge.id, x: 0, y: cost } },
        });
      }
      actions.push({ type: 'submit', payload: {} });
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function createFrontierRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = frontierScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createFrontierAdapter(script));
}
