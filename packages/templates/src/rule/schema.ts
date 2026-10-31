import { z } from 'zod';
import type { ProgramBlock } from '@mmf/game-kit';

/**
 * 规则关（5×5 网格脚本）的 zod 契约。
 * 坐标是格点，y 轴向上：east = x+，north = y+。
 */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** repeat 的次数上限：够用，也能挡住"绕圈"式程序把执行器拖死。 */
export const MAX_REPEAT = 20;
/** 嵌套层数上限：repeat / if-wall 最多套几层。 */
export const MAX_NESTING = 4;

const coord = z.number().int().min(0).max(11);

export const cellSchema = z.object({ x: coord, y: coord });
export type Cell = z.infer<typeof cellSchema>;

export const ruleScriptSchema = z.object({
  grid: z.object({
    width: z.number().int().min(3).max(12),
    height: z.number().int().min(3).max(12),
    start: z.object({ x: coord, y: coord, dir: z.enum(DIRECTIONS) }),
    goal: cellSchema,
  }),
  walls: z.array(cellSchema).max(64),
  stars: z.array(cellSchema).max(12),
  maxBlocks: z.number().int().min(1).max(64),
  maxSteps: z.number().int().min(4).max(400),
});
export type RuleScript = z.infer<typeof ruleScriptSchema>;

/** 程序块的操作符；与 @mmf/game-kit 的 ProgramBlock 一一对应。 */
export const BLOCK_OPS = ['forward', 'left', 'right', 'collect', 'repeat', 'if-wall'] as const;
export type BlockOp = (typeof BLOCK_OPS)[number];

/** 递归结构；与 game-kit 的 ProgramBlock 结构一致。 */
export interface ProgramNode {
  id: string;
  op: BlockOp;
  n?: number;
  children?: ProgramNode[];
}

export const programBlockSchema: z.ZodType<ProgramNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(24),
    op: z.enum(BLOCK_OPS),
    n: z.number().int().min(1).max(MAX_REPEAT).optional(),
    children: z.array(programBlockSchema).max(8).optional(),
  }),
);

export const programSchema = z.array(programBlockSchema).max(64);

/** 工具产物：一段可执行的程序（顶层块序列）。 */
export const ruleArtifactSchema = z.object({ program: programSchema });
export type RuleArtifact = z.infer<typeof ruleArtifactSchema>;

/** 把未知产物读成 ProgramBlock[]；读不出就当作空程序。 */
export function asProgramBlocks(program: readonly ProgramNode[]): ProgramBlock[] {
  return program.map((block) => ({
    id: block.id,
    op: block.op,
    ...(block.n === undefined ? {} : { n: block.n }),
    ...(block.children === undefined ? {} : { children: asProgramBlocks(block.children) }),
  }));
}
