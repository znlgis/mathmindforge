import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import { createArgueRuntime } from './runtime';
import { applyVariant, parseScript, validateArtifact } from './logic';
import type { RuntimeVariant } from '../shared/types';

const detail = LEVEL_DETAILS['g1012-structure-invariant'];
const base: RuntimeVariant = { id: 'base', axis: 'structure', patch: {} };

describe('argue template', () => {
  it('accepts coloring and parity certificates', () => {
    for (const solution of detail.solutions) {
      const verdict = validateArtifact(detail, base, solution.artifact);
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('rejects negative samples with declared classes', () => {
    for (const negative of detail.negativeSamples) {
      const verdict = validateArtifact(detail, base, negative.artifact);
      expect(verdict.passed).toBe(false);
      expect(verdict.failure?.class).toBe(negative.expectFailure);
    }
  });

  it('certificate survives rotated boards', () => {
    for (const variant of detail.variants) {
      applyVariant(detail, variant as RuntimeVariant);
      const verdict = validateArtifact(detail, variant as RuntimeVariant, detail.solutions[0].artifact);
      expect(verdict.passed, variant.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.stamps).toContain('transfer');
    }
  });

  it('refuses submit without tools', async () => {
    const runtime = createArgueRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect((result.verdict?.missingEvidence.length ?? 0)).toBeGreaterThan(0);
  });

  it('autoplays through the public action path', async () => {
    const runtime = createArgueRuntime(detail, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.checkpoints.attempt).toBe(true);
    expect(result.snapshot.checkpoints.counts).toBe(true);
    expect(result.snapshot.argument?.committed).toBe(true);
  });

  it('computes board counts from script', () => {
    const script = parseScript(detail.levelScript);
    expect(script.board.width).toBe(5);
  });

  it('reads the allowed claim / warrant / scope from the level script', () => {
    const script = parseScript(detail.levelScript);
    const golden = detail.solutions[0].artifact as {
      counts: unknown;
      argument: Record<string, unknown>;
    };
    const artifact = {
      counts: golden.counts,
      argument: { ...golden.argument, scope: 'some-other-scope' },
    };
    // 关卡没有声明这个范围：不能被当成合法证书。
    const wrongScope = validateArtifact({ ...script, scopes: ['domino-tiling'] }, base, artifact);
    expect(wrongScope.passed).toBe(false);
    expect(wrongScope.failure?.class).toBe('argue-scope-wrong');

    const wrongWarrant = validateArtifact(
      { ...script, warrants: ['coloring'] },
      base,
      { counts: golden.counts, argument: { ...golden.argument, warrant: 'parity' } },
    );
    expect(wrongWarrant.passed).toBe(false);
    expect(wrongWarrant.failure?.class).toBe('argue-warrant-unsupported');

    const wrongClaim = validateArtifact(
      { ...script, claims: ['impossible'] },
      base,
      { counts: golden.counts, argument: { ...golden.argument, claim: 'possible' } },
    );
    expect(wrongClaim.passed).toBe(false);
    expect(wrongClaim.failure?.class).toBe('argue-claim-unsupported');
  });
});
