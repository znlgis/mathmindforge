import type { Locale } from './ids';
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

/**
 * 摘要表：只静态加载已发布关卡。M0 只有一关；M1/M2 随 SHIPPED_LEVEL_IDS 增补。
 * 运行时不跑 zod（构建期由 content:check 校验），否则 zod 会进首屏。
 */
const RAW: Record<string, unknown> = {
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
};

export const LEVEL_SUMMARIES: readonly LevelSummary[] = SHIPPED_LEVEL_IDS.map((id) => {
  const summary = RAW[id] as LevelSummary | undefined;
  if (!summary) throw new Error('缺少关卡摘要：' + id);
  if (summary.id !== id) throw new Error('关卡摘要 id 不一致：' + id);
  return summary;
});

const byId = new Map<LevelSummary['id'], LevelSummary>(LEVEL_SUMMARIES.map((s) => [s.id, s]));

export function getLevelSummary(id: string, _locale: Locale = 'zh-CN'): LevelSummary | undefined {
  return byId.get(id as LevelSummary['id']);
}

export function levelSummaries(_locale: Locale = 'zh-CN'): readonly LevelSummary[] {
  return LEVEL_SUMMARIES;
}

export async function ensureSummaries(_locale: Locale): Promise<void> {
  // M0 只有中文内容；英文补丁在 v0.9 接入。保留接口，避免外壳改签名。
}
