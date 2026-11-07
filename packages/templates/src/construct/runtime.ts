import type {
  ArtifactSummary, CounterPatch, LevelAction, LevelDetail, LevelRuntime, PiecePlacementInput,
  RuntimeOptions, ToolStateMap, Verdict,
} from '@mmf/game-kit';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import type { RuntimeVariant } from '../shared/types';
import { evaluateCounterexample } from './engine';
import {
  actionsFor, parseScript, summarizeCounter, summarizePayment, validateArtifact,
} from './logic';
import type { PaymentScript } from './logic';

interface CounterDraft {
  target: number;
  denominations: number[];
  premiseId?: string;
  tested: boolean;
  committed: boolean;
}

interface LastTest {
  ruleId: string;
  passed: boolean;
  failedPremise?: string;
}

interface ConstructState {
  /** 硬币放在 piece.shape 的字符串里：'1' / '3' / '4' */
  pieces: PiecePlacementInput[];
  nextId: number;
  counter: CounterDraft | null;
  lastTest?: LastTest;
  checkpoints: Record<string, boolean>;
}

function initialState(): ConstructState {
  return { pieces: [], nextId: 1, counter: null, checkpoints: {} };
}

function mark(state: ConstructState, checkpointId: string): ConstructState {
  return { ...state, checkpoints: { ...state.checkpoints, [checkpointId]: true } };
}

function pieceValue(piece: PiecePlacementInput): number {
  return Number(piece.shape);
}

