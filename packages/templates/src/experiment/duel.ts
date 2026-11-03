import type { ClaimInput, FailureCause } from '@mmf/game-kit';
import { digest, mulberry32, wilsonInterval } from '@mmf/toolkit/shared';
import { MAX_MATCHES } from './schema';
import type { DuelCoefficients, DuelOpponent, DuelParams, DuelScript } from './schema';

/**
 * duel（10 回合对撞实验）的纯逻辑：
 * - 每局按固定系数把 attack/defense/economy 摊成攻守分，双方同时出手；
 * - 噪声只来自注入的种子（mulberry32），同一 (seed, 局号, 回合, 位置) 结果唯一；
 * - 1000 局后给胜率与 Wilson 95% 区间。
 * 不 import Phaser/Vue/DOM，不调用 Math.random / Date.now。
 */

export const DUEL_FAILURE_CLASSES = [
  'exp-not-run',
  'exp-sample-small',
  'exp-below-baseline',
  'exp-claim-beyond-ci',
  'exp-overfit-seed',
] as const;
export type DuelFailureClass = (typeof DUEL_FAILURE_CLASSES)[number];

export interface DuelOpponentStat {
  n: number;
  wins: number;
}

export interface DuelResult {
  seed: number;
  n: number;
  wins: number;
  winRate: number;
  ci: [number, number];
  byOpponent: Record<string, DuelOpponentStat>;
  /** 逐局得分（1 胜 / 0.5 平 / 0 负），给工具面板画点阵用 */
  values: number[];
}

export interface DuelCheck {
  passed: boolean;
  failureClass?: DuelFailureClass;
  causes: FailureCause[];
  metrics: Record<string, number>;
}

export const DEFAULT_COEFFICIENTS: DuelCoefficients = {
  ecoAttack: 0.03,
  ecoDefense: 0.03,
  ecoPerRound: 0.1,
  noiseLow: 0.9,
  noiseHigh: 1.1,
  pointWin: 1,
  pointDraw: 0.5,
};

export function coefficientsOf(script: DuelScript): DuelCoefficients {
  return { ...DEFAULT_COEFFICIENTS, ...(script.coefficients ?? {}) };
}

export function paramsSum(params: DuelParams): number {
  return params.attack + params.defense + params.economy;
}

/** 参数必须正好用完资源点、且每个值都是 step 的整数倍。 */
export function paramsValid(script: DuelScript, params: DuelParams | undefined): boolean {
  if (!params) return false;
  for (const value of [params.attack, params.defense, params.economy]) {
    if (!Number.isInteger(value) || value < 0 || value % script.step !== 0) return false;
  }
  return paramsSum(params) === script.resources;
}

/** 对手按 weight 做确定性轮转，保证同一局号永远遇到同一个对手。 */
export function opponentSequence(script: DuelScript): DuelOpponent[] {
  const sequence: DuelOpponent[] = [];
  for (const opponent of script.opponents) {
    const weight = opponent.weight ?? 1;
    for (let i = 0; i < weight; i += 1) sequence.push(opponent);
  }
  return sequence;
}

export function opponentFor(script: DuelScript, matchIndex: number): DuelOpponent {
  const sequence = opponentSequence(script);
  const pick = sequence[((matchIndex % sequence.length) + sequence.length) % sequence.length];
  return pick ?? sequence[0] as DuelOpponent;
}

/** 噪声：同一种子下每局每回合四个位置各取一次，映射到 [noiseLow, noiseHigh]。 */
function noise(base: number, round: number, side: number, coefficients: DuelCoefficients): number {
  const random = mulberry32(base + round * 131 + side)();
  return coefficients.noiseLow + random * (coefficients.noiseHigh - coefficients.noiseLow);
}

export function matchSeed(seed: number, matchIndex: number): number {
  return Math.imul(seed, 10007) + Math.imul(matchIndex + 1, 7919);
}

export interface DuelMatchOutcome {
  score: number;
  opponentId: string;
  playerPoints: number;
  opponentPoints: number;
}

