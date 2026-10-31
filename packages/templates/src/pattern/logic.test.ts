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
});
