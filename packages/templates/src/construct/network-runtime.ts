import type {
  ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import {
  connectedComponents, edgeById, networkScriptSchema, selectedEdges, validateNetworkArtifact,
} from './network';
import type { NetworkScript } from './network';

/**
 * 失败类 → 玩家可读的原因。这里用内容层已有的中文句子（英文兜底在
 * packages/i18n/src/zh-source.ts），宿主会优先显示关卡 feedback 里的同款文案。
 */
const FAILURE_MESSAGES: Record<string, string> = {
  'network-empty': '一条路都没选。',
  'network-too-many': '选的道路太多，超过上限。',
  'network-disconnected': '还有站点没有连进路网。',
  'network-budget': '路网成本超过预算。',
  'network-key': '关键站点接入的道路还不够。',
};

interface NetworkState {
  edges: string[];
}

function createNetworkAdapter(script: NetworkScript): RuntimeAdapter<NetworkState> {
  function summary(state: NetworkState): ArtifactSummary[] {
    if (state.edges.length === 0) return [];
    const { cost } = selectedEdges(script, { edges: state.edges });
    const components = connectedComponents(script, state.edges).length;
    return [{
      id: 'network',
      kind: 'placement-set',
      digest: digest([...state.edges].sort()),
      summary: state.edges.length + ' 条边 · 成本 ' + cost + ' · ' + components + ' 个连通块',
    }];
  }

  return {
    initialState(): NetworkState {
      return { edges: [] };
    },
    apply(state, action: LevelAction): AdapterResult<NetworkState> {
      if (action.type === 'construct/place') {
        const edgeId = action.payload.piece.shape;
        if (!edgeById(script, edgeId)) return { state, error: '这条候选边不存在。' };
        if (state.edges.includes(edgeId)) return { state, error: '这条边已经选了。' };
        return {
          state: { edges: [...state.edges, edgeId] },
          evidence: {
            phase: 'construct',
            tool: 'construct',
            action: action.type,
            metrics: { edges: state.edges.length + 1 },
          },
        };
      }
      if (action.type === 'construct/remove') {
        const edgeId = action.payload.pieceId;
        if (!state.edges.includes(edgeId)) return { state, error: '这条边还没选。' };
        return {
          state: { edges: state.edges.filter((id) => id !== edgeId) },
          evidence: { phase: 'construct', tool: 'construct', action: action.type },
        };
      }
      return { state, error: '这个动作不属于路网关。' };
    },
    artifact(state) {
      if (state.edges.length === 0) return null;
      return { edges: [...state.edges] };
    },
    artifactSummaries: summary,
    checkpoints(state) {
      const components = connectedComponents(script, state.edges).length;
      return {
        edges: state.edges.length > 0,
        connected: state.edges.length > 0 && components === 1,
        commit: state.edges.length > 0 && components === 1 && validateNetworkArtifact(script, { edges: state.edges }).passed,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      return {
        construct: {
          pieces: state.edges.map((edgeId, index) => ({
            id: edgeId,
            shape: edgeId,
            x: index,
            y: 0,
          })),
        },
      };
    },
    validate(_detail, variant, artifact) {
      const result = validateNetworkArtifact(script, artifact);
      if (result.passed) {
        return {
          passed: true,
          stamps: variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer'],
          missingEvidence: [],
          artifacts: [],
          metrics: result.metrics,
        };
      }
      const failureClass = result.failures[0] ?? 'network-empty';
      return {
        passed: false,
        stamps: [],
        failure: {
          class: failureClass,
          variantId: variant.id,
          causes: [{
            kind: 'constraint',
            ref: failureClass,
            messageKey: FAILURE_MESSAGES[failureClass] ?? '路网还没有连通或超出预算。',
            params: {
              keyEdges: result.metrics.keyEdges ?? 0,
              minKeyEdges: script.minKeyEdges,
              cost: result.metrics.cost ?? 0,
              budget: script.budget,
            },
          }],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    },
    actionsFor(_detail, _variant, artifact) {
      const raw = artifact as { edges?: string[] } | null;
      const actions: LevelAction[] = [];
      for (const edgeId of raw?.edges ?? []) {
        actions.push({ type: 'construct/place', payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: 0 } } });
      }
      actions.push({ type: 'submit', payload: {} });
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function createNetworkRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = networkScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createNetworkAdapter(script));
}