function coinsOf(state: ConstructState): number[] {
  return state.pieces.map(pieceValue);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function createAdapter(script: PaymentScript): RuntimeAdapter<ConstructState> {
  function artifactOf(state: ConstructState): unknown | null {
    if (state.pieces.length === 0) return null;
    const coins = coinsOf(state);
    const counter = state.counter;
    const evaluation = counter
      ? evaluateCounterexample({ target: counter.target, denominations: counter.denominations })
      : null;
    return {
      payment: {
        coins,
        total: coins.reduce((sum, coin) => sum + coin, 0),
        count: coins.length,
      },
      // 产物只留可重算的判定输入：测没测过、提没提交由运行时状态负责，
      // 不再写进 artifact（编辑即自动测，选择前提即最终作答）。
      counterexample: counter
        ? {
            target: counter.target,
            denominations: [...counter.denominations],
            greedyCoins: evaluation?.greedy ? evaluation.greedy.count : undefined,
            optimalCoins: evaluation?.optimalCount ?? undefined,
            isCounterexample: evaluation?.isCounterexample ?? false,
            failedPremise: counter.premiseId,
          }
        : null,
    };
  }

  function artifactSummaries(state: ConstructState): ArtifactSummary[] {
    const out: ArtifactSummary[] = [];
    if (state.pieces.length > 0) out.push(summarizePayment(coinsOf(state)));
    if (state.counter) {
      out.push(summarizeCounter({
        target: state.counter.target,
        denominations: state.counter.denominations,
      }));
    }
    return out;
  }

  function editCounter(state: ConstructState, action: Extract<LevelAction, { type: 'counter/edit' }>): AdapterResult<ConstructState> {
    const patch: CounterPatch | undefined = action.payload?.patch;
    const instance = patch?.instance ?? {};
    const target = typeof instance.target === 'number' ? instance.target : Number.NaN;
    const rawDenominations = Array.isArray(instance.denominations)
      ? instance.denominations.filter((value): value is number => typeof value === 'number')
      : [];
    const denominations = [...new Set(rawDenominations)].sort((a, b) => a - b);
    const [minTarget, maxTarget] = script.counter.targetRange;

    if (!Number.isInteger(target) || target < minTarget || target > maxTarget) {
      return { state, error: '目标金额要在 ' + minTarget + ' 到 ' + maxTarget + ' 之间。' };
    }
    if (denominations.length < 2) {
      return { state, error: '至少选两种面额，才谈得上贪心。' };
    }
    const pool = new Set(script.counter.denominationPool);
    const outside = denominations.find((coin) => !pool.has(coin));
    if (outside !== undefined) return { state, error: '面额只能从 ' + script.counter.denominationPool.join('、') + ' 里选。' };

    const current = state.counter;
    const unchanged = current !== null
      && current.target === target
      && sameNumbers(current.denominations, denominations);
    const next: CounterDraft = unchanged
      ? current
      : { target, denominations, tested: false, committed: false };
    return {
      state: { ...state, counter: next, lastTest: unchanged ? state.lastTest : undefined },
      evidence: {
        phase: 'hypothesize',
        tool: 'counter',
        action: action.type,
        metrics: { target, denominations: denominations.length },
      },
    };
  }

  function testCounter(state: ConstructState, action: Extract<LevelAction, { type: 'counter/test' }>): AdapterResult<ConstructState> {
    const draft = state.counter;
    if (!draft) return { state, error: '先填目标金额和面额，再测试贪心。' };
    const evaluation = evaluateCounterexample({
      target: draft.target,
      denominations: draft.denominations,
    });
    const next: CounterDraft = { ...draft, tested: true, committed: false };
    const marked = mark({ ...state, counter: next }, 'test');
    return {
      state: {
        ...marked,
        lastTest: {
          ruleId: 'greedy',
          passed: evaluation.isCounterexample,
          failedPremise: undefined,
        },
      },
      evidence: {
        phase: 'run',
        tool: 'counter',
        action: action.type,
        metrics: {
          greedy: evaluation.greedyCount ?? -1,
          optimal: evaluation.optimalCount ?? -1,
          surplus: evaluation.surplus,
        },
      },
    };
  }

  function annotateCounter(state: ConstructState, action: Extract<LevelAction, { type: 'counter/annotate' }>): AdapterResult<ConstructState> {
    const draft = state.counter;
    if (!draft) return { state, error: '先填目标金额和面额，再选前提。' };
    if (!draft.tested) return { state, error: '先点"测试贪心"，看看它在这个例子里是不是最优。' };
    const premiseId = action.payload?.premiseId;
    if (typeof premiseId !== 'string' || !script.counter.premises.includes(premiseId)) {
      return { state, error: '这个前提不在这一关的选项里。' };
    }
    // 指出失效前提就是最终作答：不需要再点提交反例（编辑即自动测，选前提即提交）。
    const next: CounterDraft = { ...draft, premiseId, committed: true };
    const marked = mark({ ...state, counter: next }, 'annotate');
    return {
      state: {
        ...marked,
        lastTest: state.lastTest ? { ...state.lastTest, failedPremise: premiseId } : state.lastTest,
      },
      evidence: {
        phase: 'revise',
        tool: 'counter',
        action: action.type,
      },
    };
  }

  function commitCounter(state: ConstructState, action: Extract<LevelAction, { type: 'counter/commit' }>): AdapterResult<ConstructState> {
    const draft = state.counter;
    if (!draft || !draft.tested) return { state, error: '先测试一次，再提交反例。' };
    if (!draft.premiseId) return { state, error: '先选一条失效前提。' };
    const next: CounterDraft = { ...draft, committed: true };
    const marked = mark({ ...state, counter: next }, 'commit');
    const evaluation = evaluateCounterexample({
      target: next.target,
      denominations: next.denominations,
    });
    return {
      state: marked,
      evidence: {
        phase: 'generalize',
        tool: 'counter',
        action: action.type,
        artifact: summarizeCounter({ target: next.target, denominations: next.denominations }),
        outcome: evaluation.isCounterexample ? 'pass' : 'fail',
      },
    };
  }

  function apply(state: ConstructState, action: LevelAction): AdapterResult<ConstructState> {
    switch (action.type) {
      case 'construct/place': {
        const piece = action.payload?.piece;
        const value = piece && typeof piece.shape === 'string' ? Number(piece.shape) : Number.NaN;
        if (!Number.isInteger(value) || value <= 0 || !script.denominations.includes(value)) {
          return { state, error: '这个面额不在这一关里。' };
        }
        if (state.pieces.length >= script.maxCoins) {
          return { state, error: '最多放 ' + script.maxCoins + ' 枚硬币。' };
        }
        const nextPiece: PiecePlacementInput = {
          id: 'coin-' + state.nextId,
          shape: String(value),
          x: state.pieces.length,
          y: 0,
        };
        const next: ConstructState = {
          ...state,
          pieces: [...state.pieces, nextPiece],
          nextId: state.nextId + 1,
        };
        const marked = next.pieces.length >= 2 ? mark(next, 'construct') : next;
        return {
          state: marked,
          evidence: {
            phase: 'construct',
            tool: 'construct',
            action: action.type,
            metrics: { count: marked.pieces.length, total: coinsOf(marked).reduce((sum, coin) => sum + coin, 0) },
          },
        };
      }
      case 'construct/remove': {
        const pieceId = action.payload?.pieceId;
        const index = state.pieces.findIndex((piece) => piece.id === pieceId);
        if (index < 0) return { state, error: '找不到这枚硬币。' };
        const pieces = state.pieces
          .filter((_, position) => position !== index)
          .map((piece, position) => ({ ...piece, x: position }));
        return {
          state: { ...state, pieces },
          evidence: {
            phase: 'construct',
            tool: 'construct',
            action: action.type,
            metrics: { count: pieces.length },
          },
        };
      }
      case 'counter/edit':
        return editCounter(state, action);
      case 'counter/test':
        return testCounter(state, action);
      case 'counter/annotate':
        return annotateCounter(state, action);
      case 'counter/commit':
        return commitCounter(state, action);
      default:
        return { state, error: '这个动作还没有接上。' };
    }
  }

  function toolState(state: ConstructState): Partial<ToolStateMap> {
    const draft: CounterPatch = state.counter
      ? {
          ruleId: 'greedy',
          instance: {
            target: state.counter.target,
            denominations: [...state.counter.denominations],
          },
          premiseId: state.counter.premiseId,
        }
      : { ruleId: 'greedy', instance: {} };
    return {
      construct: { pieces: state.pieces.map((piece) => ({ ...piece })) },
      counter: { draft, lastTest: state.lastTest },
    };
  }

  return {
    initialState(): ConstructState {
      return initialState();
    },
    apply,
    artifact: artifactOf,
    artifactSummaries,
    checkpoints(state: ConstructState): Record<string, boolean> {
      // 证据检查点 = 答案状态的事实记录（不靠点过某个仪式按钮）：
      // payment：柜台上真的放了硬币；counter：反例已指出失效前提（annotate 即提交）。
      return {
        payment: state.pieces.length > 0,
        counter: state.counter !== null && state.counter.committed,
      };
    },
    toolState,
    /**
     * 答案填完整 = 反例已指出失效前提（annotate 即提交）+ 台面有硬币，
     * 且已经够付（总额达标）或已经放满（枚数到上限，必然是超额答案，交给 validate 报 overpay）。
     * 这里只决定「什么时候判」，对错仍由 validate 负责。
     */
    answerComplete(state: ConstructState): boolean {
      const coins = coinsOf(state);
      const total = coins.reduce((sum, coin) => sum + coin, 0);
      return Boolean(state.counter?.committed)
        && coins.length > 0
        && (total >= script.target || coins.length >= script.maxCoins);
    },
    validate(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
      return validateArtifact(detail, variant, artifact);
    },
    actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
      return actionsFor(detail, variant, artifact);
    },
    /** 两个 v-* 变体只换表征（硬币/砝码/卡片），不改变判定，因此没有迁移门。 */
    transferVariants(): RuntimeVariant[] {
      return [];
    },
  };
}

export function createConstructRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = parseScript(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createAdapter(script));
}