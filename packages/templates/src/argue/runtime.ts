import type {
  ArgumentSnapshot, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { boardCells, boardCounts, impossibleByInvariant } from './engine';
import type { BoardCounts } from './engine';
import {
  actionsFor, parseScript, summarizeArgument, validateArtifact,
} from './logic';
import type { ArgueScript } from './schema';

interface Domino {
  id: string;
  shape: 'h' | 'v';
  x: number;
  y: number;
}

/**
 * 论证草稿：只存玩家真正输入的东西（依据）和它自动带出来的证据。
 * 主张与适用范围不再是可填字段——它们由依据在棋盘上推出来，
 * 这样「主张」「范围」那两个零信息量下拉就不会再回来。
 */
interface ArgumentDraft {
  warrant?: string;
  evidence?: { black?: number; white?: number; cells?: number };
}

interface ArgueState {
  script: ArgueScript;
  dominoes: Domino[];
  counts?: BoardCounts;
  argument: ArgumentDraft;
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

/** 棋盘自身的不变量已经判定：这些棋盘用 1×2 骨牌铺不满。 */
function boardClaim(script: ArgueScript): 'impossible' | undefined {
  return impossibleByInvariant(boardCounts(script)) ? 'impossible' : undefined;
}

/**
 * 证据跟着依据走：换依据就换证据，不再有「先挂证据再换依据」的顺序陷阱。
 * 染色要黑白两个数；奇偶/面积只要总格数（两者是同一个量）。
 */
function evidenceFor(warrant: string, counts: BoardCounts): { black?: number; white?: number; cells?: number } {
  if (warrant === 'coloring') return { black: counts.black, white: counts.white, cells: counts.cells };
  return { cells: counts.cells };
}

/** 论证是派生状态：有依据 + 有证据 + 有棋盘计数，就已经是一份提交过的证书。 */
function isCommitted(state: ArgueState): boolean {
  return Boolean(state.argument.warrant && state.argument.evidence && state.counts);
}

function toArgument(state: ArgueState): ArgumentSnapshot {
  const warrant = state.argument.warrant;
  const claim = warrant ? boardClaim(state.script) : undefined;
  return {
    // 主张与范围由依据推出来：界面上看到的「不可能铺满 → 1×2 多米诺铺满」不是下拉选项，是结论。
    claim,
    warrant,
    scope: warrant ? state.script.scopes[0] : undefined,
    evidence: state.argument.evidence,
    committed: isCommitted(state),
  };
}

/**
 * 论证证书 = 「依据 + 证据 + 棋盘计数」都齐了，且主张与范围由依据推得出来。
 * artifact 与 answerComplete 共用这一处判定，避免两套口径漂移。
 */
function artifactOf(state: ArgueState): {
  counts: BoardCounts;
  argument: {
    claim: string;
    warrant: string;
    scope: string;
    evidence: ArgumentDraft['evidence'];
  };
} | null {
  if (!state.counts || !isCommitted(state)) return null;
  const argument = toArgument(state);
  if (!argument.claim || !argument.warrant || !argument.scope) return null;
  return {
    counts: state.counts,
    argument: {
      claim: argument.claim,
      warrant: argument.warrant,
      scope: argument.scope,
      evidence: argument.evidence,
    },
  };
}

function createArgueAdapter(): RuntimeAdapter<ArgueState> {
  return {
    initialState(detail: LevelDetail): ArgueState {
      return {
        script: parseScript(detail.levelScript),
        dominoes: [],
        argument: {},
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
          // 骨牌只是自由沙盒：记录它，但不进判定，也不再是必须先走的证据步骤。
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
        case 'argue/setWarrant': {
          const wanted = action.payload.warrant;
          if (!next.script.warrants.includes(wanted as ArgueScript['warrants'][number])) {
            return { state, error: '这条依据不在这一关的选项里。' };
          }
          // 一次点击 = 一次输入：选依据时把计数、证据、主张、范围一起补齐（旧实现要四次下拉 + 两个按钮）。
          const counts = boardCounts(next.script);
          next.counts = counts;
          next.argument.warrant = wanted;
          next.argument.evidence = evidenceFor(wanted, counts);
          return {
            state: next,
            evidence: {
              phase: 'argue',
              action: 'argue/setWarrant',
              metrics: { black: counts.black, white: counts.white, cells: counts.cells },
              artifact: {
                id: 'argument',
                kind: 'argument',
                digest: digest({ warrant: wanted, evidence: next.argument.evidence }),
                summary: wanted + ' · ' + (next.argument.evidence.cells ?? counts.cells) + ' 格',
              },
            },
          };
        }
        case 'argue/commit': {
          // 幂等：论证齐了就通过（committed 已是派生状态），没齐只报缺什么。
          if (!isCommitted(next)) return { state, error: '论证还缺一块：主张、依据、证据或范围。' };
          return { state: next, evidence: { phase: 'argue', action: 'argue/commit', outcome: 'info' } };
        }
        default:
          return { state, error: '这个动作不属于论证关。' };
      }
    },

    artifact(state) {
      return artifactOf(state);
    },

    artifactSummaries(state) {
      if (!state.counts) return [];
      return summarizeArgument(state.script, {
        counts: state.counts,
        argument: toArgument(state),
      });
    },

    checkpoints(state) {
      return {
        // 三个检查点全是事实记录：数过 ↔ 选过依据 ↔ 证书已组成，不再有要玩家再走一遍的仪式。
        counts: state.counts !== undefined,
        warrant: Boolean(state.argument.warrant),
        commit: isCommitted(state),
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

    // 自动判题口径：依据一选，证据/主张/范围都由运行时派生，证书当场成立 → 该判了。
    // 这里只回答「填完了没有」，依据选错（例如偶数格棋盘上选奇偶）仍由 validate 判错。
    answerComplete(state) {
      return artifactOf(state) !== null;
    },

    validate(detail, variant, artifact) {
      return validateArtifact(detail, variant, artifact);
    },

    // 只留一个事实来源：黄金动作序列与迁移门都委托给 logic.ts。
    actionsFor: (detail, variant, artifact) => actionsFor(detail, variant, artifact),


  };
}

export function createArgueRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return createRuntimeWithAdapter(detail, opts, createArgueAdapter());
}