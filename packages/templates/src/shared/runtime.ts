import type {
  ActionResult, ArgumentSnapshot, ArtifactSummary, EvidenceDraft, LevelAction, LevelDetail, LevelRuntime,
  RunRecord, RunSnapshot, RuntimeOptions, StampId, ToolId, ToolStateMap, ToolUsageState, Verdict,
} from '@mmf/game-kit';
import { TOOL_IDS } from '@mmf/game-kit';
import type { RuntimeVariant } from './types';

export interface TemplateCheckpointContext {
  runs: number;
  lastRun?: RunRecord;
  now: number;
}

export interface AdapterResult<S> {
  state: S;
  evidence?: Omit<EvidenceDraft, 'variantId'>;
  error?: string;
}

export interface RuntimeAdapter<S> {
  initialState(detail: LevelDetail, now: number): S;
  /** 只处理工具动作；run/submit/reset 由共享运行时统一处理 */
  apply(state: S, action: LevelAction): AdapterResult<S>;
  artifact(state: S): unknown | null;
  artifactSummaries(state: S): ArtifactSummary[];
  checkpoints(state: S, ctx: TemplateCheckpointContext): Record<string, boolean>;
  toolState(state: S): Partial<ToolStateMap>;
  validate(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): Verdict;
  actionsFor(detail: LevelDetail, variant: RuntimeVariant, artifact: unknown): LevelAction[];
  transferVariants?(detail: LevelDetail): RuntimeVariant[];
  transferFailureClass?(detail: LevelDetail): string;
  /** argue 模板的结构化证书状态；其他模板不实现 */
  argumentState?(state: S): ArgumentSnapshot | undefined;
}

export const BASE_VARIANT: RuntimeVariant = { id: 'base', axis: 'structure', patch: {} };

function emptyUsage(): Record<ToolId, ToolUsageState> {
  const out = {} as Record<ToolId, ToolUsageState>;
  for (const tool of TOOL_IDS) out[tool] = { used: 0 };
  return out;
}

function toolOf(type: string): ToolId | null {
  const prefix = type.split('/')[0];
  return (TOOL_IDS as readonly string[]).includes(prefix) ? (prefix as ToolId) : null;
}

interface Meta<S> {
  state: S;
  runs: RunRecord[];
  lastRun?: RunRecord;
  verdict?: Verdict;
  stamps: StampId[];
  revision: number;
  phase: RunSnapshot['phase'];
  usage: Record<ToolId, ToolUsageState>;
  startedAt: number;
}

