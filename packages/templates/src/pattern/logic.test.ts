import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import { createPatternRuntime } from './runtime';
import { actionsFor, applyVariant, parseScript, validateArtifact } from './logic';
import type { PatternVariant } from './logic';

const detail = LEVEL_DETAILS['k-structure-pattern-path'];
const script = parseScript(detail.levelScript);
const base: PatternVariant = { id: 'base', axis: 'structure', patch: {} };

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

  it('refuses submit without tool artifacts', async () => {
    const runtime = createPatternRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect((result.verdict?.missingEvidence.length ?? 0)).toBeGreaterThan(0);
  });

  it('autoplays through the public action path', async () => {
    const runtime = createPatternRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.checkpoints.observe).toBe(true);
    expect(result.snapshot.checkpoints.hypothesis).toBe(true);
    expect(result.snapshot.checkpoints.repair).toBe(true);
  });

  it('actionsFor only returns public actions', () => {
    const actions = actionsFor(script, base, detail.solutions[0]?.artifact);
    expect(actions[0]?.type).toBe('pattern/inspect');
    expect(actions.some((a) => a.type === 'submit')).toBe(true);
  });

  it('actionsFor returns no actions for a missing artifact instead of throwing', () => {
    expect(actionsFor(script, base, undefined)).toEqual([]);
    expect(actionsFor(script, base, { repair: [] })).toEqual([]);
  });

  it('keeps run ids unique after the 10-run window fills up', async () => {
    const runtime = createPatternRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
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
    const runtime = createPatternRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const before = runtime.snapshot();
    expect(before.toolUsage.pattern.used).toBe(0);
    await runtime.dispatch({ type: 'pattern/inspect', payload: { index: 0 } });
    expect(runtime.snapshot().toolUsage.pattern.used).toBe(1);
    expect(before.toolUsage.pattern.used).toBe(0);
  });
});
