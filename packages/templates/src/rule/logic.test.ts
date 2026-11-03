import { describe, expect, it } from 'vitest';
import type { LevelDetail, ProgramBlock } from '@mmf/game-kit';
import detailJson from '../../../content/src/details/g13-algorithm-route.level.json';
import trainJson from '../../../content/src/details/k-algorithm-train.level.json';
import { executeProgram } from './engine';
import {
  BASE_VARIANT, FAILURE_CLASSES, actionsFor, applyVariant, countBlocks, parseScript,
  reachableFailureClasses, ruleVerifier, validateArtifact,
} from './logic';
import type { RuleVariant } from './logic';
import { createRuleAdapter, createRuleRuntime } from './runtime';
import type { RuleScript } from './schema';

const detail = detailJson as unknown as LevelDetail;
const script: RuleScript = parseScript(detail.levelScript);
const PROGRAM_SOLUTIONS = detail.solutions.map((solution) => ({
  id: solution.id,
  program: (solution.artifact as { program: ProgramBlock[] }).program,
}));
const UNROLLED = PROGRAM_SOLUTIONS[0]?.program ?? [];
const REPEAT = PROGRAM_SOLUTIONS[1]?.program ?? [];

function runtimeAt(seed = 101) {
  return createRuleRuntime(detail, {
    seed,
    now: () => 1_700_000_000_000,
    locale: 'zh-CN',
    reducedMotion: true,
  });
}

const ROTATIONS: RuleVariant[] = [
  { id: 'v-rotate-90', axis: 'transfer', patch: { rotate: 90 } },
  { id: 'v-rotate-180', axis: 'transfer', patch: { rotate: 180 } },
];

describe('rule script', () => {
  it('reads the 5×5 route from the level script', () => {
    expect(script.grid.width).toBe(5);
    expect(script.grid.height).toBe(5);
    expect(script.grid.start).toEqual({ x: 0, y: 0, dir: 'east' });
    expect(script.grid.goal).toEqual({ x: 0, y: 4 });
    expect(script.walls).toHaveLength(8);
    expect(script.stars).toHaveLength(3);
    expect(script.maxBlocks).toBe(20);
    expect(script.maxSteps).toBe(120);
  });
});

describe('rule golden solutions', () => {
  it('keeps the unrolled route at 17 blocks and walks it in 17 steps', () => {
    expect(UNROLLED).toHaveLength(17);
    expect(countBlocks(UNROLLED)).toBe(17);
    const trace = executeProgram(script, UNROLLED);
    expect(trace.steps).toBe(17);
    expect(trace.reachedGoal).toBe(true);
    expect(trace.failureClass).toBeUndefined();
    expect(trace.collected).toEqual([{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 4 }]);
    expect(trace.end).toEqual({ x: 0, y: 4, dir: 'west' });
    expect(trace.path).toContainEqual({ x: 4, y: 4 });
    expect(validateArtifact(script, BASE_VARIANT, { program: UNROLLED }).passed).toBe(true);
  });

  it('folds the same route into a 12-block repeat version', () => {
    expect(REPEAT).toHaveLength(12);
    expect(countBlocks(REPEAT)).toBe(18);
    expect(REPEAT.every((block) => block.op !== 'repeat' || block.n === 2)).toBe(true);
    const trace = executeProgram(script, REPEAT);
    expect(trace.reachedGoal).toBe(true);
    expect(trace.steps).toBe(17);
    expect(trace.collected).toHaveLength(3);
    expect(validateArtifact(script, BASE_VARIANT, { program: REPEAT }).passed).toBe(true);
  });

  it('accepts both golden solutions', () => {
    for (const solution of PROGRAM_SOLUTIONS) {
      const verdict = validateArtifact(detail, BASE_VARIANT, { program: solution.program });
      expect(verdict.passed, solution.id + ' ' + verdict.failure?.class).toBe(true);
      expect(verdict.missingEvidence).toHaveLength(0);
      expect(verdict.metrics?.steps).toBe(17);
    }
  });

  it('keeps both golden solutions valid after rotate 90 / 180', () => {
    for (const variant of ROTATIONS) {
      const rotated = applyVariant(detail, variant);
      const turn = Number(variant.patch.rotate) / 90;
      // 逆时针顺序：east → north → west → south
      const expected = { dir: ['east', 'north', 'west', 'south'][turn % 4] };
      expect(rotated.grid.start.dir, variant.id).toBe(expected.dir);
      expect(rotated.grid.goal).toEqual(
        turn === 1 ? { x: 4 - script.grid.goal.y, y: script.grid.goal.x }
          : { x: 4 - script.grid.goal.x, y: 4 - script.grid.goal.y },
      );
      for (const solution of PROGRAM_SOLUTIONS) {
        const verdict = validateArtifact(detail, variant, { program: solution.program });
        expect(verdict.passed, variant.id + ' ' + solution.id + ' ' + verdict.failure?.class).toBe(true);
        expect(verdict.stamps).toContain('transfer');
      }
    }
  });

  it('accepts the script form of validateArtifact too', () => {
    expect(validateArtifact(script, BASE_VARIANT, { program: REPEAT }).passed).toBe(true);
  });
});

