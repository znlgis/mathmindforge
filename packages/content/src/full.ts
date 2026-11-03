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
import g1012StructureInvariantDetail from './details/g1012-structure-invariant.level.json';
import kAlgorithmTrainDetail from './details/k-algorithm-train.level.json';
import g13DataWeatherDetail from './details/g13-data-weather.level.json';
import g46DataInvariantDetail from './details/g46-data-invariant.level.json';
import kModelingShareDetail from './details/k-modeling-share.level.json';
import g13ModelingPackDetail from './details/g13-modeling-pack.level.json';
import g13StructureSymmetryDetail from './details/g13-structure-symmetry.level.json';
import g46StructureTilingDetail from './details/g46-structure-tiling.level.json';
import g46ModelingQueueDetail from './details/g46-modeling-queue.level.json';
import g79DataSamplingDetail from './details/g79-data-sampling.level.json';
import g79StructureNetworkDetail from './details/g79-structure-network.level.json';
import g1012DataInferenceDetail from './details/g1012-data-inference.level.json';
import g79AlgorithmScheduleDetail from './details/g79-algorithm-schedule.level.json';
import type { ShippedLevelId } from './ids';
import type { LevelDetail } from './schema';

export const LEVEL_DETAILS: Record<ShippedLevelId, LevelDetail> = {
  'k-structure-pattern-path': kPatternDetail as LevelDetail,
  'k-data-tally': kDataTallyDetail as LevelDetail,
  'g13-algorithm-route': g13RouteDetail as LevelDetail,
  'g46-algorithm-payment': g46PaymentDetail as LevelDetail,
  'g79-modeling-dispatch': g79DispatchDetail as LevelDetail,
  'g1012-modeling-winrate': g1012WinrateDetail as LevelDetail,
  'g1012-structure-invariant': g1012StructureInvariantDetail as LevelDetail,
  'k-algorithm-train': kAlgorithmTrainDetail as LevelDetail,
  'g13-data-weather': g13DataWeatherDetail as LevelDetail,
  'g46-data-invariant': g46DataInvariantDetail as LevelDetail,
  'k-modeling-share': kModelingShareDetail as LevelDetail,
  'g13-modeling-pack': g13ModelingPackDetail as LevelDetail,
  'g13-structure-symmetry': g13StructureSymmetryDetail as LevelDetail,
  'g46-structure-tiling': g46StructureTilingDetail as LevelDetail,
  'g46-modeling-queue': g46ModelingQueueDetail as LevelDetail,
  'g79-data-sampling': g79DataSamplingDetail as LevelDetail,
  'g79-structure-network': g79StructureNetworkDetail as LevelDetail,
  'g1012-data-inference': g1012DataInferenceDetail as LevelDetail,
  'g79-algorithm-schedule': g79AlgorithmScheduleDetail as LevelDetail,
};
