/** 只给 Node CLI 与测试：包含 zod schema 与全部已发布详情。 */
export * from './ids';
export * from './schema';
export { LEVEL_SUMMARIES } from './summaries';

import kPatternDetail from './details/k-structure-pattern-path.level.json';
import kDataTallyDetail from './details/k-data-tally.level.json';
import g13RouteDetail from './details/g13-algorithm-route.level.json';
import g46PaymentDetail from './details/g46-algorithm-payment.level.json';
import g79DispatchDetail from './details/g79-modeling-dispatch.level.json';
import g1012WinrateDetail from './details/g1012-modeling-winrate.level.json';
import type { ShippedLevelId } from './ids';
import type { LevelDetail } from './schema';

export const LEVEL_DETAILS: Record<ShippedLevelId, LevelDetail> = {
  'k-structure-pattern-path': kPatternDetail as LevelDetail,
  'k-data-tally': kDataTallyDetail as LevelDetail,
  'g13-algorithm-route': g13RouteDetail as LevelDetail,
  'g46-algorithm-payment': g46PaymentDetail as LevelDetail,
  'g79-modeling-dispatch': g79DispatchDetail as LevelDetail,
  'g1012-modeling-winrate': g1012WinrateDetail as LevelDetail,
};