export function createRuntimeWithAdapter<S>(
  detail: LevelDetail,
  opts: RuntimeOptions,
  adapter: RuntimeAdapter<S>,
): LevelRuntime {
  let meta: Meta<S> = {
    state: adapter.initialState(detail, opts.now()),
    runs: [],
    stamps: [],
    revision: 0,
    phase: 'idle',
    usage: emptyUsage(),
    startedAt: opts.now(),
  };
  const listeners = new Set<(snapshot: RunSnapshot) => void>();

  function emit(draft: Omit<EvidenceDraft, 'variantId'>): void {
    opts.onEvidence?.({ ...draft, variantId: BASE_VARIANT.id });
  }

  function checkpointCtx(): TemplateCheckpointContext {
    return { runs: meta.runs.length, lastRun: meta.lastRun, now: opts.now() };
  }

  function checkpoints(): Record<string, boolean> {
    return adapter.checkpoints(meta.state, checkpointCtx());
  }

  function snapshot(): RunSnapshot {
    return {
      levelId: detail.id,
      variantId: BASE_VARIANT.id,
      phase: meta.phase,
      artifacts: adapter.artifactSummaries(meta.state),
      toolState: adapter.toolState(meta.state),
      toolUsage: meta.usage,
      checkpoints: checkpoints(),
      runs: [...meta.runs],
      lastRun: meta.lastRun,
      verdict: meta.verdict,
      argument: adapter.argumentState?.(meta.state),
      stamps: [...meta.stamps],
      revision: meta.revision,
      updatedAt: opts.now(),
    };
  }

  function notify(): void {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }

  function fail(message: string): ActionResult {
    notify();
    return { ok: false, reason: 'invalid-action', message, snapshot: snapshot() };
  }

  function missingEvidence(): Verdict['missingEvidence'] {
    const state = checkpoints();
    const missing: Verdict['missingEvidence'] = [];
    for (const item of detail.evidencePlan) {
      if (state[item.id]) continue;
      missing.push({
        checkpointId: item.id,
        phase: item.phase,
        messageKey: item.descriptionKey,
        actionHint: item.require,
      });
    }
    return missing;
  }

  function recordRun(outcome: 'pass' | 'fail', failureClass?: string): RunRecord {
    const record: RunRecord = {
      id: 'run-' + (meta.runs.length + 1),
      variantId: BASE_VARIANT.id,
      at: opts.now(),
      outcome,
      failureClass,
      artifactDigests: adapter.artifactSummaries(meta.state).map((item) => item.digest),
      durationMs: Math.max(0, opts.now() - meta.startedAt),
    };
    meta.runs = [...meta.runs, record].slice(-10);
    meta.lastRun = record;
    return record;
  }

  function applyVerdict(verdict: Verdict): void {
    meta.verdict = verdict;
    meta.stamps = verdict.stamps;
    meta.phase = verdict.passed ? 'passed' : 'failed';
    if (!verdict.passed) meta.revision += 1;
  }

  function transferCheck(artifact: unknown): { passed: boolean; verdict?: Verdict; variantId?: string } {
    const variants = adapter.transferVariants?.(detail) ?? [];
    for (const variant of variants) {
      const verdict = adapter.validate(detail, variant, artifact);
      if (!verdict.passed) return { passed: false, verdict, variantId: variant.id };
    }
    return { passed: true };
  }

  async function dispatch(action: LevelAction): Promise<ActionResult> {
    if (action.type === 'submit') {
      const missing = missingEvidence();
      if (missing.length > 0) {
        const verdict: Verdict = {
          passed: false,
          stamps: [],
          missingEvidence: missing,
          artifacts: adapter.artifactSummaries(meta.state),
        };
        applyVerdict(verdict);
        emit({ phase: 'result', action: 'submit', outcome: 'fail' });
        notify();
        return { ok: true, verdict, snapshot: snapshot() };
      }
      const artifact = adapter.artifact(meta.state);
      if (artifact === null) {
        return fail('还差一个可以提交的结构。');
      }
      const verdict = adapter.validate(detail, BASE_VARIANT, artifact);
      if (verdict.passed) {
        const transfer = transferCheck(artifact);
        if (!transfer.passed) {
          const failureClass = adapter.transferFailureClass?.(detail) ?? 'transfer-failed';
          const failed: Verdict = {
            passed: false,
            stamps: [],
            failure: {
              class: failureClass,
              variantId: transfer.variantId,
              causes: transfer.verdict?.failure?.causes ?? [],
            },
            missingEvidence: [],
            artifacts: adapter.artifactSummaries(meta.state),
          };
          applyVerdict(failed);
          recordRun('fail', failureClass);
          emit({ phase: 'result', action: 'submit', outcome: 'fail', failureClass });
          notify();
          return { ok: true, verdict: failed, snapshot: snapshot() };
        }
        if ((adapter.transferVariants?.(detail) ?? []).length > 0 && !verdict.stamps.includes('transfer')) {
          verdict.stamps = [...verdict.stamps, 'transfer'];
        }
      }
      applyVerdict(verdict);
      recordRun(verdict.passed ? 'pass' : 'fail', verdict.failure?.class);
      emit({
        phase: 'result',
        action: 'submit',
        outcome: verdict.passed ? 'pass' : 'fail',
        failureClass: verdict.failure?.class,
      });
      notify();
      return { ok: true, verdict, snapshot: snapshot() };
    }

    if (action.type === 'run') {
      const artifact = adapter.artifact(meta.state);
      if (artifact === null) return fail('先完成工具，再运行。');
      const verdict = adapter.validate(detail, BASE_VARIANT, artifact);
      applyVerdict(verdict);
      const record = recordRun(verdict.passed ? 'pass' : 'fail', verdict.failure?.class);
      emit({
        phase: 'run',
        action: 'run',
        outcome: verdict.passed ? 'pass' : 'fail',
        failureClass: verdict.failure?.class,
        metrics: { durationMs: record.durationMs },
      });
      notify();
      return { ok: true, verdict, snapshot: snapshot() };
    }

    if (action.type === 'reset') {
      meta = {
        state: adapter.initialState(detail, opts.now()),
        runs: [],
        stamps: [],
        revision: 0,
        phase: 'idle',
        usage: emptyUsage(),
        startedAt: opts.now(),
      };
      notify();
      return { ok: true, snapshot: snapshot() };
    }

    const result = adapter.apply(meta.state, action);
    if (result.error) return fail(result.error);
    meta.state = result.state;
    meta.phase = 'editing';
    const tool = toolOf(action.type);
    if (tool) {
      meta.usage[tool].used += 1;
      meta.usage[tool].lastAction = action.type;
    }
    if (result.evidence) emit(result.evidence);
    notify();
    return { ok: true, snapshot: snapshot() };
  }

  async function autoplay(): Promise<ActionResult> {
    const solution = detail.solutions[0];
    if (!solution) {
      return { ok: false, reason: 'not-ready', message: '这一关还没有黄金解。', snapshot: snapshot() };
    }
    const actions = adapter.actionsFor(detail, BASE_VARIANT, solution.artifact);
    let last: ActionResult = { ok: true, snapshot: snapshot() };
    let submitted = false;
    for (const action of actions) {
      if (action.type === 'submit') submitted = true;
      last = await dispatch(action);
      if (!last.ok) return last;
    }
    if (!submitted) last = await dispatch({ type: 'submit', payload: {} });
    return last;
  }

  return {
    detail,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    autoplay,
    async reset() {
      meta = {
        state: adapter.initialState(detail, opts.now()),
        runs: [],
        stamps: [],
        revision: 0,
        phase: 'idle',
        usage: emptyUsage(),
        startedAt: opts.now(),
      };
      notify();
    },
  };
}
