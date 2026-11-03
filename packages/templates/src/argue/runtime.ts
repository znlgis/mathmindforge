import type {
  ArgumentSnapshot, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { boardCells, boardCounts } from './engine';
import type { BoardCounts } from './engine';
import { parseScript, summarizeArgument, validateArtifact } from './logic';
import type { ArgueScript } from './schema';

interface Domino {
  id: string;
  shape: 'h' | 'v';
  x: number;
  y: number;
}

interface ArgumentDraft {
  claim?: string;
  warrant?: string;
  scope?: string;
  evidence?: { black?: number; white?: number; cells?: number };
  committed: boolean;
}

interface ArgueState {
  script: ArgueScript;
  dominoes: Domino[];
  counts?: BoardCounts;
  argument: ArgumentDraft;
  sampled: boolean;
}

function coveredCells(domino: Domino): string[] {
  const cells = [domino.x + ',' + domino.y];
  if (domino.shape === 'h') cells.push((domino.x + 1) + ',' + domino.y);
  else cells.push(domino.x + ',' + (domino.y + 1));
  return cells;
}

function canPlace(script: ArgueScript, dominoes: Domino[], next: Domino): string | null {
  const allowed = new Set(boardCells(script).map((cell) => cell.x + ',' + cell.y));
  const used = new Set<string>();
  for (const domino of dominoes) {
    for (const cell of coveredCells(domino)) used.add(cell);
  }
  for (const cell of coveredCells(next)) {
    if (!allowed.has(cell)) return '这块多米诺压到缺口或出界了。';
    if (used.has(cell)) return '这里已经有骨牌了。';
  }
  return null;
}

function toArgument(state: ArgueState): ArgumentSnapshot {
  return {
    claim: state.argument.claim,
    warrant: state.argument.warrant,
    scope: state.argument.scope,
    evidence: state.argument.evidence,
    committed: state.argument.committed,
  };
}

function createArgueAdapter(): RuntimeAdapter<ArgueState> {
  return {
    initialState(detail: LevelDetail): ArgueState {
      return {
        script: parseScript(detail.levelScript),
        dominoes: [],
        argument: { committed: false },
        sampled: false,
      };
    },

    apply(state, action: LevelAction): AdapterResult<ArgueState> {
      const next: ArgueState = {
        ...state,
        dominoes: [...state.dominoes],
        argument: { ...state.argument, evidence: state.argument.evidence ? { ...state.argument.evidence } : undefined },
      };
      switch (action.type) {
        case 'construct/place': {
          const piece = action.payload.piece;
          const shape = piece.shape === 'v' ? 'v' : 'h';
          const domino: Domino = {
            id: piece.id || ('domino-' + next.dominoes.length),
            shape,
            x: piece.x,
            y: piece.y,
          };
          const error = canPlace(next.script, next.dominoes, domino);
          if (error) return { state, error };
          next.dominoes.push(domino);
          return {
            state: next,
            evidence: { phase: 'construct', tool: 'construct', action: 'construct/place', metrics: { placed: next.dominoes.length } },
          };
        }
        case 'construct/remove': {
          const id = action.payload.pieceId;
          next.dominoes = next.dominoes.filter((item) => item.id !== id);
          return {
            state: next,
            evidence: { phase: 'construct', tool: 'construct', action: 'construct/remove' },
          };
        }
        case 'probe/sample': {
          const counts = boardCounts(next.script);
          next.counts = counts;
          next.sampled = true;
          return {
            state: next,
            evidence: {
              phase: 'observe',
              tool: 'probe',
              action: 'probe/sample',
              metrics: { black: counts.black, white: counts.white, cells: counts.cells },
              artifact: { id: 'counts', kind: 'dataset', digest: digest(counts), summary: counts.black + ' 黑 / ' + counts.white + ' 白' },
            },
          };
        }
        case 'argue/setClaim': {
          next.argument.claim = action.payload.claim;
          next.argument.committed = false;
          return { state: next, evidence: { phase: 'argue', action: 'argue/setClaim' } };
        }
        case 'argue/setWarrant': {
          next.argument.warrant = action.payload.warrant;
          next.argument.committed = false;
          return { state: next, evidence: { phase: 'argue', action: 'argue/setWarrant' } };
        }
        case 'argue/attachEvidence': {
          if (!next.counts) return { state, error: '先统计黑白格，再把证据挂到论证上。' };
          next.argument.evidence = next.argument.warrant === 'parity'
            ? { cells: next.counts.cells }
            : { black: next.counts.black, white: next.counts.white, cells: next.counts.cells };
          next.argument.committed = false;
          return { state: next, evidence: { phase: 'argue', action: 'argue/attachEvidence' } };
        }
        case 'argue/setScope': {
          next.argument.scope = action.payload.scope;
          next.argument.committed = false;
          return { state: next, evidence: { phase: 'argue', action: 'argue/setScope' } };
        }
        case 'argue/commit': {
          const a = next.argument;
          if (!a.claim || !a.warrant || !a.scope || !a.evidence) {
            return { state, error: '主张、依据、证据、适用范围都齐了才能提交论证。' };
          }
          a.committed = true;
          return { state: next, evidence: { phase: 'argue', action: 'argue/commit', outcome: 'info' } };
        }
        default:
          return { state, error: '这个动作不属于论证关。' };
      }
    },

    artifact(state) {
      if (!state.counts || !state.argument.committed) return null;
      return {
        counts: state.counts,
        argument: {
          claim: state.argument.claim,
          warrant: state.argument.warrant,
          scope: state.argument.scope,
          evidence: state.argument.evidence,
        },
      };
    },

    artifactSummaries(state) {
      if (!state.counts) return [];
      return summarizeArgument(state.script, {
        counts: state.counts,
        argument: {
          claim: state.argument.claim,
          warrant: state.argument.warrant,
          scope: state.argument.scope,
          evidence: state.argument.evidence,
        },
      });
    },

    checkpoints(state) {
      return {
        attempt: state.dominoes.length > 0,
        counts: state.sampled && state.counts !== undefined,
        claim: Boolean(state.argument.claim && state.argument.warrant && state.argument.evidence),
        commit: state.argument.committed,
      };
    },

    toolState(state) {
      return {
        construct: {
          pieces: state.dominoes.map((domino) => ({
            id: domino.id,
            shape: domino.shape,
            x: domino.x,
            y: domino.y,
          })),
        },
        probe: {
          dataset: state.counts
            ? {
                id: 'invariant-counts',
                n: state.counts.cells,
                values: [state.counts.black, state.counts.white, state.counts.cells],
                counts: { black: state.counts.black, white: state.counts.white, cells: state.counts.cells },
                digest: digest(state.counts),
              }
            : undefined,
          focusId: state.counts ? 'invariant-counts' : undefined,
        },
      };
    },

    argumentState(state) {
      return toArgument(state);
    },

    validate(detail, variant, artifact) {
      return validateArtifact(detail, variant, artifact);
    },

    actionsFor(_detail, _variant, _artifact) {
      const actions: LevelAction[] = [
        { type: 'construct/place', payload: { piece: { id: 'domino-0', shape: 'v', x: 0, y: 1 } } },
        { type: 'probe/sample', payload: {} },
        { type: 'argue/setClaim', payload: { claim: 'impossible' } },
        { type: 'argue/setWarrant', payload: { warrant: 'coloring' } },
        { type: 'argue/attachEvidence', payload: {} },
        { type: 'argue/setScope', payload: { scope: 'domino-tiling' } },
        { type: 'argue/commit', payload: {} },
        { type: 'submit', payload: {} },
      ];
      return actions;
    },

    transferVariants(_detail) {
      return [
        { id: 'v-rotate-90', axis: 'structure', patch: { rotate: 90 } },
        { id: 'v-rotate-180', axis: 'structure', patch: { rotate: 180 } },
      ];
    },

    transferFailureClass() {
      return 'argue-not-general';
    },
  };
}

export function createArgueRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return createRuntimeWithAdapter(detail, opts, createArgueAdapter());
}
