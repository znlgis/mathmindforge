import { z } from 'zod';

/** 算法边界关：给固定拓扑的边赋代价，构造“局部贪心不是最优”的反例。 */
export const frontierScriptSchema = z.object({
  mode: z.literal('frontier'),
  nodes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), x: z.number().int().min(0).max(100), y: z.number().int().min(0).max(100) })).min(3).max(8),
  edges: z.array(z.object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    min: z.number().int().min(1).max(20),
    max: z.number().int().min(1).max(20),
    default: z.number().int().min(1).max(20),
  })).min(2).max(10),
  start: z.string().min(1),
  goal: z.string().min(1),
});
export type FrontierScript = z.infer<typeof frontierScriptSchema>;

export interface FrontierCosts {
  costs: Record<string, number>;
}

export interface FrontierResult {
  greedy: { path: string[]; cost: number; reached: boolean };
  optimal: { path: string[]; cost: number };
  counterexample: boolean;
}

function outgoing(script: FrontierScript, node: string) {
  return script.edges.filter((edge) => edge.from === node);
}

/** 贪心：每到一站选当前最便宜的出边，不回头。 */
export function greedyWalk(script: FrontierScript, costs: Record<string, number>): FrontierResult['greedy'] {
  const path = [script.start];
  let current = script.start;
  let cost = 0;
  const guard = new Set<string>();
  while (current !== script.goal) {
    if (guard.has(current)) return { path, cost, reached: false };
    guard.add(current);
    const options = outgoing(script, current);
    if (options.length === 0) return { path, cost, reached: false };
    let best = options[0];
    for (const edge of options) {
      const value = costs[edge.id] ?? edge.default;
      const bestValue = costs[best.id] ?? best.default;
      if (value < bestValue) best = edge;
    }
    cost += costs[best.id] ?? best.default;
    current = best.to;
    path.push(current);
  }
  return { path, cost, reached: true };
}

/** 最优：固定小图，枚举所有简单路径取最小。 */
export function optimalWalk(script: FrontierScript, costs: Record<string, number>): FrontierResult['optimal'] {
  let best: { path: string[]; cost: number } = { path: [], cost: Number.POSITIVE_INFINITY };
  const visit = (node: string, path: string[], cost: number): void => {
    if (cost >= best.cost) return;
    if (node === script.goal) {
      best = { path: [...path, node], cost };
      return;
    }
    for (const edge of outgoing(script, node)) {
      if (path.includes(edge.to)) continue;
      visit(edge.to, [...path, node], cost + (costs[edge.id] ?? edge.default));
    }
  };
  visit(script.start, [], 0);
  return best;
}

export function evaluateFrontier(script: FrontierScript, costs: Record<string, number>): FrontierResult {
  const greedy = greedyWalk(script, costs);
  const optimal = optimalWalk(script, costs);
  return {
    greedy,
    optimal,
    counterexample: greedy.reached && Number.isFinite(optimal.cost) && greedy.cost > optimal.cost,
  };
}

export interface FrontierValidation {
  passed: boolean;
  failures: string[];
  metrics: Record<string, number>;
  result: FrontierResult | null;
}

export function validateFrontierArtifact(script: FrontierScript, artifact: unknown): FrontierValidation {
  const raw = artifact as FrontierCosts | null;
  const costs = raw?.costs;
  const metrics = { edges: costs ? Object.keys(costs).length : 0 };
  if (!costs || Object.keys(costs).length === 0) {
    return { passed: false, failures: ['frontier-empty'], metrics, result: null };
  }
  for (const edge of script.edges) {
    if (typeof costs[edge.id] !== 'number') {
      return { passed: false, failures: ['frontier-incomplete'], metrics, result: null };
    }
    if (costs[edge.id] < edge.min || costs[edge.id] > edge.max) {
      return { passed: false, failures: ['frontier-range'], metrics, result: null };
    }
  }
  const result = evaluateFrontier(script, costs);
  if (!result.counterexample) {
    return { passed: false, failures: ['frontier-not-counter'], metrics, result };
  }
  return {
    passed: true,
    failures: [],
    metrics: { ...metrics, greedyCost: result.greedy.cost, optimalCost: result.optimal.cost },
    result,
  };
}