describe('rule negative samples', () => {
  it('rejects the wall, the spin and the missed star with declared classes', () => {
    expect(detail.negativeSamples).toHaveLength(3);
    for (const negative of detail.negativeSamples) {
      const verdict = validateArtifact(detail, BASE_VARIANT, negative.artifact);
      expect(verdict.passed, negative.id).toBe(false);
      expect(verdict.failure?.class, negative.id).toBe(negative.expectFailure);
    }
  });

  it('reports the wall step and the missing star', () => {
    const wall = detail.negativeSamples.find((sample) => sample.expectFailure === 'rule-wall');
    const missed = detail.negativeSamples.find((sample) => sample.expectFailure === 'rule-missed-item');
    expect(wall).toBeDefined();
    expect(missed).toBeDefined();
    if (wall) {
      const verdict = validateArtifact(detail, BASE_VARIANT, wall.artifact);
      expect(verdict.failure?.causes[0]?.ref).toBe('5');
    }
    if (missed) {
      const verdict = validateArtifact(detail, BASE_VARIANT, missed.artifact);
      expect(verdict.failure?.causes[0]?.ref).toBe('2,0');
    }
  });

  it('treats an empty program as rule-empty', () => {
    const verdict = validateArtifact(detail, BASE_VARIANT, { program: [] });
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('rule-empty');
  });

  it('lists every failure class as reachable, including rule-not-general', () => {
    expect(reachableFailureClasses(detail)).toEqual([...FAILURE_CLASSES]);
    expect(reachableFailureClasses(script)).toContain('rule-not-general');
  });
});

describe('rule runtime', () => {
  it('refuses submit before any tool action', async () => {
    const runtime = runtimeAt();
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.missingEvidence.map((item) => item.checkpointId)).toEqual(['build', 'run']);
  });

  it('hands out the program as the artifact as soon as it exists', async () => {
    const runtime = runtimeAt();
    expect(runtime.snapshot().artifacts).toHaveLength(0);
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'x1', op: 'forward' }, at: 0 } });
    // 「提交程序」按钮已删：程序拼好就是答案，产物不再等 committed。
    expect(runtime.snapshot().artifacts.map((item) => item.kind)).toEqual(['program']);
    expect(runtime.snapshot().checkpoints.build).toBe(true);
    expect(runtime.snapshot().checkpoints.run).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.ok).toBe(true);
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('rule-missed-item');
  });

  it('passes submit on a built golden program without a commit button', async () => {
    const runtime = runtimeAt();
    for (const [index, block] of UNROLLED.entries()) {
      await runtime.dispatch({ type: 'rule/place', payload: { block, at: index } });
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.stamps).toContain('transfer');
  });

  it('places, moves, removes and commits program blocks', async () => {
    const runtime = runtimeAt();
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'a', op: 'forward' }, at: 0 } });
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'b', op: 'collect' }, at: 1 } });
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'c', op: 'left' }, at: 2 } });
    await runtime.dispatch({ type: 'rule/move', payload: { id: 'c', at: 0 } });
    expect(runtime.snapshot().toolState.rule?.program.map((block) => block.id)).toEqual(['c', 'a', 'b']);
    await runtime.dispatch({ type: 'rule/remove', payload: { id: 'c' } });
    expect(runtime.snapshot().toolState.rule?.program.map((block) => block.id)).toEqual(['a', 'b']);
    expect(runtime.snapshot().checkpoints.build).toBe(true);
    expect(runtime.snapshot().checkpoints.run).toBe(true);
    const committed = await runtime.dispatch({ type: 'rule/commit', payload: {} });
    expect(committed.ok).toBe(true);
    expect(runtime.snapshot().toolState.rule?.lastTrace?.steps).toBe(2);
  });

  it('stops adding blocks at maxBlocks', async () => {
    const runtime = runtimeAt();
    let rejected = false;
    for (let index = 0; index < 11; index += 1) {
      const result = await runtime.dispatch({
        type: 'rule/place',
        payload: {
          block: { id: 'r' + index, op: 'repeat', n: 2, children: [{ id: 'r' + index + 'c', op: 'forward' }] },
          at: index,
        },
      });
      if (!result.ok) rejected = true;
    }
    expect(rejected).toBe(true);
    expect(countBlocks(runtime.snapshot().toolState.rule?.program ?? [])).toBeLessThanOrEqual(script.maxBlocks);
  });

  it('autoplays the first golden solution through public actions', async () => {
    const runtime = runtimeAt();
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(result.snapshot.checkpoints.build).toBe(true);
    expect(result.snapshot.checkpoints.run).toBe(true);
    expect(result.snapshot.stamps).toContain('transfer');
    expect(result.snapshot.artifacts.map((item) => item.kind)).toEqual(['program']);
  });

  it('declares rotate 90 / 180 as the transfer gate and rule-not-general as its failure class', () => {
    const adapter = createRuleAdapter(detail);
    const variants = adapter.transferVariants?.(detail) ?? [];
    expect(variants.map((variant) => variant.id)).toEqual(['v-rotate-90', 'v-rotate-180']);
    expect(variants.map((variant) => variant.patch.rotate)).toEqual([90, 180]);
    expect(adapter.transferFailureClass?.(detail)).toBe('rule-not-general');
  });

  it('turns a non-rigid patch into a real structural failure', () => {
    // rotate 是刚体变换，程序不可能"只在母本成立"；这里用平移补丁验证 patch 与失败读数确实生效。
    const shifted: RuleVariant = { id: 'v-shifted', axis: 'transfer', patch: { grid: { start: { x: 2, y: 2 } } } };
    const variantVerdict = validateArtifact(detail, shifted, { program: UNROLLED });
    expect(variantVerdict.passed).toBe(false);
    expect(variantVerdict.failure?.variantId).toBe('v-shifted');
    expect(FAILURE_CLASSES).toContain(variantVerdict.failure?.class);
  });
});

