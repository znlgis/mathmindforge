import { describe, expect, it } from 'vitest';
import { LEVEL_DETAILS } from '@mmf/content/full';
import type { ShippedLevelId } from '@mmf/content/full';
import { createArgueRuntime } from './runtime';
import { actionsFor, applyVariant, parseScript, transferVariants, validateArtifact } from './logic';
import { boardCounts, rotationFlipsColoring, warrantDecides } from './engine';
import type { RuntimeVariant } from '../shared/types';

const ARGUE_LEVELS: ShippedLevelId[] = ['g1012-structure-invariant', 'g46-data-invariant', 'g46-structure-tiling'];
const detail = LEVEL_DETAILS['g1012-structure-invariant'];
const tiling = LEVEL_DETAILS['g46-structure-tiling'];
const base: RuntimeVariant = { id: 'base', axis: 'structure', patch: {} };

function runtimeFor(id: ShippedLevelId) {
  return createArgueRuntime(LEVEL_DETAILS[id], {
    seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
  });
}

describe('argue template', () => {
  it('accepts every declared solution', () => {
    for (const id of ARGUE_LEVELS) {
      for (const solution of LEVEL_DETAILS[id].solutions) {
        const verdict = validateArtifact(LEVEL_DETAILS[id], base, solution.artifact);
        expect(verdict.passed, id + ' ' + solution.id + ' ' + verdict.failure?.class).toBe(true);
      }
    }
  });

  it('rejects negative samples with declared classes', () => {
    for (const id of ARGUE_LEVELS) {
      for (const negative of LEVEL_DETAILS[id].negativeSamples) {
        const verdict = validateArtifact(LEVEL_DETAILS[id], base, negative.artifact);
        expect(verdict.passed, id + ' ' + negative.id).toBe(false);
        expect(verdict.failure?.class, id + ' ' + negative.id).toBe(negative.expectFailure);
      }
    }
  });

  it('certificate survives the transfer gate', () => {
    for (const id of ARGUE_LEVELS) {
      for (const variant of transferVariants(LEVEL_DETAILS[id])) {
        const verdict = validateArtifact(LEVEL_DETAILS[id], variant, LEVEL_DETAILS[id].solutions[0].artifact);
        expect(verdict.passed, id + ' ' + variant.id + ' ' + verdict.failure?.class).toBe(true);
        expect(verdict.stamps).toContain('transfer');
      }
    }
  });

  it('refuses submit without tools', async () => {
    const runtime = runtimeFor('g1012-structure-invariant');
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect((result.verdict?.missingEvidence.length ?? 0)).toBeGreaterThan(0);
  });

  it('autoplays through the public action path on all three levels', async () => {
    for (const id of ARGUE_LEVELS) {
      const runtime = runtimeFor(id);
      const result = await runtime.autoplay();
      expect(result.verdict?.passed, id + ' ' + (result.verdict?.failure?.class ?? 'missing')).toBe(true);
      const snapshot = result.snapshot;
      expect(snapshot.checkpoints.counts, id).toBe(true);
      expect(snapshot.checkpoints.warrant, id).toBe(true);
      expect(snapshot.checkpoints.commit, id).toBe(true);
      expect(snapshot.argument?.committed, id).toBe(true);
      expect(snapshot.argument?.claim, id).toBe('impossible');
      expect(snapshot.argument?.scope, id).toBe('domino-tiling');
    }
  });

  it('assembles the whole argument from one warrant pick', async () => {
    const runtime = runtimeFor('g1012-structure-invariant');
    await runtime.dispatch({ type: 'probe/sample', payload: {} });
    const picked = await runtime.dispatch({ type: 'argue/setWarrant', payload: { warrant: 'coloring' } });
    expect(picked.ok).toBe(true);
    const snapshot = picked.snapshot;
    // 主张与范围由依据推出来，不再有下拉让玩家抄一遍。
    expect(snapshot.argument).toMatchObject({
      claim: 'impossible',
      warrant: 'coloring',
      scope: 'domino-tiling',
      evidence: { black: 11, white: 12, cells: 23 },
      committed: true,
    });
    expect(snapshot.checkpoints).toMatchObject({ counts: true, warrant: true, commit: true });
    const verdict = validateArtifact(detail, base, {
      counts: snapshot.toolState.probe?.dataset?.counts,
      argument: snapshot.argument,
    });
    expect(verdict.passed, verdict.failure?.class).toBe(true);
  });

  it('re-attaches evidence when the warrant changes (no ordering trap)', async () => {
    const runtime = runtimeFor('g1012-structure-invariant');
    await runtime.dispatch({ type: 'argue/setWarrant', payload: { warrant: 'parity' } });
    const second = await runtime.dispatch({ type: 'argue/setWarrant', payload: { warrant: 'coloring' } });
    expect(second.ok).toBe(true);
    // 先挂奇偶证据、再换染色，旧实现会把证据留在 {cells} 上，判定报「染色证据没挂上」。
    expect(second.snapshot.argument?.evidence).toEqual({ black: 11, white: 12, cells: 23 });
    const verdict = validateArtifact(detail, base, {
      counts: second.snapshot.toolState.probe?.dataset?.counts,
      argument: second.snapshot.argument,
    });
    expect(verdict.passed, verdict.failure?.class).toBe(true);
  });

  it('treats area as a real warrant on odd-cell boards', () => {
    for (const id of ['g1012-structure-invariant', 'g46-data-invariant'] as const) {
      const script = parseScript(LEVEL_DETAILS[id].levelScript);
      const counts = boardCounts(script);
      expect(counts.cells % 2, id).toBe(1);
      expect(warrantDecides('area', counts), id).toBe(true);
      const verdict = validateArtifact(LEVEL_DETAILS[id], base, {
        counts,
        argument: {
          claim: 'impossible', warrant: 'area', scope: 'domino-tiling', evidence: { cells: counts.cells },
        },
      });
      expect(verdict.passed, id + ' ' + verdict.failure?.class).toBe(true);
    }
  });

  it('makes the warrant choice matter on the 8×8 board', () => {
    const script = parseScript(tiling.levelScript);
    const counts = boardCounts(script);
    // 8×8 去掉两个同色角：62 格、黑 30 / 白 32。
    expect(counts).toEqual({ black: 30, white: 32, cells: 62 });
    // 染色能排除（黑白不等），奇偶与面积排除不了（总格是偶数）——「依据」第一次是真选择。
    expect(warrantDecides('coloring', counts)).toBe(true);
    expect(warrantDecides('parity', counts)).toBe(false);
    expect(warrantDecides('area', counts)).toBe(false);
    for (const warrant of ['parity', 'area']) {
      const verdict = validateArtifact(tiling, base, {
        counts,
        argument: {
          claim: 'impossible', warrant, scope: 'domino-tiling', evidence: { cells: counts.cells },
        },
      });
      expect(verdict.passed, warrant).toBe(false);
      expect(verdict.failure?.class).toBe('argue-invariant-false');
    }
  });

  it('drops the parity-flipping rotation from the transfer gate', () => {
    const eight = parseScript(tiling.levelScript);
    // 偶数边棋盘转 90° 会把棋盘染色整体翻转：黑白计数互换。
    expect(rotationFlipsColoring(eight, 1)).toBe(true);
    const rotated = applyVariant(eight, { id: 'v-rotate-90', axis: 'structure', patch: { rotate: 90 } });
    expect(boardCounts(rotated)).toEqual({ black: 32, white: 30, cells: 62 });
    // 所以 8×8 的迁移门只收 180°；奇数边棋盘照旧保留 90° + 180°。
    expect(transferVariants(tiling).map((variant) => variant.id)).toEqual(['v-rotate-180']);
    expect(transferVariants(detail).map((variant) => variant.id)).toEqual(['v-rotate-90', 'v-rotate-180']);
  });

  it('keeps the probe sample size aligned with the board cell count', () => {
    for (const id of ARGUE_LEVELS) {
      const levelDetail = LEVEL_DETAILS[id];
      const cells = boardCounts(parseScript(levelDetail.levelScript)).cells;
      const probe = levelDetail.tools.find((tool) => tool.kind === 'probe');
      expect(probe?.kind, id).toBe('probe');
      if (probe?.kind !== 'probe') continue;
      expect(probe.config.sampleSizes, id).toEqual([cells]);
    }
  });

  it('commits idempotently and stops offering claim / scope actions', async () => {
    const runtime = runtimeFor('g46-data-invariant');
    await runtime.dispatch({ type: 'argue/setWarrant', payload: { warrant: 'coloring' } });
    const first = await runtime.dispatch({ type: 'argue/commit', payload: {} });
    const second = await runtime.dispatch({ type: 'argue/commit', payload: {} });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // 主张与范围已是派生量：旧的两个下拉动作不再属于这一关。
    expect((await runtime.dispatch({ type: 'argue/setClaim', payload: { claim: 'impossible' } })).ok).toBe(false);
    expect((await runtime.dispatch({ type: 'argue/setScope', payload: { scope: 'domino-tiling' } })).ok).toBe(false);
  });

  it('throws away the attempt ritual from the evidence plan', () => {
    for (const id of ARGUE_LEVELS) {
      const ids = LEVEL_DETAILS[id].evidencePlan.map((item) => item.id);
      expect(ids, id).toEqual(['counts', 'warrant', 'commit']);
    }
  });

  it('runs the golden action sequence through the runtime', async () => {
    const runtime = runtimeFor(tiling.id);
    const actions = actionsFor(tiling, base, tiling.solutions[0].artifact);
    expect(actions.filter((action) => action.type !== 'submit').length).toBeGreaterThanOrEqual(2);
    let last = await runtime.dispatch(actions[0]);
    for (const action of actions.slice(1)) last = await runtime.dispatch(action);
    expect(last.verdict?.passed, last.verdict?.failure?.class).toBe(true);
  });

  it('computes board counts from script', () => {
    const script = parseScript(detail.levelScript);
    expect(script.board.width).toBe(5);
    expect(boardCounts(script)).toEqual({ black: 11, white: 12, cells: 23 });
  });
});
