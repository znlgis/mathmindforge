import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import type { RuntimeOptions } from '@mmf/game-kit';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { tokenAt } from '@mmf/toolkit/pattern';
import { createPatternRuntime } from './runtime';
import {
  actionsFor, applyVariant, candidateRules, nextFillToken, parseScript, validateArtifact,
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

  it('autoplays through the public action path', async () => {
    const runtime = runtimeAt();
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    // observe 检查点已随「观察带子」删掉：只剩「一键候选规律 + 补块」两道证据。
    expect(result.snapshot.checkpoints.observe).toBeUndefined();
    expect(result.snapshot.checkpoints.hypothesis).toBe(true);
    expect(result.snapshot.checkpoints.repair).toBe(true);
  });

  it('accepts a repair-only artifact without a declared rule', () => {
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
    // 补对了也得先声明一次规律（本关要靠"候选规律"做第二产物）；这里必须给出缺证据而不是空判定。
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

describe('symmetry wall (fill only)', () => {
  it('accepts both gap fills without a declared rule', () => {
    for (const solution of symmetry.solutions) {
      const verdict = validateArtifact(symmetryScript, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.artifacts.map((item) => item.kind)).toEqual(['repair-set']);
    }
  });

  it('keeps the two golden repairs distinct for audit A3', () => {
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

  it('autoplays the wall through the public action path', async () => {
    const runtime = runtimeAt(symmetry);
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.checkpoints.fill).toBe(true);
    expect(result.snapshot.checkpoints.repair).toBe(true);
    // g13 的证据计划不含 hypothesis：只填不声明也能走完。
    expect(symmetry.evidencePlan.map((item) => item.id)).toEqual(['fill', 'repair']);
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

  it('k-structure-pattern-path：1 次候选规律 + 3 次画布补格 + 1 次完成 = 5 击', async () => {
    const runtime = runtimeAt();
    const order = tokenOrderOf(detail);
    const candidate = candidateRules(script)[0];
    expect(candidate).toBeDefined();
    let clicks = 0;
    // 候选 chip：一个点击同时发 setCycle + commit（PatternTool.pickRule 的内部动作）
    await runtime.dispatch({
      type: 'pattern/setCycle',
      payload: { cycle: [...(candidate?.tokens ?? [])], transform: candidate?.transform ?? 'none' },
    });
    await runtime.dispatch({ type: 'pattern/commit', payload: {} });
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

  it('g13-structure-symmetry：只点 3 个缺口（3+2+1 次）再完成 = 7 击', async () => {
    const runtime = runtimeAt(symmetry);
    const order = tokenOrderOf(symmetry);
    const expected = new Map<number, string>([[3, 'C'], [4, 'B'], [5, 'A']]);
    let clicks = 0;
    for (const [index, token] of expected) {
      let guard = 0;
      while (shapeAt(runtime, index) !== token) {
        await clickGap(runtime, order, index);
        clicks += 1;
        guard += 1;
        expect(guard).toBeLessThanOrEqual(order.length);
      }
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    clicks += 1;
    // 只填不声明：产物只有 repair-set，同样通过。
    expect(result.verdict?.passed).toBe(true);
    expect(result.verdict?.artifacts.map((item) => item.kind)).toEqual(['repair-set']);
    expect(clicks).toBe(7);
  });
});