describe('rule verifier', () => {
  it('exposes the transfer gate metadata that audit:levels relies on', () => {
    const variants = ruleVerifier.transferVariants?.(detail) ?? [];
    expect(variants.map((variant) => variant.id)).toEqual(['v-rotate-90', 'v-rotate-180']);
    for (const variant of variants) {
      const verdict = ruleVerifier.validateArtifact(detail, variant, detail.solutions[0]?.artifact);
      expect(verdict.passed, variant.id + ' ' + verdict.failure?.class).toBe(true);
    }
    expect(ruleVerifier.transferFailureClass?.(detail)).toBe('rule-not-general');
  });

  it('rejects an empty artifact as rule-empty instead of missing evidence', () => {
    const verdict = ruleVerifier.validateArtifact(detail, BASE_VARIANT, {});
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('rule-empty');
    expect(verdict.missingEvidence).toHaveLength(0);
  });

  it('is wired for build-time audits', () => {
    expect(ruleVerifier.parseScript(detail.levelScript).grid.width).toBe(5);
    expect(ruleVerifier.reachableFailureClasses(detail)).toHaveLength(5);
    expect(ruleVerifier.applyVariant(detail, ROTATIONS[0] as RuleVariant).grid.start).toEqual({ x: 4, y: 0, dir: 'north' });
    const actions = ruleVerifier.actionsFor(detail, BASE_VARIANT, { program: REPEAT });
    expect(actions[0]?.type).toBe('rule/place');
    expect(actions.filter((action) => action.type === 'rule/place')).toHaveLength(12);
    expect(actions[actions.length - 1]?.type).toBe('submit');
    // 宿主不再有独立「试一下」：动作表里也不该再出现 run（docs/12 T0-3 / T1-rule）。
    expect(actions.some((action) => action.type === 'run')).toBe(false);
  });

  it('replays the same actions as the pure helper', () => {
    const a = actionsFor(detail, BASE_VARIANT, { program: UNROLLED });
    const b = ruleVerifier.actionsFor(detail, BASE_VARIANT, { program: UNROLLED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('shared runtime bookkeeping', () => {
  it('keeps run ids unique after the 10-run window fills up', async () => {
    const runtime = runtimeAt();
    await runtime.autoplay();
    const ids: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const result = await runtime.dispatch({ type: 'run', payload: {} });
      expect(result.ok).toBe(true);
      ids.push(runtime.snapshot().lastRun?.id ?? '');
    }
    // runs 只留最近 10 条；id 若按数组长度生成，第 11 次起会重复成 run-11。
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps an old snapshot tool usage untouched by later actions', async () => {
    const runtime = runtimeAt();
    const before = runtime.snapshot();
    expect(before.toolUsage.rule.used).toBe(0);
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'a', op: 'forward' }, at: 0 } });
    expect(runtime.snapshot().toolUsage.rule.used).toBe(1);
    // 快照语义是浅拷贝：拿到的用量不能被后续动作改写。
    expect(before.toolUsage.rule.used).toBe(0);
  });
});
describe('交互次数口径（拼程序 + 完成）', () => {
  function runtimeOf(source: LevelDetail) {
    return createRuleRuntime(source, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
  }

  it('k-algorithm-train：5 块展开解 + 完成 = 6 击', async () => {
    const train = trainJson as unknown as LevelDetail;
    const runtime = runtimeOf(train);
    const program = (train.solutions[0]?.artifact as { program: ProgramBlock[] }).program;
    for (const [index, block] of program.entries()) {
      const placed = await runtime.dispatch({ type: 'rule/place', payload: { block, at: index } });
      expect(placed.ok).toBe(true);
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
    // 玩家侧只有「放积木」和宿主「完成」两类输入：没有提交程序按钮、没有试一下。
    expect(program.length + 1).toBe(6);
  });

  it('g13-algorithm-route：12 块重复解 + 完成 = 13 击（保守目标）', async () => {
    const runtime = runtimeOf(detail);
    const program = REPEAT;
    for (const [index, block] of program.entries()) {
      const placed = await runtime.dispatch({ type: 'rule/place', payload: { block, at: index } });
      expect(placed.ok).toBe(true);
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
    expect(program.length + 1).toBe(13);
  });
});
