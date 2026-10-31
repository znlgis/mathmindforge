import { z } from 'zod';

/**
 * experiment 模板的关卡脚本：按 mode 分成 tally（分类计数）与 duel（胜率实验）两支。
 * 纯数据契约，不含任何运行时依赖；运行时/校验器都从 parseScript 拿类型。
 */

export const tallyCategorySchema = z.object({
  id: z.string().min(1).max(16),
  label: z.string().min(1).max(8),
  token: z.string().min(1).max(4),
  count: z.number().int().min(0).max(200),
});
export type TallyCategory = z.infer<typeof tallyCategorySchema>;

export const tallyScriptSchema = z.object({
  mode: z.literal('tally'),
  batchSize: z.number().int().min(1).max(20),
  categories: z.array(tallyCategorySchema).min(2).max(6),
  items: z.array(z.string().min(1)).min(2).max(120),
});
export type TallyScript = z.infer<typeof tallyScriptSchema>;

export const duelParamsSchema = z.object({
  attack: z.number().int().min(0).max(400),
  defense: z.number().int().min(0).max(400),
  economy: z.number().int().min(0).max(400),
});
export type DuelParams = z.infer<typeof duelParamsSchema>;

export const duelOpponentSchema = z.object({
  id: z.string().min(1).max(16),
  label: z.string().min(1).max(8),
  attack: z.number().int().min(0).max(400),
  defense: z.number().int().min(0).max(400),
  economy: z.number().int().min(0).max(400),
  weight: z.number().int().min(1).max(9).optional(),
});
export type DuelOpponent = z.infer<typeof duelOpponentSchema>;

export const duelTargetsSchema = z.object({
  /** A 种子要达到的胜率目标 */
  winRate: z.number().min(0).max(1),
  /** A 种子 95% 区间下界至少要站住的位置 */
  winRateLow: z.number().min(0).max(1),
  /** B 种子（迁移检查）至少要站住的位置 */
  baselineB: z.number().min(0).max(1),
});
export type DuelTargets = z.infer<typeof duelTargetsSchema>;

export const duelCoefficientsSchema = z.object({
  /** 每回合玩家攻势的成长系数（乘在 eco 上） */
  ecoAttack: z.number().min(0).max(0.5),
  /** 每回合玩家守势的成长系数 */
  ecoDefense: z.number().min(0).max(0.5),
  /** 经济值换算成 eco 的比例（eco = economy * ecoPerRound * (round - 1)） */
  ecoPerRound: z.number().min(0).max(1),
  noiseLow: z.number().min(0.5).max(1),
  noiseHigh: z.number().min(1).max(1.5),
  /** 每回合拿下一点的分值 */
  pointWin: z.number().min(0).max(1),
  /** 十回合打平时的分值 */
  pointDraw: z.number().min(0).max(1),
});
export type DuelCoefficients = z.infer<typeof duelCoefficientsSchema>;

export const duelScriptSchema = z.object({
  mode: z.literal('duel'),
  rounds: z.number().int().min(2).max(24),
  /** attack + defense + economy 必须正好等于 resources */
  resources: z.number().int().min(20).max(400),
  step: z.number().int().min(1).max(20).default(5),
  /** 样本量的默认值，同时也是校验要求的最小局数 */
  matches: z.number().int().min(100).max(5000).default(1000),
  seeds: z.array(z.number().int().min(1).max(1_000_000)).min(1).max(4),
  /** 当前实验用哪一个种子；迁移变体用 patch 改成 1 表示 B 种子 */
  seedIndex: z.number().int().min(0).max(3).default(0),
  opponents: z.array(duelOpponentSchema).min(1).max(4),
  targets: duelTargetsSchema,
  initialParams: duelParamsSchema.optional(),
  coefficients: duelCoefficientsSchema.optional(),
});
export type DuelScript = z.infer<typeof duelScriptSchema>;

export const experimentScriptSchema = z.discriminatedUnion('mode', [
  tallyScriptSchema,
  duelScriptSchema,
]);
export type ExperimentScript = z.infer<typeof experimentScriptSchema>;

const countsSchema = z.record(z.string(), z.number().int().min(0).max(999));

export const tallyArtifactSchema = z.object({
  dataset: z.object({ n: z.number().int().min(0).max(999), counts: countsSchema }),
  tally: z.object({ counts: countsSchema }),
  claim: z.object({
    kind: z.literal('count-compare'),
    category: z.string().min(1),
    direction: z.enum(['most', 'least']),
    tiedWith: z.array(z.string().min(1)).max(6).optional(),
    n: z.number().int().min(0).max(999),
  }),
});
export type TallyArtifact = z.infer<typeof tallyArtifactSchema>;

export const duelArtifactSchema = z.object({
  params: duelParamsSchema,
  dataset: z.object({
    n: z.number().int().min(0).max(5000),
    wins: z.number().min(0).max(5000),
    seed: z.number().int().min(1).max(1_000_000).optional(),
    winRate: z.number().min(0).max(1).optional(),
    ci: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  }),
  claim: z.object({
    kind: z.literal('stat'),
    statistic: z.literal('proportion'),
    value: z.number().min(0).max(1),
    n: z.number().int().min(1).max(5000),
    ci: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  }),
});
export type DuelArtifact = z.infer<typeof duelArtifactSchema>;

export const experimentArtifactSchema = z.union([tallyArtifactSchema, duelArtifactSchema]);
export type ExperimentArtifact = z.infer<typeof experimentArtifactSchema>;
