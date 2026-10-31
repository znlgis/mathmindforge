import type { Locale } from './ids';
import { SHIPPED_LEVEL_IDS } from './ids';
import type { LevelSummary } from './schema';

import kPatternPath from './levels/k-structure-pattern-path.json';

/**
 * 摘要表：只静态加载已发布关卡。M0 只有一关；M1/M2 随 SHIPPED_LEVEL_IDS 增补。
 * 运行时不跑 zod（构建期由 content:check 校验），否则 zod 会进首屏。
 */
const RAW: Record<string, unknown> = {
  'k-structure-pattern-path': kPatternPath,
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
