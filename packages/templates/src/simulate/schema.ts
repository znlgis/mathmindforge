import { z } from 'zod';

/**
 * g79 城市调度 · 关卡脚本（docs/06 §2.4）。
 *
 * 脚本只放事实：站点、两个种子日的需求、预算、目标、路线系数，以及
 * 等待/成本公式里的常量。所有指标都从 params + 这些常量重算，
 * 提交产物里手写的数字一律不作为判定依据。
 */

const rangeSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().positive(),
  default: z.number().int(),
});

const seedSchema = z.object({
  id: z.string().min(1),
  /** 每个站点的需求量；长度必须等于 stations.length（parseScript 会查） */
  demand: z.array(z.number().nonnegative()),
});

const routeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** 有效运力系数：coverage = min(总需求, 车辆数 × 单车容量 × 系数) / 总需求 */
  factor: z.number().positive().max(1),
  /** 这条路线带来的等待分钟增量 */
  waitPenalty: z.number(),
});

const targetSchema = z.object({
  coverageMin: z.number().min(0).max(1),
  waitMax: z.number().positive(),
});

export const simulateScriptSchema = z.object({
  mode: z.literal('dispatch'),
  stations: z.array(z.string().min(1)).min(1),
  seeds: z.array(seedSchema).min(2),
  capacityPerVehicle: z.number().int().positive(),
  budget: z.number().positive(),
  targets: z.record(z.string(), targetSchema),
  routes: z.array(routeSchema).min(1),
  formula: z.object({
    baseWait: z.number(),
    vehicleWait: z.number().nonnegative(),
    teamWait: z.number().nonnegative(),
    /** 班次分钟 → 等待增量；缺省按 0 处理 */
    shiftWait: z.record(z.string(), z.number()),
    minWait: z.number(),
    /** 种子日 id → 等待偏移（B 日比 A 日多 1 分钟） */
    seedWaitOffset: z.record(z.string(), z.number()),
    vehicleCost: z.number().nonnegative(),
    teamCost: z.number().nonnegative(),
    shiftCostPerMinute: z.number().nonnegative(),
  }),
  params: z.object({
    vehicles: rangeSchema,
    teams: rangeSchema,
    shifts: z.array(z.number().int().positive()).min(1),
    shiftDefault: z.number().int().positive(),
    routeDefault: z.string().min(1),
  }),
});
export type SimulateScript = z.infer<typeof simulateScriptSchema>;

/** 提交产物：一组参数 + 两个种子日各一条运行记录（数字只作显示）。 */
export const simulateArtifactSchema = z.object({
  params: z.object({
    vehicles: z.number().int(),
    teams: z.number().int(),
    shift: z.number().int(),
    route: z.string().min(1),
  }),
  runs: z
    .array(
      z.object({
        seed: z.string().min(1),
        demand: z.number().optional(),
        capacity: z.number().optional(),
        coverage: z.number().optional(),
        wait: z.number().optional(),
        cost: z.number().optional(),
      }),
    )
    .default([]),
});
export type SimulateArtifact = z.infer<typeof simulateArtifactSchema>;
