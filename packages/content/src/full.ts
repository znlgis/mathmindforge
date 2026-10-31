/** 只给 Node CLI 与测试：包含 zod schema 与全部已发布详情。 */
export * from './ids';
export * from './schema';
export { LEVEL_SUMMARIES } from './summaries';

import kPatternDetail from './details/k-structure-pattern-path.level.json';
import type { ShippedLevelId } from './ids';
import type { LevelDetail } from './schema';

export const LEVEL_DETAILS: Record<ShippedLevelId, LevelDetail> = {
  'k-structure-pattern-path': kPatternDetail as LevelDetail,
};
