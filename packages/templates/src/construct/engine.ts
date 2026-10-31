/**
 * 纯函数硬币引擎：DP 求最优、贪心模拟、反例判定。
 * 不依赖 Phaser / Vue / DOM，不读时钟、不读随机数。
 */

export interface CoinPlan {
  /** 枚数 */
  count: number;
  /** 实际硬币值，从大到小 */
  coins: number[];
}

export interface CounterInstance {
  target: number;
  denominations: number[];
}

export interface CounterEvaluation {
  instance: CounterInstance;
  greedy: CoinPlan | null;
  optimal: CoinPlan | null;
  greedyCount: number | null;
  optimalCount: number | null;
  /** greedyCount - optimalCount；付不清时为 0 */
  surplus: number;
  /** 两边都付得清，且贪心枚数更多 */
  isCounterexample: boolean;
  /** 与主任务目标的绝对差；未给主任务时为 null */
  targetGap: number | null;
}

const UNREACHABLE = Number.POSITIVE_INFINITY;

/** 去重、去掉非正整数，按从大到小排序（贪心的顺序）。 */
export function normalizeDenominations(input: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of input) {
    if (!Number.isInteger(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.sort((a, b) => b - a);
}

export function coinsTotal(coins: readonly number[]): number {
  let total = 0;
  for (const coin of coins) total += coin;
  return total;
}

/** 贪心：每次拿不超过余额的最大面额。付不清返回 null。 */
export function greedyCoins(denominations: readonly number[], target: number): CoinPlan | null {
  if (!Number.isInteger(target) || target < 0) return null;
  const coins: number[] = [];
  let remaining = target;
  for (const coin of normalizeDenominations(denominations)) {
    while (remaining >= coin) {
      coins.push(coin);
      remaining -= coin;
    }
  }
  if (remaining !== 0) return null;
  return { count: coins.length, coins };
}

/** 最优：完全背包，dp[value] = 凑出 value 的最少枚数；不可达返回 null。 */
export function optimalCoins(denominations: readonly number[], target: number): CoinPlan | null {
  if (!Number.isInteger(target) || target < 0) return null;
  if (target === 0) return { count: 0, coins: [] };
  const sorted = normalizeDenominations(denominations);
  if (sorted.length === 0) return null;

  const best = new Array<number>(target + 1).fill(UNREACHABLE);
  const choice = new Array<number>(target + 1).fill(0);
  best[0] = 0;
  for (let value = 1; value <= target; value += 1) {
    for (const coin of sorted) {
      if (coin > value) continue;
      const previous = best[value - coin];
      if (!Number.isFinite(previous)) continue;
      if (previous + 1 < best[value]) {
        best[value] = previous + 1;
        choice[value] = coin;
      }
    }
  }
  if (!Number.isFinite(best[target])) return null;

  const coins: number[] = [];
  let value = target;
  while (value > 0) {
    const coin = choice[value];
    if (coin <= 0) return null;
    coins.push(coin);
    value -= coin;
  }
  coins.sort((a, b) => b - a);
  return { count: coins.length, coins };
}

/** 在同一个实例上跑贪心与最优，并判断它是不是反例。 */
export function evaluateCounterexample(
  instance: CounterInstance,
  mainTarget?: number,
): CounterEvaluation {
  const greedy = greedyCoins(instance.denominations, instance.target);
  const optimal = optimalCoins(instance.denominations, instance.target);
  const greedyCount = greedy ? greedy.count : null;
  const optimalCount = optimal ? optimal.count : null;
  const surplus = greedyCount !== null && optimalCount !== null ? greedyCount - optimalCount : 0;
  return {
    instance: { target: instance.target, denominations: [...instance.denominations] },
    greedy,
    optimal,
    greedyCount,
    optimalCount,
    surplus,
    isCounterexample: surplus > 0,
    targetGap: mainTarget === undefined ? null : Math.abs(instance.target - mainTarget),
  };
}

/**
 * 失效前提判定：反例推翻的命题固定是"贪心总是最优"。
 * no-1-coin / target-residue 是给反例面板的干扰项，M1 不接受它们作为解释。
 */
export function premiseIsCorrect(premiseId: string, evaluation: CounterEvaluation): boolean {
  return evaluation.isCounterexample && premiseId === 'greedy-optimal';
}
