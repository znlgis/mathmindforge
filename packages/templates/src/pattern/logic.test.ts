import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import type { RuntimeOptions } from '@mmf/game-kit';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { tokenAt } from '@mmf/toolkit/pattern';
import { createPatternRuntime } from './runtime';
import {
  actionsFor, applyVariant, candidateRules, nextFillToken, parseScript, relabelArtifact, relabelVisible,
  symbolsOf, toWorld, transferFailureClass, transferVariants, validateArtifact,
} from './logic';
import type { PatternVariant } from './logic';

const detail = LEVEL_DETAILS['k-structure-pattern-path'];
const script = parseScript(detail.levelScript);
const base: PatternVariant = { id: 'base', axis: 'structure', patch: {} };

const symmetry = LEVEL_DETAILS['g13-structure-symmetry'];
const symmetryScript = parseScript(symmetry.levelScript);

function runtimeAt(level: typeof detail = detail, overrides: Partial<RuntimeOptions> = {}) {
  return createPatternRuntime(level, {
    seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true, ...overrides,
  });
}

const K_TRANSFER = transferVariants(detail);
const SYMMETRY_TRANSFER = transferVariants(symmetry);

describe('pattern template', () => {
  it('accepts both golden solutions', () => {
    for (const solution of detail.solutions) {
      const verdict = validateArtifact(script, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('rejects negative samples with declared classes', () => {
    for (const negative of detail.negativeSamples) {
      const verdict = validateArtifact(script, base, negative.artifact);
      expect(verdict.passed).toBe(false);
      expect(verdict.failure?.class).toBe(negative.expectFailure);
    }
  });

  it('applies variants and keeps the golden solution valid', () => {
    for (const variant of detail.variants) {
      applyVariant(script, variant);
      const verdict = validateArtifact(script, variant as PatternVariant, detail.solutions[0]?.artifact);
      expect(verdict.passed, variant.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('turns the visible strip into one-click rule candidates', () => {
    const candidates = candidateRules(script);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.tokens.join('')).toBe('ABB');
    expect(candidates[0]?.transform).toBe('none');
  });

  it('cycles the gap token one click at a time', () => {
    // 空格的第一次点击：有规律就落规律预测的字母（「照这样做」），没有就落循环表第一个。
    expect(nextFillToken(['A', 'B'], undefined, 'A')).toBe('A');
    expect(nextFillToken(['A', 'B'], undefined, 'B')).toBe('B');
    expect(nextFillToken(['A', 'B'], undefined, '')).toBe('A');
    // 已填过：每点一次换下一个，转一圈回到起点。
    expect(nextFillToken(['A', 'B'], 'A', 'A')).toBe('B');
    expect(nextFillToken(['A', 'B'], 'B', 'A')).toBe('A');
    expect(nextFillToken(['A', 'B', 'C'], 'C', 'A')).toBe('A');
    // 当前字母不在循环表里时退回第一个，不让点击变成死操作。
    expect(nextFillToken(['A', 'B'], 'Z', 'A')).toBe('A');
  });

  it('refuses submit without tool artifacts', async () => {
    const runtime = runtimeAt();
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect((result.verdict?.missingEvidence.length ?? 0)).toBeGreaterThan(0);
  });

  it('autoplays through the public action path and earns the transfer stamp', async () => {
    const runtime = runtimeAt();
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    // observe 检查点已随「观察带子」删掉：只剩「一键候选规律 + 补块」两道证据。
    expect(result.snapshot.checkpoints.observe).toBeUndefined();
    expect(result.snapshot.checkpoints.hypothesis).toBe(true);
    expect(result.snapshot.checkpoints.repair).toBe(true);
    expect(result.snapshot.stamps).toContain('transfer');
    expect(result.snapshot.verdict?.variantResults?.map((item) => item.id)).toEqual(
      K_TRANSFER.map((variant) => variant.id),
    );
  });

  it('accepts a repair-only artifact at base without a declared rule', () => {
    const verdict = validateArtifact(script, base, { repair: detail.solutions[0]?.artifact.repair });
    expect(verdict.passed).toBe(true);
    expect(verdict.failure).toBeUndefined();
    expect(verdict.artifacts.map((item) => item.kind)).toEqual(['repair-set']);
  });

  it('plays the gaps without declaring a rule and reports missing rule evidence', async () => {
    const runtime = runtimeAt();
    for (const item of (detail.solutions[0]?.artifact as { repair: { index: number; token: string }[] }).repair) {
      await runtime.dispatch({
        type: 'construct/place',
        payload: { piece: { id: 'repair-' + item.index, shape: item.token, x: item.index, y: 0 } },
      });
    }
    expect(runtime.snapshot().checkpoints.repair).toBe(true);
    expect(runtime.snapshot().checkpoints.hypothesis ?? false).toBe(false);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    // 补对了也得先声明一次规律（迁移门要求产物本身携带可翻译的规律）；这里必须给出缺证据。
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.map((item) => item.checkpointId)).toEqual(['hypothesis']);
  });

  it('rejects an empty artifact with a structural failure instead of an empty verdict', () => {
    const verdict = validateArtifact(script, base, {});
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('pattern-rule-invalid');
    expect(verdict.missingEvidence).toHaveLength(0);
  });

  it('actionsFor only returns public actions', () => {
    const actions = actionsFor(script, base, detail.solutions[0]?.artifact);
    expect(actions[0]?.type).toBe('pattern/setCycle');
    expect(actions.filter((action) => action.type === 'construct/place')).toHaveLength(3);
    expect(actions.some((action) => action.type === 'submit')).toBe(true);
    expect(actions.some((action) => action.type === 'pattern/inspect')).toBe(false);
    expect(actions.some((action) => action.type === 'run')).toBe(false);
  });

  it('actionsFor returns no actions for a missing artifact instead of throwing', () => {
    expect(actionsFor(script, base, undefined)).toEqual([]);
    expect(actionsFor(script, base, { repair: [] })).toEqual([]);
  });

  it('keeps run ids unique after the 10-run window fills up', async () => {
    const runtime = runtimeAt();
    await runtime.autoplay();
    const ids: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const result = await runtime.dispatch({ type: 'run', payload: {} });
      expect(result.ok).toBe(true);
      ids.push(runtime.snapshot().lastRun?.id ?? '');
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps an old snapshot tool usage untouched by later actions', async () => {
    const runtime = runtimeAt();
    const before = runtime.snapshot();
    expect(before.toolUsage.pattern.used).toBe(0);
    await runtime.dispatch({ type: 'pattern/inspect', payload: { index: 0 } });
    expect(runtime.snapshot().toolUsage.pattern.used).toBe(1);
    expect(before.toolUsage.pattern.used).toBe(0);
  });
});

describe('pattern 换表征迁移门', () => {
  it('reads the transfer gate from content variants and maps the whole strip', () => {
    expect(K_TRANSFER.map((variant) => variant.id)).toEqual(['v-relabel-shapes', 'v-relabel-colors']);
    expect(SYMMETRY_TRANSFER.map((variant) => variant.id)).toEqual(['v-relabel-shapes', 'v-relabel-colors']);
    expect(transferFailureClass(detail)).toBe('pattern-transfer-failed');

    const shapes = symbolsOf(K_TRANSFER[0] as PatternVariant);
    expect(shapes).toEqual({ A: 'round', B: 'square' });
    // 世界（带子）按映射改名，而不是被忽略。
    expect(toWorld(script, shapes).visible.slice(0, 3)).toEqual(['round', 'square', 'square']);
    expect(relabelVisible(['A', null, 'B'], shapes)).toEqual(['round', null, 'square']);
    // 产物里规律与补块一起翻译，玩家提交的仍是原始字母。
    const translated = relabelArtifact({
      patternRule: { tokens: ['A', 'B', 'B'], period: 3, transform: 'none' },
      repair: [{ index: 6, token: 'A' }, { index: 7, token: 'B' }],
    }, shapes) as { patternRule: { tokens: string[] }; repair: { token: string }[] };
    expect(translated.patternRule.tokens).toEqual(['round', 'square', 'square']);
    expect(translated.repair.map((item) => item.token)).toEqual(['round', 'square']);
  });

  it('keeps every golden solution[0] valid under both relabels (audit A6)', () => {
    for (const [level, levelScript] of [[detail, script], [symmetry, symmetryScript]] as const) {
      const variants = transferVariants(level);
      expect(variants.length).toBeGreaterThan(0);
      for (const variant of variants) {
        const verdict = validateArtifact(levelScript, variant as PatternVariant, level.solutions[0]?.artifact);
        expect(verdict.passed, level.id + ' ' + variant.id + ' ' + verdict.failure?.class).toBe(true);
        expect(verdict.stamps).toContain('transfer');
      }
    }
  });

  it('rejects the shell artifact at real submit with a user-facing failure class', async () => {
    const runtime = runtimeAt(symmetry);
    // 玩家只点画布补三格（没点候选规律）——母本判定是通过的。
    for (const [index, token] of [[3, 'C'], [4, 'B'], [5, 'A']] as const) {
      await runtime.dispatch({
        type: 'construct/place',
        payload: { piece: { id: 'tile-' + index, shape: token, x: index, y: 0 } },
      });
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('pattern-transfer-failed');
    expect(result.snapshot.phase).toBe('failed');
    // 反馈走内容 JSON 的 pattern-transfer-failed 文案，应当能指导玩家去模式卡声明规律。
    expect(symmetry.feedback['pattern-transfer-failed']?.messageKey).toBe('level.pattern.hypothesis');
    console.log('[relabel-shell-submit]', JSON.stringify({
      passed: result.verdict?.passed,
      class: result.verdict?.failure?.class,
      results: result.verdict?.variantResults,
    }));
  });

  it('fails the shell artifact that passes base: repair-only has no rule to relabel', () => {
    const shell = { repair: (symmetry.solutions[1]?.artifact as { repair: unknown }).repair };
    // 母本：只填不声明是通过的（这正是"空壳"的迷惑性）。
    const atBase = validateArtifact(symmetryScript, base, shell);
    expect(atBase.passed).toBe(true);
    // 换表征：没有可翻译的 patternRule，必须落 pattern-transfer-failed。
    const atRelabel = validateArtifact(symmetryScript, SYMMETRY_TRANSFER[0] as PatternVariant, shell);
    expect(atRelabel.passed).toBe(false);
    expect(atRelabel.failure?.class).toBe('pattern-transfer-failed');
    expect(atRelabel.failure?.variantId).toBe(SYMMETRY_TRANSFER[0]?.id);
    // 报告里的实际反例输出
    console.log('[relabel-shell]', JSON.stringify({
      atBase: { passed: atBase.passed },
      atRelabel: { passed: atRelabel.passed, class: atRelabel.failure?.class, variantId: atRelabel.failure?.variantId },
    }));
  });
});

describe('symmetry wall', () => {
  it('accepts both golden solutions (each carries a rule that transfers)', () => {
    for (const solution of symmetry.solutions) {
      const verdict = validateArtifact(symmetryScript, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.artifacts.map((item) => item.kind)).toContain('pattern-rule');
    }
  });

  it('keeps the two golden artifacts distinct for audit A3', () => {
    const artifacts = symmetry.solutions.map((solution) => JSON.stringify(solution.artifact));
    expect(new Set(artifacts).size).toBe(artifacts.length);
  });

  it('offers both readings of the wall as candidates', () => {
    const candidates = candidateRules(symmetryScript);
    expect(candidates.map((rule) => rule.tokens.join('') + ':' + rule.transform).sort()).toEqual([
      'ABC:none',
      'ABC:reflect',
    ]);
  });

  it('rejects an incomplete or impossible gap fill with a concrete failure class', () => {
    const incomplete = validateArtifact(symmetryScript, base, {
      repair: [{ index: 3, token: 'C' }, { index: 4, token: 'B' }],
    });
    expect(incomplete.passed).toBe(false);
    expect(incomplete.failure?.class).toBe('pattern-repair-incomplete');
    expect(incomplete.failure?.causes[0]?.ref).toBe('5');

    const impossible = validateArtifact(symmetryScript, base, {
      repair: [{ index: 3, token: 'A' }, { index: 4, token: 'C' }, { index: 5, token: 'A' }],
    });
    expect(impossible.passed).toBe(false);
    expect(impossible.failure?.class).toBe('pattern-mismatch');
  });

  it('autoplays the wall through the public action path with the transfer gate', async () => {
    const runtime = runtimeAt(symmetry);
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.checkpoints.fill).toBe(true);
    expect(result.snapshot.checkpoints.repair).toBe(true);
    // 只填不声明在母本是通过的，但迁移门会按 pattern-transfer-failed 拒绝；
    // 这里 autoplay 的黄金解带规律，所以能过门并拿到 transfer 印章。
    expect(symmetry.evidencePlan.map((item) => item.id)).toEqual(['fill', 'repair']);
    expect(result.snapshot.stamps).toContain('transfer');
  });
});

describe('画布点击序列（交互次数口径）', () => {
  function tokenOrderOf(level: typeof detail): string[] {
    const spec = level.tools.find((tool) => tool.kind === 'pattern');
    return spec && spec.kind === 'pattern' ? [...spec.config.tokens] : [];
  }

  /** 复刻 pattern/scene.ts 的一次画布点击：读当前块 → 算下一个字母 → construct/place。 */
  async function clickGap(runtime: ReturnType<typeof runtimeAt>, order: string[], index: number): Promise<void> {
    const snapshot = runtime.snapshot();
    const pattern = snapshot.toolState.pattern;
    const pieces = snapshot.toolState.construct?.pieces ?? [];
    const current = pieces.find((piece) => piece.x === index)?.shape;
    const rule: PatternRule | null = pattern?.cycle && pattern.cycle.length >= 2
      ? { tokens: [...pattern.cycle], period: pattern.cycle.length, transform: pattern.transform ?? 'none' }
      : null;
    const predicted = rule ? tokenAt(rule, index) : '';
    const token = nextFillToken(order, current, predicted);
    const result = await runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'tile-' + index, shape: token, x: index, y: 0 } },
    });
    expect(result.ok).toBe(true);
  }

  function shapeAt(runtime: ReturnType<typeof runtimeAt>, index: number): string | undefined {
    return runtime.snapshot().toolState.construct?.pieces.find((piece) => piece.x === index)?.shape;
  }

  /** 候选 chip 的一次点击 = setCycle + commit（PatternTool.pickRule 的内部动作）。 */
  async function pickCandidate(runtime: ReturnType<typeof runtimeAt>, rule: PatternRule): Promise<void> {
    await runtime.dispatch({
      type: 'pattern/setCycle',
      payload: { cycle: [...rule.tokens], transform: rule.transform },
    });
    await runtime.dispatch({ type: 'pattern/commit', payload: {} });
  }

  it('k-structure-pattern-path：1 次候选规律 + 3 次画布补格 + 1 次完成 = 5 击', async () => {
    const runtime = runtimeAt();
    const order = tokenOrderOf(detail);
    const candidate = candidateRules(script)[0];
    expect(candidate).toBeDefined();
    let clicks = 0;
    if (candidate) await pickCandidate(runtime, candidate);
    clicks += 1;
    for (const index of [6, 7, 8]) {
      await clickGap(runtime, order, index);
      clicks += 1;
    }
    expect([shapeAt(runtime, 6), shapeAt(runtime, 7), shapeAt(runtime, 8)]).toEqual(['A', 'B', 'B']);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    clicks += 1;
    expect(result.verdict?.passed).toBe(true);
    expect(clicks).toBe(5);
  });

  it('g13-structure-symmetry：1 次候选规律 + 3 次画布补格 + 1 次完成 = 5 击', async () => {
    const runtime = runtimeAt(symmetry);
    const order = tokenOrderOf(symmetry);
    const candidate = candidateRules(symmetryScript).find((rule) => rule.transform === 'reflect');
    expect(candidate).toBeDefined();
    let clicks = 0;
    if (candidate) await pickCandidate(runtime, candidate);
    clicks += 1;
    for (const index of [3, 4, 5]) {
      await clickGap(runtime, order, index);
      clicks += 1;
    }
    expect([shapeAt(runtime, 3), shapeAt(runtime, 4), shapeAt(runtime, 5)]).toEqual(['C', 'B', 'A']);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    clicks += 1;
    // 迁移门要求产物带规律；这条路径与 e2e 的「先点候选 chip」一致。
    expect(result.verdict?.passed).toBe(true);
    expect(result.verdict?.artifacts.map((item) => item.kind)).toEqual(['pattern-rule', 'repair-set']);
    expect(clicks).toBe(5);
  });
});

/**
 * answerComplete（docs/13）：只回答「答案填完了没有」，对错仍由 validate 决定。
 * pattern 的口径 = 规律已提交且所有缺口补齐；repair-only（只填不声明）不算填完，
 * 因为迁移门还缺可翻译的规律。
 */
describe('answerComplete（自动判题口径）', () => {
  async function commitCandidate(
    runtime: ReturnType<typeof runtimeAt>,
    levelScript: ReturnType<typeof parseScript>,
  ): Promise<void> {
    const candidate = candidateRules(levelScript)[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    await runtime.dispatch({
      type: 'pattern/setCycle',
      payload: { cycle: [...candidate.tokens], transform: candidate.transform },
    });
    await runtime.dispatch({ type: 'pattern/commit', payload: {} });
  }

  async function place(runtime: ReturnType<typeof runtimeAt>, index: number, shape: string): Promise<void> {
    const placed = await runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'repair-' + index, shape, x: index, y: 0 } },
    });
    expect(placed.ok).toBe(true);
  }

  it('k-structure-pattern-path：空 → 只声明规律 → 补一半 → 补满，逐步从 false 变 true', async () => {
    const runtime = runtimeAt();
    expect(runtime.snapshot().answerComplete).toBe(false);

    await commitCandidate(runtime, script);
    // 规律有了、缺口没补：还没填完，不能判。
    expect(runtime.snapshot().answerComplete).toBe(false);

    await place(runtime, 6, 'A');
    expect(runtime.snapshot().answerComplete).toBe(false);

    await place(runtime, 7, 'B');
    expect(runtime.snapshot().answerComplete).toBe(false);

    await place(runtime, 8, 'B');
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
  });

  it('k-structure-pattern-path：只补块不声明规律 → 一直是 false（空壳答案不算填完）', async () => {
    const runtime = runtimeAt();
    for (const [index, shape] of [[6, 'A'], [7, 'B'], [8, 'B']] as const) {
      await place(runtime, index, shape);
    }
    expect(runtime.snapshot().checkpoints.repair).toBe(true);
    expect(runtime.snapshot().answerComplete).toBe(false);
  });

  it('g13-structure-symmetry：先补满缺口再声明规律，声明完成的那一刻变 true', async () => {
    const runtime = runtimeAt(symmetry);
    expect(runtime.snapshot().answerComplete).toBe(false);
    // 按「重复」读法补 ABC（s-repeat-abc）；换镜像读法 CBA 时同样成立，只是这里取第一条候选。
    for (const [index, shape] of [[3, 'A'], [4, 'B'], [5, 'C']] as const) {
      await place(runtime, index, shape);
    }
    // 缺口补齐但还没声明规律：仍然不能自动判。
    expect(runtime.snapshot().answerComplete).toBe(false);
    await commitCandidate(runtime, symmetryScript);
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
  });

  it('answerComplete 不替 validate 判对错：补错了也是 true，submit 照样失败', async () => {
    const runtime = runtimeAt();
    await commitCandidate(runtime, script);
    await place(runtime, 6, 'A');
    await place(runtime, 7, 'A'); // 第 7 格按 ABB 该是 B，故意补错
    await place(runtime, 8, 'B');
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('pattern-mismatch');
  });

  it('autoplay 通关后 answerComplete 仍为 true（宿主据此走成功遮罩）', async () => {
    const runtime = runtimeAt();
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(runtime.snapshot().answerComplete).toBe(true);
  });
});
