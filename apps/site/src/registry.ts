import type { LevelModule, ShippedLevelId } from '@mmf/game-kit';

export type LevelLoader = () => Promise<{ default: LevelModule }>;

/** 只登记已发布关卡；Record 少一条 typecheck 就报 */
export const registry: Record<ShippedLevelId, LevelLoader> = {
  'k-structure-pattern-path': () => import('@mmf/game-forge/k-structure-pattern-path'),
  'k-data-tally': () => import('@mmf/game-forge/k-data-tally'),
  'g13-algorithm-route': () => import('@mmf/game-forge/g13-algorithm-route'),
  'g46-algorithm-payment': () => import('@mmf/game-forge/g46-algorithm-payment'),
  'g79-modeling-dispatch': () => import('@mmf/game-forge/g79-modeling-dispatch'),
  'g1012-modeling-winrate': () => import('@mmf/game-forge/g1012-modeling-winrate'),
  'g1012-structure-invariant': () => import('@mmf/game-forge/g1012-structure-invariant'),
};
