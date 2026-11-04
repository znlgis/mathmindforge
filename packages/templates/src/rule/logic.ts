import type {
  ArtifactSummary, FailureCause, LevelAction, LevelDetail, ProgramBlock, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import type { RuntimeVariant } from '../shared/types';
import { cellKey, executeProgram } from './engine';
import type { RuleTrace } from './engine';
import { asProgramBlocks, programBlockSchema, ruleScriptSchema } from './schema';
import type { Cell, Direction, RuleScript } from './schema';

/**
 * rule 模板的失败类。
 * 迁移门（旋转变体）已按 docs/12 T2-3 删掉：旋转是刚体变换，程序通过母本必然通过，
 * 那个门恒真、rule-not-general 永不可达。这里不再保留死失败类。
 */
export const FAILURE_CLASSES = [
  'rule-empty',
  'rule-wall',
  'rule-loop',
  'rule-missed-item',
] as const;
export type RuleFailureClass = (typeof FAILURE_CLASSES)[number];

/** 与 shared 的 RuntimeVariant 同形；内容层的 variants 也用它。 */
export type RuleVariant = RuntimeVariant;

/** 关卡脚本母本；内容层和变体都绕着它转。 */
export interface TraceSummary {
  steps: number;
  failureStep?: number;
  failureClass?: string;
}

/** 调用方可以传脚本本身，也可以传整份关卡详情（脚本在 levelScript 里）。 */
export type ScriptSource = RuleScript | LevelDetail;

/**
 * docs/06 §1 的 verifier 形状：构建期/审计用，不含 Phaser。
 * 注意：rule 没有迁移门。历史上这里挂过 90°/180° 旋转变体，
 * 但旋转保持相对方向，母本通过必然变体通过（恒真），已在 docs/12 T2-3 删除。
 */
export interface TemplateVerifier {
  parseScript(input: unknown): RuleScript;
  validateArtifact(detail: LevelDetail, variant: RuleVariant, artifact: unknown): Verdict;
  actionsFor(detail: LevelDetail, variant: RuleVariant, artifact: unknown): LevelAction[];
  applyVariant(detail: LevelDetail, variant: RuleVariant): RuleScript;
  reachableFailureClasses(detail: LevelDetail): string[];
}

/** 母本变体：内容层与运行时都用它表示"没换皮"。 */
export const BASE_VARIANT: RuleVariant = { id: 'base', axis: 'structure', patch: {} };

export function parseScript(input: unknown): RuleScript {
  return ruleScriptSchema.parse(input);
}

function isLevelDetail(source: ScriptSource): source is LevelDetail {
  return typeof source === 'object' && source !== null && 'levelScript' in source;
}

export function scriptOf(source: ScriptSource): RuleScript {
  return isLevelDetail(source) ? parseScript(source.levelScript) : source;
}

/* ------------------------------------------------------------------ */
/* 变体：旋转 90 / 180 / 270 把整张地图（起点方向、墙、星星、终点）一起转 */
/* ------------------------------------------------------------------ */

function rotateCell(cell: Cell, quarter: 1 | 2 | 3, width: number, height: number): Cell {
  if (quarter === 1) return { x: height - 1 - cell.y, y: cell.x };
  if (quarter === 2) return { x: width - 1 - cell.x, y: height - 1 - cell.y };
  return { x: cell.y, y: width - 1 - cell.x };
}

function rotateDirection(dir: Direction, quarter: 1 | 2 | 3): Direction {
  // 逆时针顺序：east → north → west → south
  const order: Direction[] = ['east', 'north', 'west', 'south'];
  const index = order.indexOf(dir);
  return order[(index + quarter) % 4];
}

export function rotateScript(script: RuleScript, quarter: 1 | 2 | 3): RuleScript {
  const { width, height } = script.grid;
  const cell = (input: Cell): Cell => rotateCell(input, quarter, width, height);
  const swapped = quarter % 2 === 1;
  return ruleScriptSchema.parse({
    grid: {
      width: swapped ? height : width,
      height: swapped ? width : height,
      start: { ...cell(script.grid.start), dir: rotateDirection(script.grid.start.dir, quarter) },
      goal: cell(script.grid.goal),
    },
    walls: script.walls.map(cell),
    stars: script.stars.map(cell),
    maxBlocks: script.maxBlocks,
    maxSteps: script.maxSteps,
  });
}

function quarterOf(patch: Record<string, unknown>): 0 | 1 | 2 | 3 {
  const raw = Number(patch.rotate ?? 0);
  if (raw === 90) return 1;
  if (raw === 180) return 2;
  if (raw === 270) return 3;
  return 0;
}

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)) {
      out[key] = mergeRecord(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 应用一个变体。patch 里 `rotate: 90 | 180 | 270` 负责整图旋转；
 * 其余字段按深度合并进脚本（给后续 representation 变体留口子）。
 */
export function applyVariant(source: ScriptSource, variant: RuleVariant): RuleScript {
  const script = scriptOf(source);
  const patch = variant.patch ?? {};
  const quarter = quarterOf(patch);
  let next = quarter === 0 ? script : rotateScript(script, quarter);
  const leftovers = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'rotate'));
  if (Object.keys(leftovers).length > 0) {
    next = ruleScriptSchema.parse(
      mergeRecord(next as unknown as Record<string, unknown>, leftovers),
    );
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* 产物读写                                                            */
/* ------------------------------------------------------------------ */

/** 把产物（或工具状态）读成程序块列表；结构不对就当空程序。 */
export function readProgram(artifact: unknown): ProgramBlock[] {
  if (!artifact || typeof artifact !== 'object') return [];
  const raw = (artifact as { program?: unknown }).program;
  if (!Array.isArray(raw)) return [];
  const nodes: ProgramBlock[] = [];
  for (const item of raw) {
    const parsed = programBlockSchema.safeParse(item);
    if (!parsed.success) return [];
    nodes.push(...asProgramBlocks([parsed.data]));
  }
  return nodes;
}

/** 顶层块数 + repeat / if-wall 里的子块。 */
export function countBlocks(program: readonly ProgramBlock[]): number {
  let total = 0;
  for (const block of program) {
    total += 1 + countBlocks(block.children ?? []);
  }
  return total;
}

export function summarizeProgram(program: readonly ProgramBlock[]): ArtifactSummary[] {
  if (program.length === 0) return [];
  return [{
    id: 'program',
    kind: 'program',
    digest: digest(program),
    summary: program.length + ' 块程序 / ' + countBlocks(program) + ' 个格子',
  }];
}

export function traceSummary(trace: RuleTrace): TraceSummary {
  return { steps: trace.steps, failureStep: trace.failureStep, failureClass: trace.failureClass };
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

function fail(
  variant: RuleVariant,
  failureClass: string,
  causes: FailureCause[],
  artifacts: ArtifactSummary[],
): Verdict {
  return {
    passed: false,
    stamps: [],
    failure: { class: failureClass, variantId: variant.id, causes },
    missingEvidence: [],
    artifacts,
  };
}

/**
 * 纯校验：重走一遍程序，不信任任何预先算好的 trace。
 * 判据：收齐全部星星 + 停在终点；撞墙 / 绕圈 / 少收东西各自对应失败类。
 */
export function validateArtifact(source: ScriptSource, variant: RuleVariant, artifact: unknown): Verdict {
  const script = applyVariant(source, variant);
  const program = readProgram(artifact);
  const artifacts = summarizeProgram(program);

  if (program.length === 0) {
    return fail(variant, 'rule-empty', [
      { kind: 'constraint', ref: 'program', messageKey: 'level.rule.empty.message' },
    ], artifacts);
  }

  const trace = executeProgram(script, program);

  if (trace.failureClass) {
    const wall = trace.failureClass === 'rule-wall';
    return fail(variant, trace.failureClass, [{
      kind: wall ? 'cell' : 'step',
      ref: String(trace.failureStep ?? trace.steps),
      messageKey: wall ? 'level.rule.wall.message' : 'level.rule.loop.message',
    }], artifacts);
  }

  const missing = script.stars.filter(
    (star) => !trace.collected.some((cell) => cell.x === star.x && cell.y === star.y),
  );
  const atGoal = trace.end.x === script.grid.goal.x && trace.end.y === script.grid.goal.y;
  if (!atGoal || missing.length > 0) {
    const causes: FailureCause[] = [];
    if (missing.length > 0) {
      causes.push({
        kind: 'cell',
        ref: missing.map(cellKey).join(','),
        messageKey: 'level.rule.missedItem.message',
      });
    }
    if (!atGoal) {
      causes.push({
        kind: 'cell',
        ref: cellKey(script.grid.goal),
        messageKey: 'level.rule.goal.message',
      });
    }
    return fail(variant, 'rule-missed-item', causes, artifacts);
  }

  // 没有迁移门就不再发 transfer 印章：印章必须来自真的逐变体校验（shared/runtime.ts 统一加）。
  const stamps: Verdict['stamps'] = ['constraint'];
  if (program.length <= 14) stamps.push('simple');
  return {
    passed: true,
    stamps,
    missingEvidence: [],
    artifacts,
    metrics: { steps: trace.steps, blocks: program.length, collected: trace.collected.length },
  };
}

/* ------------------------------------------------------------------ */
/* 动作回放与失败类                                                    */
/* ------------------------------------------------------------------ */

/**
 * autoplay 的公开动作：逐块放 → 点击「提交程序」 → 宿主「完成」。
 * 「试一下」按钮与它的硬检查点已随 docs/12 T0-3 删掉；画布在每次编辑后
 * 就重算了轨迹，run 不再是一条独立动作。
 */
export function actionsFor(_source: ScriptSource, _variant: RuleVariant, artifact: unknown): LevelAction[] {
  const program = readProgram(artifact);
  const actions: LevelAction[] = program.map((block, index) => ({
    type: 'rule/place',
    payload: { block, at: index },
  }));
  // 保留 rule/commit 供 autoplay/audit 走旧路径（程序拼好即答案，玩家侧没有这个按钮）。
  actions.push({ type: 'rule/commit', payload: {} });
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_source?: ScriptSource): string[] {
  return [...FAILURE_CLASSES];
}

/** 调试/测试用：把一段程序在脚本上跑出来的完整轨迹。 */
export function traceProgram(source: ScriptSource, program: readonly ProgramBlock[]): RuleTrace {
  return executeProgram(scriptOf(source), program);
}

/* ------------------------------------------------------------------ */
/* 画布点格画路线：把「点到同一行/列的格子」编译成展开版程序           */
/* ------------------------------------------------------------------ */

export type RouteClickFailure = 'same-cell' | 'not-straight' | 'behind' | 'blocked' | 'budget';

/** 一次画布点击编译出来的路线计划（场景用来画预览、runtime 用来逐块 place）。 */
export interface RouteClickPlan {
  /** 当前程序执行完停在的位置与朝向。 */
  from: Cell;
  facing: Direction;
  target: Cell;
  /** 需要的转向块；null = 当前朝向正好走这条直线。 */
  turn: 'left' | 'right' | null;
  /** 直线距离（格）。 */
  distance: number;
  /** 本次点击自动补上的收集块数量。 */
  collects: number;
  /** 要追加到程序末尾的块（展开版，不压缩成 repeat）。 */
  blocks: ProgramBlock[];
}

export type RouteClickResult =
  | { ok: true; plan: RouteClickPlan }
  | { ok: false; reason: RouteClickFailure };

/** 顺时针方向序：north → east → south → west（右转一步 = +1）。 */
const CLOCKWISE: readonly Direction[] = ['north', 'east', 'south', 'west'];

/**
 * 把「点目标格」编译成程序块。
 * 规则（与画布预览一致）：
 * - 目标必须与当前位置同一行或同一列，且中间没有墙；
 * - 目标在正前方 → 只追加 forward × 距离；
 * - 目标在左手边 → 追加 left + forward × 距离；右手边 → right + forward × 距离；
 * - 正后方不接（一次点击要产生 1~2 类有意义的动作，倒车会塞 3 块）；
 * - 路过/落在星星上时自动补 collect（和玩家手拼时一样，收集是显式积木）；
 * - 超过程序格上限、点自己、斜对角、撞墙 → 失败原因，由画布给短暂高亮。
 * 产物永远是展开版：不生成 repeat / if-wall，简洁印章仍归手拼压缩版。
 */
export function planRouteClick(
  script: RuleScript,
  program: readonly ProgramBlock[],
  target: Cell,
  options: { idPrefix?: string } = {},
): RouteClickResult {
  const trace = executeProgram(script, program);
  const from: Cell = { x: trace.end.x, y: trace.end.y };
  const facing = trace.end.dir;
  if (target.x === from.x && target.y === from.y) return { ok: false, reason: 'same-cell' };

  let dir: Direction;
  if (target.x === from.x) dir = target.y > from.y ? 'north' : 'south';
  else if (target.y === from.y) dir = target.x > from.x ? 'east' : 'west';
  else return { ok: false, reason: 'not-straight' };

  const delta = (CLOCKWISE.indexOf(dir) - CLOCKWISE.indexOf(facing) + 4) % 4;
  if (delta === 2) return { ok: false, reason: 'behind' };
  const turn: 'left' | 'right' | null = delta === 0 ? null : delta === 1 ? 'right' : 'left';
  const distance = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);

  const stars = new Set(script.stars.map(cellKey));
  const collected = new Set(trace.collected.map(cellKey));
  const prefix = (options.idPrefix ?? 'route').slice(0, 16);
  const blocks: ProgramBlock[] = [];
  let serial = 0;
  const push = (op: ProgramBlock['op']): void => {
    serial += 1;
    blocks.push({ id: prefix + '-' + serial, op });
  };

  if (turn) push(turn);
  let x = from.x;
  let y = from.y;
  let collects = 0;
  for (let step = 0; step < distance; step += 1) {
    if (dir === 'north') y += 1;
    else if (dir === 'south') y -= 1;
    else if (dir === 'east') x += 1;
    else x -= 1;
    if (x < 0 || y < 0 || x >= script.grid.width || y >= script.grid.height) {
      return { ok: false, reason: 'blocked' };
    }
    if (script.walls.some((wall) => wall.x === x && wall.y === y)) return { ok: false, reason: 'blocked' };
    const key = x + ',' + y;
    push('forward');
    if (stars.has(key) && !collected.has(key)) {
      push('collect');
      collects += 1;
    }
  }

  if (countBlocks(program) + blocks.length > script.maxBlocks) return { ok: false, reason: 'budget' };
  return {
    ok: true,
    plan: { from, facing, target, turn, distance, collects, blocks },
  };
}

export const ruleVerifier: TemplateVerifier = {
  parseScript,
  validateArtifact,
  actionsFor,
  applyVariant,
  reachableFailureClasses,
};
