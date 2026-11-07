import { describe, expect, it } from 'vitest';
import type { LevelDetail, ProgramBlock } from '@mmf/game-kit';
import detailJson from '../../../content/src/details/g13-algorithm-route.level.json';
import trainJson from '../../../content/src/details/k-algorithm-train.level.json';
import { executeProgram } from './engine';
import {
  BASE_VARIANT, FAILURE_CLASSES, actionsFor, applyVariant, countBlocks, parseScript, planRouteClick,
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

  it('still executes both golden solutions correctly on a rotated map (executor property, not a gate)', () => {
    // 旋转门已删：旋转是刚体变换，程序按相对方向执行，母本通过必然旋转通过。
    // 这里只验证执行器本身对旋转地图的兼容性，不再把它当迁移证据。
    for (const variant of ROTATIONS) {
      const rotated = applyVariant(detail, variant);
      const turn = Number(variant.patch.rotate) / 90;
      const expected = { dir: ['east', 'north', 'west', 'south'][turn % 4] };
      expect(rotated.grid.start.dir, variant.id).toBe(expected.dir);
      expect(rotated.grid.goal).toEqual(
        turn === 1 ? { x: 4 - script.grid.goal.y, y: script.grid.goal.x }
          : { x: 4 - script.grid.goal.x, y: 4 - script.grid.goal.y },
      );
      for (const solution of PROGRAM_SOLUTIONS) {
        const verdict = validateArtifact(detail, variant, { program: solution.program });
        expect(verdict.passed, variant.id + ' ' + solution.id + ' ' + verdict.failure?.class).toBe(true);
        expect(verdict.stamps).not.toContain('transfer');
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

  it('lists every reachable failure class and retires rule-not-general', () => {
    expect(reachableFailureClasses(detail)).toEqual([...FAILURE_CLASSES]);
    expect(FAILURE_CLASSES).not.toContain('rule-not-general');
    expect(reachableFailureClasses(script)).not.toContain('rule-not-general');
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
    // 没有迁移门就不再自动发 transfer 印章。
    expect(result.snapshot.stamps).not.toContain('transfer');
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
    expect(result.snapshot.stamps).not.toContain('transfer');
    expect(result.snapshot.artifacts.map((item) => item.kind)).toEqual(['program']);
  });

  it('exposes no transfer gate: the rotation gate was provably tautological', () => {
    const adapter = createRuleAdapter(detail) as unknown as Record<string, unknown>;
    expect(adapter.transferVariants).toBeUndefined();
    expect(adapter.transferFailureClass).toBeUndefined();
  });

  it('turns a non-rigid patch into a real structural failure', () => {
    // 这不是迁移门，只是证明 applyVariant 的补丁真的会改变判定读数（旋转则不会）。
    const shifted: RuleVariant = { id: 'v-shifted', axis: 'transfer', patch: { grid: { start: { x: 2, y: 2 } } } };
    const variantVerdict = validateArtifact(detail, shifted, { program: UNROLLED });
    expect(variantVerdict.passed).toBe(false);
    expect(variantVerdict.failure?.variantId).toBe('v-shifted');
    expect(FAILURE_CLASSES).toContain(variantVerdict.failure?.class);
  });
});

describe('rule verifier', () => {
  it('declares no transfer gate to audit:levels (fake gate removed)', () => {
    const verifier = ruleVerifier as unknown as Record<string, unknown>;
    expect(verifier.transferVariants).toBeUndefined();
    expect(verifier.transferFailureClass).toBeUndefined();
  });

  it('rejects an empty artifact as rule-empty instead of missing evidence', () => {
    const verdict = ruleVerifier.validateArtifact(detail, BASE_VARIANT, {});
    expect(verdict.passed).toBe(false);
    expect(verdict.failure?.class).toBe('rule-empty');
    expect(verdict.missingEvidence).toHaveLength(0);
  });

  it('is wired for build-time audits', () => {
    expect(ruleVerifier.parseScript(detail.levelScript).grid.width).toBe(5);
    expect(ruleVerifier.reachableFailureClasses(detail)).toHaveLength(4);
    expect(ruleVerifier.reachableFailureClasses(detail)).not.toContain('rule-not-general');
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
describe('画布点格画路线（rule/place 追加展开版程序）', () => {
  function runtimeOf(source: LevelDetail) {
    return createRuleRuntime(source, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
  }

  /** 复刻 scene.ts 的一次画布点击：计划 → 逐块 rule/place 追加到末尾。 */
  async function clickRoute(
    runtime: ReturnType<typeof runtimeOf>,
    routeScript: RuleScript,
    target: { x: number; y: number },
    prefix: string,
  ): Promise<{ ok: boolean; reason?: string; blocks: ProgramBlock[] }> {
    const program = runtime.snapshot().toolState.rule?.program ?? [];
    const plan = planRouteClick(routeScript, program, target, { idPrefix: prefix });
    if (!plan.ok) return { ok: false, reason: plan.reason, blocks: [] };
    for (const [offset, block] of plan.plan.blocks.entries()) {
      const result = await runtime.dispatch({
        type: 'rule/place',
        payload: { block, at: program.length + offset },
      });
      expect(result.ok, 'append ' + block.op + ' @' + offset).toBe(true);
    }
    return { ok: true, blocks: plan.plan.blocks };
  }

  it('g13-algorithm-route：5 次画布点格走完全程 + 完成 = 6 击，产物是展开版 17 块', async () => {
    const runtime = runtimeOf(detail);
    const targets = [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    let clicks = 0;
    for (const target of targets) {
      const result = await clickRoute(runtime, script, target, 'c' + (clicks + 1));
      expect(result.ok, 'click ' + (clicks + 1) + ' -> ' + target.x + ',' + target.y).toBe(true);
      clicks += 1;
    }
    const program = runtime.snapshot().toolState.rule?.program ?? [];
    // 不自动压缩：画路线得到的是展开版（17 块、没有 repeat / if-wall）。
    expect(program).toHaveLength(17);
    expect(program.every((block) => block.op !== 'repeat' && block.op !== 'if-wall')).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    clicks += 1;
    expect(result.verdict?.passed).toBe(true);
    // 简洁印章仍归手拼压缩版：17 块 > 14，画路线拿不到 simple。
    expect(result.verdict?.stamps).not.toContain('simple');
    expect(result.verdict?.stamps).toContain('constraint');
    expect(clicks).toBe(6);
  });

  it('画路线只追加展开版：手拼的重复解才拿简洁印章', async () => {
    const runtime = runtimeOf(detail);
    const program = REPEAT;
    for (const [index, block] of program.entries()) {
      await runtime.dispatch({ type: 'rule/place', payload: { block, at: index } });
    }
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
    expect(program.length).toBe(12);
    expect(result.verdict?.stamps).toContain('simple');
  });

  it('编译规则：正前方=前进、左右=先转再走、路过星星自动收集', () => {
    const first = planRouteClick(script, [], { x: 2, y: 0 }, { idPrefix: 'a' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.plan.turn).toBe(null);
    expect(first.plan.blocks.map((block) => block.op)).toEqual(['forward', 'forward', 'collect']);

    const turn = planRouteClick(script, [], { x: 0, y: 2 }, { idPrefix: 'b' });
    expect(turn.ok).toBe(true);
    if (!turn.ok) return;
    // 起点朝东，北边是左手边：left ×1 + forward ×2。
    expect(turn.plan.turn).toBe('left');
    expect(turn.plan.blocks.map((block) => block.op)).toEqual(['left', 'forward', 'forward']);
  });

  it('不可达点击不发动作，并给出可区分的原因', () => {
    const same = planRouteClick(script, [], { x: 0, y: 0 });
    expect(same.ok ? '' : same.reason).toBe('same-cell');
    const diagonal = planRouteClick(script, [], { x: 2, y: 2 });
    expect(diagonal.ok ? '' : diagonal.reason).toBe('not-straight');
    // 出界 = 撞墙。
    const outOfBoard = planRouteClick(script, [], { x: 9, y: 0 });
    expect(outOfBoard.ok ? '' : outOfBoard.reason).toBe('blocked');
    // 朝东时正后方（西）相邻格不接：倒车要 3 块，不符合一次点击 1~2 块的规则。
    const program = (detail.solutions[1]?.artifact as { program: ProgramBlock[] }).program;
    const behind = planRouteClick(script, program, { x: 3, y: 4 });
    expect(behind.ok ? '' : behind.reason).toBe('behind');
  });

  it('k-algorithm-train：一次点击到终点（自动收集），2 击通关', async () => {
    const train = trainJson as unknown as LevelDetail;
    const trainScript = parseScript(train.levelScript);
    const runtime = runtimeOf(train);
    const clicked = await clickRoute(runtime, trainScript, { x: 4, y: 0 }, 'k1');
    expect(clicked.ok).toBe(true);
    expect(clicked.blocks.map((block) => block.op)).toEqual(['forward', 'forward', 'collect', 'forward', 'forward']);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
  });
});

/**
 * answerComplete（docs/13）：只回答「可以判了吗」，对错仍由 validateArtifact 决定。
 * rule 的口径 = 程序非空，且执行结果撞墙/绕圈（已经能报错）或已停在终点（漏星交给 validate）。
 */
describe('answerComplete（自动判题口径）', () => {
  async function placeProgram(
    runtime: ReturnType<typeof runtimeAt>,
    program: readonly ProgramBlock[],
  ): Promise<void> {
    for (const [index, block] of program.entries()) {
      const placed = await runtime.dispatch({ type: 'rule/place', payload: { block, at: index } });
      expect(placed.ok, 'place ' + block.id).toBe(true);
    }
  }

  it('空程序和「还没跑到终点」的程序都不算填完', async () => {
    const runtime = runtimeAt();
    expect(runtime.snapshot().answerComplete).toBe(false);
    await runtime.dispatch({ type: 'rule/place', payload: { block: { id: 'a', op: 'forward' }, at: 0 } });
    // 有程序、但执行后既没撞墙也没到终点：宿主不该在这时候判。
    expect(runtime.snapshot().answerComplete).toBe(false);
  });

  it('程序跑到终点：answerComplete 立即变 true，submit 也通过', async () => {
    const runtime = runtimeAt();
    await placeProgram(runtime, UNROLLED);
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
  });

  it('撞墙程序：answerComplete 为 true（已经能报错），submit 报 rule-wall', async () => {
    const runtime = runtimeAt();
    const wall = detail.negativeSamples.find((sample) => sample.expectFailure === 'rule-wall');
    expect(wall).toBeDefined();
    await placeProgram(runtime, (wall?.artifact as { program: ProgramBlock[] }).program);
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('rule-wall');
  });

  it('到了终点但漏收星星：answerComplete 为 true，对错由 validate 判 rule-missed-item', async () => {
    const runtime = runtimeAt();
    const missed = detail.negativeSamples.find((sample) => sample.expectFailure === 'rule-missed-item');
    expect(missed).toBeDefined();
    await placeProgram(runtime, (missed?.artifact as { program: ProgramBlock[] }).program);
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(false);
    expect(result.verdict?.failure?.class).toBe('rule-missed-item');
  });

  it('k-algorithm-train：顺序解收星到站后 answerComplete 为 true', async () => {
    const train = trainJson as unknown as LevelDetail;
    const runtime = createRuleRuntime(train, {
      seed: 101, now: () => 1_700_000_000_000, locale: 'zh-CN', reducedMotion: true,
    });
    const solution = (train.solutions[0]?.artifact as { program: ProgramBlock[] }).program;
    await placeProgram(runtime, solution);
    expect(runtime.snapshot().answerComplete).toBe(true);
    const result = await runtime.dispatch({ type: 'submit', payload: {} });
    expect(result.verdict?.passed).toBe(true);
  });

  it('autoplay 通关后 answerComplete 仍为 true', async () => {
    const runtime = runtimeAt();
    const result = await runtime.autoplay();
    expect(result.verdict?.passed).toBe(true);
    expect(runtime.snapshot().answerComplete).toBe(true);
  });
});
