import type {
  ActionResult, ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions,
  RunRecord, RunSnapshot, StampId, ToolId, ToolUsageState, Verdict,
} from '@mmf/game-kit';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { validateRule } from '@mmf/toolkit/pattern';
import { patternDigest } from '@mmf/toolkit/pattern';
import { actionsFor, parseScript, toWorld, validateArtifact } from './logic';
import type { PatternScript, PatternVariant } from './logic';

interface RuntimeState {
  inspected: number[];
  rule: PatternRule | null;
  committed: boolean;
  placements: Map<number, string>;
  checkpoints: Record<string, boolean>;
  runs: RunRecord[];
  lastRun?: RunRecord;
  verdict?: Verdict;
  stamps: StampId[];
  revision: number;
  phase: RunSnapshot['phase'];
  usage: Record<ToolId, ToolUsageState>;
  startedAt: number;
}

function emptyUsage(): Record<ToolId, ToolUsageState> {
  return {
    pattern: { used: 0 }, rule: { used: 0 }, construct: { used: 0 },
    knob: { used: 0 }, probe: { used: 0 }, counter: { used: 0 },
  };
}

function initialState(now: number): RuntimeState {
  return {
    inspected: [],
    rule: null,
    committed: false,
    placements: new Map(),
    checkpoints: {},
    runs: [],
    stamps: [],
    revision: 0,
    phase: 'idle',
    usage: emptyUsage(),
    startedAt: now,
  };
}

