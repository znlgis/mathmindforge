import { round2 } from '@mmf/toolkit/shared';
import type { SimulateScript } from './schema';

/**
 * 调度模拟的纯函数层（docs/06 §2.4）。不碰 Phaser/Vue/DOM，也不读时间与随机源：
 * 同一组 params 必然得到同一组指标，所以可以在单测里逐项对账。
 */

export type SimSeed = SimulateScript['seeds'][number];
export type SimRoute = SimulateScript['routes'][number];

/** 一组旋钮取值。route 用路线 id 表达（提交产物里也是这个形态）。 */
export interface SimParams {
  vehicles: number;
  teams: number;
  shift: number;
  route: string;
}

export interface SimSeedMetrics {
  seed: string;
  demand: number;
  capacity: number;
  effectiveCapacity: number;
  coverage: number;
  wait: number;
  cost: number;
}

export function totalDemand(seed: SimSeed): number {
  return seed.demand.reduce((sum, value) => sum + value, 0);
}

export function findRoute(script: SimulateScript, routeId: string): SimRoute | null {
  return script.routes.find((route) => route.id === routeId) ?? null;
}

export function capacityOf(script: SimulateScript, params: SimParams): number {
  return params.vehicles * script.capacityPerVehicle;
}

export function coverageOf(script: SimulateScript, params: SimParams, seed: SimSeed): number {
  const demand = totalDemand(seed);
  if (demand <= 0) return 1;
  const route = findRoute(script, params.route);
  const factor = route ? route.factor : 1;
  const effective = capacityOf(script, params) * factor;
  return Math.min(demand, effective) / demand;
}

/** 与文档一致：30 − 4×车辆 − 2×服务队 + 班次增量 + 路线增量。 */
export function baseWaitOf(script: SimulateScript, params: SimParams): number {
  const formula = script.formula;
  const route = findRoute(script, params.route);
  const shiftWait = formula.shiftWait[String(params.shift)] ?? 0;
  const routeWait = route ? route.waitPenalty : 0;
  return (
    formula.baseWait
    - params.vehicles * formula.vehicleWait
    - params.teams * formula.teamWait
    + shiftWait
    + routeWait
  );
}

export function waitOf(script: SimulateScript, params: SimParams, seed: SimSeed): number {
  const offset = script.formula.seedWaitOffset[seed.id] ?? 0;
  return Math.max(script.formula.minWait, baseWaitOf(script, params) + offset);
}

export function costOf(script: SimulateScript, params: SimParams): number {
  const formula = script.formula;
  return round2(
    params.vehicles * formula.vehicleCost
    + params.teams * formula.teamCost
    + params.shift * formula.shiftCostPerMinute,
  );
}

export function runSeed(script: SimulateScript, params: SimParams, seed: SimSeed): SimSeedMetrics {
  const route = findRoute(script, params.route);
  const factor = route ? route.factor : 1;
  const capacity = capacityOf(script, params);
  return {
    seed: seed.id,
    demand: totalDemand(seed),
    capacity,
    effectiveCapacity: round2(capacity * factor),
    coverage: coverageOf(script, params, seed),
    wait: waitOf(script, params, seed),
    cost: costOf(script, params),
  };
}

/** 一次运行同时算两个种子日——knob/run 的语义就是「同一天的两份需求都跑一遍」。 */
export function runSimulation(script: SimulateScript, params: SimParams): SimSeedMetrics[] {
  return script.seeds.map((seed) => runSeed(script, params, seed));
}

export interface SimTargetCheck {
  seed: string;
  coverageMin: number;
  waitMax: number;
  coverageOk: boolean;
  waitOk: boolean;
}

export function targetChecks(script: SimulateScript, runs: SimSeedMetrics[]): SimTargetCheck[] {
  return runs.map((run) => {
    const target = script.targets[run.seed];
    return {
      seed: run.seed,
      coverageMin: target.coverageMin,
      waitMax: target.waitMax,
      coverageOk: run.coverage + 1e-9 >= target.coverageMin,
      waitOk: run.wait <= target.waitMax + 1e-9,
    };
  });
}

export function withinBudget(script: SimulateScript, cost: number): boolean {
  return cost <= script.budget + 1e-9;
}
