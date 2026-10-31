import type { LevelModule, ShippedLevelId } from '@mmf/game-kit';

export type LevelLoader = () => Promise<{ default: LevelModule }>;

/** 只登记已发布关卡；Record 少一条 typecheck 就报 */
export const registry: Record<ShippedLevelId, LevelLoader> = {
  'k-structure-pattern-path': () => import('@mmf/game-forge/k-structure-pattern-path'),
};