export function createPatternRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script: PatternScript = parseScript(detail.levelScript);
  const world = toWorld(script);
  const baseVariant: PatternVariant = { id: 'base', axis: 'structure', patch: {} };
  const brokenIndices = script.scenario.visible
    .map((value, index) => (value === null ? index : -1))
    .filter((index) => index >= 0);

  let state = initialState(opts.now());
  const listeners = new Set<(snapshot: RunSnapshot) => void>();

  function emit(draft: Omit<import('@mmf/game-kit').EvidenceDraft, 'variantId'>): void {
    opts.onEvidence?.({ ...draft, variantId: 'base' });
  }

  function usage(tool: ToolId): ToolUsageState {
    return state.usage[tool];
  }

  function artifactOf(): { patternRule: PatternRule; repair: { index: number; token: string }[] } | null {
    if (!state.rule || !state.committed) return null;
    const repair = [...state.placements.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, token]) => ({ index, token }));
    return { patternRule: state.rule, repair };
  }

  function artifactSummaries(): ArtifactSummary[] {
    const artifact = artifactOf();
    if (!artifact) return [];
    const out: ArtifactSummary[] = [{
      id: 'pattern-rule',
      kind: 'pattern-rule',
      digest: patternDigest(artifact.patternRule),
      summary: artifact.patternRule.tokens.join('') + ' / ' + artifact.patternRule.transform,
    }];
    if (artifact.repair.length > 0) {
      out.push({
        id: 'repair-set',
        kind: 'repair-set',
        digest: patternDigest(artifact.repair),
        summary: artifact.repair.length + ' 块',
      });
    }
    return out;
  }

  function missingEvidence(): Verdict['missingEvidence'] {
    const missing: Verdict['missingEvidence'] = [];
    for (const item of detail.evidencePlan) {
      if (!state.checkpoints[item.id]) {
        missing.push({
          checkpointId: item.id,
          phase: item.phase,
          messageKey: item.descriptionKey,
          actionHint: item.require,
        });
      }
    }
    return missing;
  }

  function snapshot(): RunSnapshot {
    const pieces = [...state.placements.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, shape]) => ({
        id: 'repair-' + index,
        shape,
        x: index,
        y: 0,
      }));
    return {
      levelId: detail.id,
      variantId: 'base',
      phase: state.phase,
      artifacts: artifactSummaries(),
      toolState: {
        pattern: {
          inspected: [...state.inspected],
          cycle: state.rule?.tokens,
          transform: state.rule?.transform,
          committed: state.committed,
        },
        construct: { pieces },
      },
      toolUsage: state.usage,
      checkpoints: { ...state.checkpoints },
      runs: [...state.runs],
      lastRun: state.lastRun,
      verdict: state.verdict,
      stamps: [...state.stamps],
      revision: state.revision,
      updatedAt: opts.now(),
    };
  }

  function notify(): void {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }

  function addRun(outcome: 'pass' | 'fail', failureClass?: string): RunRecord {
    const record: RunRecord = {
      id: 'run-' + (state.runs.length + 1),
      variantId: 'base',
      at: opts.now(),
      outcome,
      failureClass,
      artifactDigests: artifactSummaries().map((item) => item.digest),
      durationMs: Math.max(0, opts.now() - state.startedAt),
    };
    state.runs = [...state.runs, record].slice(-10);
    state.lastRun = record;
    return record;
  }

  function fail(message: string): ActionResult {
    notify();
    return { ok: false, reason: 'invalid-action', message, snapshot: snapshot() };
  }

  async function dispatch(action: LevelAction): Promise<ActionResult> {
    switch (action.type) {
      case 'pattern/inspect': {
        const index = action.payload.index;
        if (!Number.isInteger(index) || index < 0 || index >= script.scenario.length) {
          return fail('这个位置不在带子上。');
        }
        usage('pattern').used += 1;
        usage('pattern').lastAction = action.type;
        if (!state.inspected.includes(index)) state.inspected.push(index);
        if (state.inspected.length >= 2) state.checkpoints.observe = true;
        state.phase = 'observing';
        emit({ phase: 'observe', tool: 'pattern', action: action.type, metrics: { index } });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'pattern/setCycle': {
        const cycle = action.payload.cycle;
        const transform = action.payload.transform;
        if (!Array.isArray(cycle) || cycle.length < 2 || cycle.length > 6) {
          return fail('重复单元至少要两块。');
        }
        usage('pattern').used += 1;
        usage('pattern').lastAction = action.type;
        state.rule = { tokens: [...cycle], period: cycle.length, transform };
        state.committed = false;
        state.phase = 'editing';
        emit({
          phase: 'hypothesize',
          tool: 'pattern',
          action: action.type,
          metrics: { period: cycle.length },
        });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'pattern/preview': {
        if (!state.rule) return fail('先拼出一个重复单元，再预览。');
        usage('pattern').used += 1;
        usage('pattern').lastAction = action.type;
        emit({ phase: 'observe', tool: 'pattern', action: action.type });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'pattern/commit': {
        if (!state.rule) return fail('先拼出一个重复单元。');
        const error = validateRule(world, state.rule);
        if (error) {
          emit({ phase: 'hypothesize', tool: 'pattern', action: action.type, outcome: 'fail', failureClass: error });
          notify();
          return fail('这条规律不在这一关允许的范围里。');
        }
        usage('pattern').used += 1;
        usage('pattern').lastAction = action.type;
        state.committed = true;
        state.checkpoints.hypothesis = true;
        state.phase = 'editing';
        emit({
          phase: 'hypothesize',
          tool: 'pattern',
          action: action.type,
          artifact: {
            id: 'pattern-rule',
            kind: 'pattern-rule',
            digest: patternDigest(state.rule),
            summary: state.rule.tokens.join('') + ' / ' + state.rule.transform,
          },
        });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'construct/place': {
        const piece = action.payload.piece;
        if (!Number.isInteger(piece.x) || !brokenIndices.includes(piece.x)) {
          return fail('这一格不是断开的地方。');
        }
        usage('construct').used += 1;
        usage('construct').lastAction = action.type;
        state.placements.set(piece.x, piece.shape);
        if (state.placements.size >= brokenIndices.length) state.checkpoints.repair = true;
        state.phase = 'editing';
        emit({
          phase: 'construct',
          tool: 'construct',
          action: action.type,
          metrics: { index: piece.x },
        });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'construct/remove': {
        const match = /^repair-(\d+)$/.exec(action.payload.pieceId);
        if (!match) return fail('找不到这块。');
        const index = Number(match[1]);
        state.placements.delete(index);
        state.checkpoints.repair = state.placements.size >= brokenIndices.length;
        usage('construct').used += 1;
        usage('construct').lastAction = action.type;
        emit({ phase: 'construct', tool: 'construct', action: action.type, metrics: { index } });
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      case 'run': {
        const artifact = artifactOf();
        if (!artifact) return fail('先提交一条规律，再运行。');
        const verdict = validateArtifact(script, baseVariant, artifact);
        state.verdict = verdict;
        state.stamps = verdict.stamps;
        state.phase = verdict.passed ? 'passed' : 'failed';
        state.checkpoints.run = true;
        if (!verdict.passed) state.revision += 1;
        const record = addRun(verdict.passed ? 'pass' : 'fail', verdict.failure?.class);
        emit({
          phase: 'run',
          tool: 'pattern',
          action: action.type,
          outcome: verdict.passed ? 'pass' : 'fail',
          failureClass: verdict.failure?.class,
          metrics: { durationMs: record.durationMs },
        });
        notify();
        return { ok: true, verdict, snapshot: snapshot() };
      }
      case 'submit': {
        const missing = missingEvidence();
        if (missing.length > 0) {
          const verdict: Verdict = {
            passed: false,
            stamps: [],
            missingEvidence: missing,
            artifacts: artifactSummaries(),
          };
          state.verdict = verdict;
          state.phase = 'editing';
          emit({ phase: 'result', action: action.type, outcome: 'fail' });
          notify();
          return { ok: true, verdict, snapshot: snapshot() };
        }
        const artifact = artifactOf();
        const verdict = artifact
          ? validateArtifact(script, baseVariant, artifact)
          : {
              passed: false,
              stamps: [] as StampId[],
              missingEvidence: missingEvidence(),
              artifacts: artifactSummaries(),
            };
        state.verdict = verdict;
        state.stamps = verdict.stamps;
        state.phase = verdict.passed ? 'passed' : 'failed';
        if (!verdict.passed) state.revision += 1;
        addRun(verdict.passed ? 'pass' : 'fail', verdict.failure?.class);
        emit({
          phase: 'result',
          action: action.type,
          outcome: verdict.passed ? 'pass' : 'fail',
          failureClass: verdict.failure?.class,
        });
        notify();
        return { ok: true, verdict, snapshot: snapshot() };
      }
      case 'reset': {
        state = initialState(opts.now());
        notify();
        return { ok: true, snapshot: snapshot() };
      }
      default:
        return fail('这个动作还没有接上。');
    }
  }

  async function autoplay(): Promise<ActionResult> {
    const solution = detail.solutions[0];
    if (!solution) {
      return { ok: false, reason: 'not-ready', message: '这一关还没有黄金解。', snapshot: snapshot() };
    }
    const actions = actionsFor(script, baseVariant, solution.artifact);
    let last: ActionResult = { ok: true, snapshot: snapshot() };
    for (const action of actions) {
      last = await dispatch(action);
      if (!last.ok) return last;
    }
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
      state = initialState(opts.now());
      notify();
    },
  };
}
