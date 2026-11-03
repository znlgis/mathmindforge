import { z } from 'zod';

/** 反例面板可选的失效前提；M1 规定正确前提是 greedy-optimal（见 docs/06 §2.2）。 */
export const PREMISE_IDS = ['greedy-optimal', 'no-1-coin', 'target-residue'] as const;
export type PremiseId = (typeof PREMISE_IDS)[number];

export const counterConfigSchema = z.object({
  /** 反例目标金额的允许区间（闭区间） */
  targetRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).default([1, 20]),
  /** 反例目标与主任务目标的差距下限 */
  minTargetGap: z.number().int().min(0).default(4),
  denominationPool: z.array(z.number().int().positive()).min(2).default([1, 3, 4, 5]),
  premises: z.array(z.string().min(1)).min(1).default(['greedy-optimal', 'no-1-coin', 'target-residue']),
});
export type CounterConfig = z.infer<typeof counterConfigSchema>;

/** 表征轴：硬币 / 砝码 / 卡片。只换外壳说法，规则与判定不变。 */
export const representationSchema = z.object({
  kind: z.enum(['coins', 'weights', 'cards']).default('coins'),
  unit: z.string().min(1).max(4).default('元'),
});
export type Representation = z.infer<typeof representationSchema>;

/** 最少枚数支付关卡脚本（docs/06 §2.2） */
export const paymentScriptSchema = z.object({
  mode: z.literal('payment'),
  denominations: z.array(z.number().int().positive()).min(2).max(8),
  target: z.number().int().positive().max(200),
  maxCoins: z.number().int().positive().max(20).default(8),
  counter: counterConfigSchema,
  representation: representationSchema.default({ kind: 'coins', unit: '元' }),
});
export type PaymentScript = z.infer<typeof paymentScriptSchema>;

/** 未来铺砌/摆放关的脚本占位：M1 未发布，只保证 schema 可用。 */
export const placementScriptSchema = z.object({
  mode: z.literal('placement'),
  slots: z.array(z.number().int().min(0)).min(1),
  palette: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    shape: z.string().min(1),
  })).min(1),
  maxPieces: z.number().int().positive().max(100),
});
export type PlacementScript = z.infer<typeof placementScriptSchema>;

export const distributionScriptSchema = z.object({
  mode: z.literal('distribution'),
  containers: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2).max(6),
  items: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    token: z.string().min(1),
    count: z.number().int().min(1).max(40),
  })).min(1).max(4),
  constraints: z.object({
    equalCounts: z.boolean().default(true),
    minKinds: z.number().int().min(0).max(4).default(0),
    maxPerContainer: z.number().int().min(1).max(40),
  }),
});
export type DistributionScript = z.infer<typeof distributionScriptSchema>;

import { networkScriptSchema } from './network';
import { scheduleScriptSchema } from './schedule';

export const constructScriptSchema = z.discriminatedUnion('mode', [
  paymentScriptSchema,
  placementScriptSchema,
  distributionScriptSchema,
  networkScriptSchema,
  scheduleScriptSchema,
]);
export type ConstructScript = z.infer<typeof constructScriptSchema>;

/** 产物：payment（硬币集合）+ counterexample（反例）。字段全部可重算，不信任手写值。 */
export const paymentArtifactSchema = z.object({
  coins: z.array(z.number().int().positive()).min(1),
  total: z.number().int().nonnegative().optional(),
  count: z.number().int().nonnegative().optional(),
});
export type PaymentArtifact = z.infer<typeof paymentArtifactSchema>;

export const counterexampleArtifactSchema = z.object({
  target: z.number().int().positive(),
  denominations: z.array(z.number().int().positive()).min(2),
  greedyCoins: z.number().int().nonnegative().optional(),
  optimalCoins: z.number().int().nonnegative().optional(),
  isCounterexample: z.boolean().optional(),
  tested: z.boolean().optional(),
  committed: z.boolean().optional(),
  failedPremise: z.string().min(1).optional(),
});
export type CounterexampleArtifact = z.infer<typeof counterexampleArtifactSchema>;

export const constructArtifactSchema = z.object({
  payment: paymentArtifactSchema.optional(),
  counterexample: counterexampleArtifactSchema.nullable().optional(),
});
export type ConstructArtifact = z.infer<typeof constructArtifactSchema>;