/** 一局：10 回合内双方各按 eco 成长，分数高者胜；打平 0.5。 */
export function simulateMatch(
  script: DuelScript,
  params: DuelParams,
  seed: number,
  matchIndex: number,
): DuelMatchOutcome {
  const coefficients = coefficientsOf(script);
  const opponent = opponentFor(script, matchIndex);
  const base = matchSeed(seed, matchIndex);
  let playerPoints = 0;
  let opponentPoints = 0;

  for (let round = 1; round <= script.rounds; round += 1) {
    const playerEco = params.economy * coefficients.ecoPerRound * (round - 1);
    const opponentEco = opponent.economy * coefficients.ecoPerRound * (round - 1);
    const attack = params.attack * (1 + coefficients.ecoAttack * playerEco);
    const defense = params.defense * (1 + coefficients.ecoDefense * playerEco);
    const rivalAttack = opponent.attack * (1 + coefficients.ecoAttack * opponentEco);
    const rivalDefense = opponent.defense * (1 + coefficients.ecoDefense * opponentEco);

    const attackRoll = attack * noise(base, round, 0, coefficients);
    const defenseRoll = defense * noise(base, round, 1, coefficients);
    const rivalAttackRoll = rivalAttack * noise(base, round, 2, coefficients);
    const rivalDefenseRoll = rivalDefense * noise(base, round, 3, coefficients);

    if (attackRoll > rivalDefenseRoll) playerPoints += 1;
    if (rivalAttackRoll > defenseRoll) opponentPoints += 1;
  }

  const score = playerPoints > opponentPoints
    ? coefficients.pointWin
    : playerPoints < opponentPoints
      ? 0
      : coefficients.pointDraw;
  return { score, opponentId: opponent.id, playerPoints, opponentPoints };
}

/** 跑 n 局，返回胜率与 Wilson 95% 区间；完全确定性。 */
export function simulateDuel(
  script: DuelScript,
  params: DuelParams,
  seed: number,
  n: number,
): DuelResult {
  const rounds = Math.max(0, Math.floor(n));
  const byOpponent: Record<string, DuelOpponentStat> = {};
  const values: number[] = [];
  let wins = 0;
  for (let index = 0; index < rounds; index += 1) {
    const outcome = simulateMatch(script, params, seed, index);
    wins += outcome.score;
    values.push(outcome.score);
    const bucket = byOpponent[outcome.opponentId] ?? { n: 0, wins: 0 };
    bucket.n += 1;
    bucket.wins += outcome.score;
    byOpponent[outcome.opponentId] = bucket;
  }
  const interval = wilsonInterval(wins, rounds);
  return {
    seed,
    n: rounds,
    wins,
    winRate: rounds > 0 ? wins / rounds : 0,
    ci: [interval.low, interval.high],
    byOpponent,
    values,
  };
}

export function duelDigest(result: DuelResult): string {
  return digest({
    seed: result.seed,
    n: result.n,
    wins: Math.round(result.wins * 1000) / 1000,
    byOpponent: result.byOpponent,
  });
}

function cause(
  kind: FailureCause['kind'],
  ref: string,
  messageKey: string,
  params?: Record<string, string | number>,
): FailureCause {
  const out: FailureCause = { kind, ref, messageKey };
  if (params) out.params = params;
  return out;
}

export interface DuelCheckInput {
  params?: DuelParams;
  dataset?: { n?: number; wins?: number; seed?: number; winRate?: number; ci?: [number, number] };
  claim?: ClaimInput;
  /** 校验的目标种子（base 用 A，迁移用 B） */
  seed: number;
  /** 只检查胜率基线，不检查结论（迁移变体用） */
  checkClaim: boolean;
}

/**
 * 校验 duel 产物：参数合法 → 样本量够 → 重算胜率达标 → 结论落在区间里。
 * 一律用 simulateDuel 重算，不信任产物里的 wins / winRate。
 */
