import type {
  EvidenceDraft, LevelAction, LevelDetail, LevelRuntime, ProgramBlock, RuntimeOptions, Verdict,
} from '@mmf/game-kit';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter, RuntimeVariant } from '../shared';
import { executeProgram } from './engine';
import {
  RULE_TRANSFER_VARIANTS, actionsFor, countBlocks, parseScript, summarizeProgram, transferFailureClass,
  traceSummary, validateArtifact,
} from './logic';
import type { TraceSummary } from './logic';
import { programBlockSchema } from './schema';
import type { RuleScript } from './schema';

export interface RuleState {
  program: ProgramBlock[];
  selectedId?: string;
  committed: boolean;
  lastTrace?: TraceSummary;
}

function withProgram(program: ProgramBlock[], selectedId?: string): RuleState {
  return {
    program,
    selectedId,
    committed: false,
    lastTrace: undefined,
  };
}

function clampIndex(at: number, length: number): number {
  if (!Number.isInteger(at)) return length;
  return Math.max(0, Math.min(at, length));
}

function normalizeBlock(input: ProgramBlock): ProgramBlock | null {
  const parsed = programBlockSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function removeBlock(program: readonly ProgramBlock[], id: string): ProgramBlock[] | null {
  const index = program.findIndex((block) => block.id === id);
  if (index >= 0) {
    const next = [...program];
    next.splice(index, 1);
    return next;
  }
  for (let cursor = 0; cursor < program.length; cursor += 1) {
    const block = program[cursor];
    const children = block?.children;
    if (!block || !children) continue;
    const stripped = removeBlock(children, id);
    if (stripped) {
      const next = [...program];
      next[cursor] = { ...block, children: stripped };
      return next;
    }
  }
  return null;
}

/** 只移动顶层块：工具台的程序列表就是顶层序列。 */
function moveBlock(program: readonly ProgramBlock[], id: string, at: number): ProgramBlock[] | null {
  const index = program.findIndex((block) => block.id === id);
  if (index < 0) return null;
  const block = program[index];
  if (!block) return null;
  const rest = program.filter((_, cursor) => cursor !== index);
  const target = clampIndex(at, rest.length);
  const next = [...rest];
  next.splice(target, 0, block);
  return next;
}

function applyAction(
  script: RuleScript,
  state: RuleState,
  action: LevelAction,
): AdapterResult<RuleState> {
  switch (action.type) {
    case 'rule/place': {
      const block = normalizeBlock(action.payload.block);
      if (!block) return { state, error: '这一块还不完整：先拼好再放进去。' };
      const at = clampIndex(action.payload.at, state.program.length);
      const next = [...state.program.slice(0, at), block, ...state.program.slice(at)];
      if (countBlocks(next) > script.maxBlocks) {
        return { state, error: '程序格子到上限了：先用重复把路线缩短。' };
      }
      return {
        state: withProgram(next, block.id),
        evidence: { phase: 'construct', tool: 'rule', action: action.type },
      };
    }
    case 'rule/remove': {
      const next = removeBlock(state.program, action.payload.id);
      if (!next) return { state, error: '找不到要删掉的那一块。' };
      return {
        state: withProgram(next),
        evidence: { phase: 'construct', tool: 'rule', action: action.type },
      };
    }
    case 'rule/move': {
      const next = moveBlock(state.program, action.payload.id, action.payload.at);
      if (!next) return { state, error: '找不到要移动的那一块。' };
      return {
        state: withProgram(next, action.payload.id),
        evidence: { phase: 'construct', tool: 'rule', action: action.type },
      };
    }
    case 'rule/commit': {
      if (state.program.length === 0) {
        return { state, error: '程序还是空的：先放几块，再提交。' };
      }
      const trace = executeProgram(script, state.program);
      const evidence: Omit<EvidenceDraft, 'variantId'> = {
        phase: 'construct',
        tool: 'rule',
        action: action.type,
        outcome: trace.failureClass ? 'fail' : 'pass',
        failureClass: trace.failureClass,
      };
      const artifact = summarizeProgram(state.program)[0];
      if (artifact) evidence.artifact = artifact;
      return {
        state: { ...state, committed: true, lastTrace: traceSummary(trace) },
        evidence,
      };
    }
    default:
      return { state, error: '这个动作还没有接上。' };
  }
}

export function createRuleAdapter(detail: LevelDetail): RuntimeAdapter<RuleState> {
  const script = parseScript(detail.levelScript);

  return {
    initialState(): RuleState {
      return { program: [], committed: false };
    },
    apply(state: RuleState, action: LevelAction): AdapterResult<RuleState> {
      return applyAction(script, state, action);
    },
    artifact(state: RuleState): unknown | null {
      if (!state.committed || state.program.length === 0) return null;
      return { program: state.program };
    },
    artifactSummaries(state: RuleState) {
      return state.committed ? summarizeProgram(state.program) : [];
    },
    checkpoints(state: RuleState, ctx) {
      return {
        build: state.committed && state.program.length > 0,
        run: ctx.runs > 0,
      };
    },
    toolState(state: RuleState) {
      return {
        rule: {
          program: state.program,
          selectedId: state.selectedId,
          lastTrace: state.lastTrace,
        },
      };
    },
    validate(_detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict {
      return validateArtifact(_detail, variant, artifact);
    },
    actionsFor(_detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[] {
      return actionsFor(_detail, variant, artifact);
    },
    transferVariants(): RuntimeVariant[] {
      return RULE_TRANSFER_VARIANTS.map((variant) => ({ ...variant, patch: { ...variant.patch } }));
    },
    transferFailureClass(): string {
      return transferFailureClass(detail);
    },
  };
}

export { RULE_TRANSFER_VARIANTS };

/** 规则关运行时：submit / run / reset / autoplay 全交给共享运行时。 */
export function createRuleRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  return createRuntimeWithAdapter(detail, opts, createRuleAdapter(detail));
}
