import type { Locale, ShippedLevelId } from './ids';
import { SHIPPED_LEVEL_IDS } from './ids';
import type { LevelSummary } from './schema';

import kPatternPath from './levels/k-structure-pattern-path.json';
import kDataTally from './levels/k-data-tally.json';
import g13Route from './levels/g13-algorithm-route.json';
import g46Payment from './levels/g46-algorithm-payment.json';
import g79Dispatch from './levels/g79-modeling-dispatch.json';
import g1012Winrate from './levels/g1012-modeling-winrate.json';
import g1012StructureInvariant from './levels/g1012-structure-invariant.json';
import kAlgorithmTrain from './levels/k-algorithm-train.json';
import g13DataWeather from './levels/g13-data-weather.json';
import g46DataInvariant from './levels/g46-data-invariant.json';
import kModelingShare from './levels/k-modeling-share.json';
import g13ModelingPack from './levels/g13-modeling-pack.json';
import g13StructureSymmetry from './levels/g13-structure-symmetry.json';
import g46StructureTiling from './levels/g46-structure-tiling.json';
import g46ModelingQueue from './levels/g46-modeling-queue.json';
import g79DataSampling from './levels/g79-data-sampling.json';
import g79StructureNetwork from './levels/g79-structure-network.json';
import g1012DataInference from './levels/g1012-data-inference.json';
import g79AlgorithmSchedule from './levels/g79-algorithm-schedule.json';
import g1012AlgorithmFrontier from './levels/g1012-algorithm-frontier.json';

/**
 * 摘要表：只静态加载已发布关卡，随 SHIPPED_LEVEL_IDS 增补。
 * 运行时不跑 zod（构建期由 content:check 校验），否则 zod 会进首屏。
 *
 * 键类型是 ShippedLevelId 而不是 string：少登记一关 typecheck 就报，
 * 不用等到运行时才由下面的 throw 兜底。
 */
const RAW: Record<ShippedLevelId, unknown> = {
  'k-structure-pattern-path': kPatternPath,
  'k-data-tally': kDataTally,
  'g13-algorithm-route': g13Route,
  'g46-algorithm-payment': g46Payment,
  'g79-modeling-dispatch': g79Dispatch,
  'g1012-modeling-winrate': g1012Winrate,
  'g1012-structure-invariant': g1012StructureInvariant,
  'k-algorithm-train': kAlgorithmTrain,
  'g13-data-weather': g13DataWeather,
  'g46-data-invariant': g46DataInvariant,
  'k-modeling-share': kModelingShare,
  'g13-modeling-pack': g13ModelingPack,
  'g13-structure-symmetry': g13StructureSymmetry,
  'g46-structure-tiling': g46StructureTiling,
  'g46-modeling-queue': g46ModelingQueue,
  'g79-data-sampling': g79DataSampling,
  'g79-structure-network': g79StructureNetwork,
  'g1012-data-inference': g1012DataInference,
  'g79-algorithm-schedule': g79AlgorithmSchedule,
  'g1012-algorithm-frontier': g1012AlgorithmFrontier,
};

export const LEVEL_SUMMARIES: readonly LevelSummary[] = SHIPPED_LEVEL_IDS.map((id) => {
  const summary = RAW[id] as LevelSummary | undefined;
  if (!summary) throw new Error('缺少关卡摘要：' + id);
  if (summary.id !== id) throw new Error('关卡摘要 id 不一致：' + id);
  return summary;
});

const byId = new Map<LevelSummary['id'], LevelSummary>(LEVEL_SUMMARIES.map((s) => [s.id, s]));

/**
 * 未发布 / 未知 id 一律返回 undefined（调用方回星图，不白屏）。
 * 入参保留 string：路由参数是 string，这里做一次收窄即可，不必让调用方先断言。
 *
 * locale 目前不影响返回值：摘要的英文是内联字段（titleEn / thinkingTargetEn），
 * 由 localize.ts 的 localizedSummary 按 locale 取值。保留参数是为了将来
 * 真的改成"英文补丁单独 chunk"时，外壳不用改签名（docs/02 §7.2 的方案）。
 */
export function getLevelSummary(id: string, _locale: Locale = 'zh-CN'): LevelSummary | undefined {
  return byId.get(id as LevelSummary['id']);
}

/** 同上：locale 只影响 localize 取值，这里返回完整摘要让调用方自己本地化。 */
export function levelSummaries(_locale: Locale = 'zh-CN'): readonly LevelSummary[] {
  return LEVEL_SUMMARIES;
}

/**
 * 摘要随模块静态打包，没有异步要等的东西。
 * 保留接口是为了外壳"先 await 内容再渲染"的纪律（docs/02 §12 第 2 条）。
 */
export async function ensureSummaries(_locale: Locale): Promise<void> {
  // 无操作：摘要已在模块加载时全部就位。
}