export function checkDuelArtifact(script: DuelScript, input: DuelCheckInput): DuelCheck {
  const metrics: Record<string, number> = { seed: input.seed };
  if (!input.params || !paramsValid(script, input.params)) {
    return {
      passed: false,
      failureClass: 'exp-not-run',
      causes: [cause('constraint', 'params', '先把 attack/defense/economy 调成正好用满资源点的配置。', {
        resources: script.resources,
        step: script.step,
      })],
      metrics,
    };
  }
  // 局数来自产物，必须先收敛到这一关允许的范围，否则 1e9 这种数字会把重算拖死。
  const rawN = input.dataset?.n;
  const datasetN = typeof rawN === 'number' && Number.isInteger(rawN) ? rawN : 0;
  if (datasetN <= 0) {
    return {
      passed: false,
      failureClass: 'exp-not-run',
      causes: [cause('sample', 'dataset', '先跑一次采样，拿到这一组参数的数据。')],
      metrics,
    };
  }
  if (datasetN > MAX_MATCHES) {
    return {
      passed: false,
      failureClass: 'exp-not-run',
      causes: [cause('sample', 'dataset', '采样局数超出这一关的上限。', { n: datasetN, max: MAX_MATCHES })],
      metrics,
    };
  }
  metrics.n = datasetN;
  if (datasetN < script.matches) {
    return {
      passed: false,
      failureClass: 'exp-sample-small',
      causes: [cause('sample', 'dataset', '样本还不够：至少跑满 {need} 局。', { need: script.matches, n: datasetN })],
      metrics,
    };
  }

  const result = simulateDuel(script, input.params, input.seed, datasetN);
  metrics.wins = Math.round(result.wins * 100) / 100;
  metrics.winRate = Math.round(result.winRate * 1000) / 1000;
  metrics.ciLow = Math.round(result.ci[0] * 1000) / 1000;
  metrics.ciHigh = Math.round(result.ci[1] * 1000) / 1000;

  const target = input.checkClaim ? script.targets.winRate : script.targets.baselineB;
  if (result.winRate < target) {
    return {
      passed: false,
      failureClass: 'exp-below-baseline',
      causes: [cause('sample', 'params', '这组配置的胜率还没到目标线，再调一调。', {
        got: Math.round(result.winRate * 1000) / 1000,
        target,
      })],
      metrics,
    };
  }
  if (input.checkClaim && result.ci[0] < script.targets.winRateLow) {
    return {
      passed: false,
      failureClass: 'exp-below-baseline',
      causes: [cause('sample', 'dataset', '区间下界还不够高：样本再多一点，或换一组更稳的配置。', {
        low: Math.round(result.ci[0] * 1000) / 1000,
        need: script.targets.winRateLow,
      })],
      metrics,
    };
  }
  if (!input.checkClaim) {
    return { passed: true, causes: [], metrics };
  }

  const claim = input.claim;
  if (!claim || claim.kind !== 'stat' || claim.statistic !== 'proportion') {
    return {
      passed: false,
      failureClass: 'exp-claim-beyond-ci',
      causes: [cause('claim', 'claim', '要用“比例”这个统计量给出结论。')],
      metrics,
    };
  }
  if (claim.n !== datasetN) {
    return {
      passed: false,
      failureClass: 'exp-claim-beyond-ci',
      causes: [cause('claim', 'claim', '结论里的样本量和这次采样的局数对不上。', { claimN: claim.n, n: datasetN })],
      metrics,
    };
  }
  const tolerance = 0.01;
  const inInterval = claim.value >= result.ci[0] - tolerance && claim.value <= result.ci[1] + tolerance;
  if (!inInterval || Math.abs(claim.value - result.winRate) > 0.05) {
    return {
      passed: false,
      failureClass: 'exp-claim-beyond-ci',
      causes: [cause('claim', 'claim', '结论跑出了数据给的区间：用这次数据说话。', {
        value: claim.value,
        low: Math.round(result.ci[0] * 1000) / 1000,
        high: Math.round(result.ci[1] * 1000) / 1000,
      })],
      metrics,
    };
  }
  return { passed: true, causes: [], metrics };
}
