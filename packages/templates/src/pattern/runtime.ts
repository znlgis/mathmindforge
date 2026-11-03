import type {
  ActionResult, ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions,
  RunRecord, RunSnapshot, StampId, ToolId, ToolUsageState, Verdict,
} from '@mmf/game-kit';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { validateRule } from '@mmf/toolkit/pattern';
import { patternDigest } from '@mmf/toolkit/pattern';
import { actionsFor, buildPreview, parseScript, patternRuleKey, toWorld, validateArtifact } from './logic';
import type { PatternPreview, PatternScript, PatternToolStateView, PatternVariant } from './logic';

interface RuntimeState {
  inspected: number[];
  rule: PatternRule | null;
  committed: boolean;
  /** 「预览一下」的预测格；只给画布画 ghost，不参与判定。 */
  preview?: PatternPreview;
  /** 预览序号单调递增：ToolDock 每次预览前都会重发 setCycle，不能拿 preview.seq 自增。 */
  previewSeq: number;
  placements: Map<number, string>;
  checkpoints: Record<string, boolean>;
  runs: RunRecord[];
  lastRun?: RunRecord;
  verdict?: Verdict;
  stamps: StampId[];
  revision: number;
  phase: RunSnapshot['phase'];
  usage: Record<ToolId, ToolUsageState>;
  /** 运行序号：runs 只保留最近 10 条，id 不能靠长度推（否则第 11 次起会重复）。 */
  runSeq: number;
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
    previewSeq: 0,
    placements: new Map(),
    checkpoints: {},
    runs: [],
    stamps: [],
    revision: 0,
    phase: 'idle',
    usage: emptyUsage(),
    runSeq: 0,
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
    // 快照里比公共 PatternToolState 多一个 preview：公共类型不该为了一个模板扩字段，
    // 写入侧按结构化子类型（多了可选字段仍可赋给父类型），画布读取时再窄化回来。
    const patternState: PatternToolStateView = {
      inspected: [...state.inspected],
      cycle: state.rule?.tokens,
      transform: state.rule?.transform,
      committed: state.committed,
      preview: state.preview,
    };
    return {
      levelId: detail.id,
      variantId: 'base',
      phase: state.phase,
      artifacts: artifactSummaries(),
      toolState: {
        pattern: patternState,
        construct: { pieces },
      },
      // 快照是浅拷贝：toolUsage 逐工具复制，避免监听方拿到的旧快照被后续动作改写。
      toolUsage: Object.fromEntries(
        Object.entries(state.usage).map(([tool, usage]) => [tool, { ...usage }]),
      ) as Record<ToolId, ToolUsageState>,
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
      id: 'run-' + (state.runSeq + 1),
      variantId: 'base',
      at: opts.now(),
      outcome,
      failureClass,
      artifactDigests: artifactSummaries().map((item) => item.digest),
      durationMs: Math.max(0, opts.now() - state.startedAt),
    };
    state.runSeq += 1;
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
        // 周期/变换变了，旧预测就不再是这条规则的脸；留着会画出过期的 ghost。
        state.preview = undefined;
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
        const cycle = action.payload.cycle;
        const transform = action.payload.transform;
        if (cycle !== undefined) {
          if (!Array.isArray(cycle) || cycle.length < 2 || cycle.length > 6) {
            return fail('重复单元至少要两块。');
          }
          const rule: PatternRule = { tokens: [...cycle], period: cycle.length, transform: transform ?? 'none' };
          const sameAsCommitted = state.committed && state.rule
            && patternRuleKey(state.rule) === patternRuleKey(rule);
          state.rule = rule;
          // 预览不是提交：只有预览的规则与已提交的规则不一致时，才让旧提交失效；
          // 否则玩家先点「用这条规律」再点「预览一下」，已提交状态会被无故打掉，run/submit 全部失败。
          if (!sameAsCommitted) state.committed = false;
        }
        if (!state.rule) return fail('先拼出一个重复单元，再预览。');
        usage('pattern').used += 1;
        usage('pattern').lastAction = action.type;
        // 预览必须在画布上看得见：把规则对整条带子的预测记进快照，场景据此画 ghost。
        // seq 每次 +1，连点「预览一下」也能重新跑一遍。
        state.previewSeq += 1;
        state.preview = buildPreview(script, state.rule, opts.now(), state.previewSeq);
        state.phase = 'editing';
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
        // 提交后画布要让位给「哪块放错了」的即时提示，预览 ghost 先收起。
        state.preview = undefined;
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
        state.preview = undefined;
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
        // 判定结果要干净：预览 ghost 不参与、也不该在结果画面上抢视线。
        state.preview = undefined;
        const missing = missingEvidence();
        const artifact = artifactOf();
        // 与 shared/runtime 同一条判定顺序：先结构校验，再报缺步骤（docs/12 P0-1）。
        if (artifact === null) {
          if (missing.length === 0) return fail('还差一个可以提交的结构。');
          const pending: Verdict = {
            passed: false,
            stamps: [],
            missingEvidence: missing,
            artifacts: artifactSummaries(),
          };
          state.verdict = pending;
          state.phase = 'editing';
          emit({ phase: 'result', action: action.type, outcome: 'fail' });
          notify();
          return { ok: true, verdict: pending, snapshot: snapshot() };
        }
        const verdict = validateArtifact(script, baseVariant, artifact);
        if (!verdict.passed) {
          verdict.missingEvidence = missing;
          verdict.artifacts = artifactSummaries();
          state.verdict = verdict;
          state.stamps = verdict.stamps;
          state.phase = 'failed';
          state.revision += 1;
          addRun('fail', verdict.failure?.class);
          emit({
            phase: 'result',
            action: action.type,
            outcome: 'fail',
            failureClass: verdict.failure?.class,
          });
          notify();
          return { ok: true, verdict, snapshot: snapshot() };
        }
        if (missing.length > 0) {
          const pending: Verdict = {
            passed: false,
            stamps: [],
            missingEvidence: missing,
            artifacts: artifactSummaries(),
          };
          state.verdict = pending;
          state.phase = 'editing';
          emit({ phase: 'result', action: action.type, outcome: 'fail' });
          notify();
          return { ok: true, verdict: pending, snapshot: snapshot() };
        }
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