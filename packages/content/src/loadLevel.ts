import type { Locale, ShippedLevelId } from './ids';
import type { LevelDetail } from './schema';
import { getLevelSummary } from './summaries';

/**
 * 详情走动态 import：Vite 会把每个 <id>.level.json 切成独立 chunk。
 * 运行时不做 zod 校验（构建期 content:check 负责）；只做 id 一致性断言。
 */
const LOADERS: Record<ShippedLevelId, () => Promise<unknown>> = {
  'k-structure-pattern-path': () => import('./details/k-structure-pattern-path.level.json'),
  'k-data-tally': () => import('./details/k-data-tally.level.json'),
  'g13-algorithm-route': () => import('./details/g13-algorithm-route.level.json'),
  'g46-algorithm-payment': () => import('./details/g46-algorithm-payment.level.json'),
  'g79-modeling-dispatch': () => import('./details/g79-modeling-dispatch.level.json'),
  'g1012-modeling-winrate': () => import('./details/g1012-modeling-winrate.level.json'),
  'g1012-structure-invariant': () => import('./details/g1012-structure-invariant.level.json'),
  'k-algorithm-train': () => import('./details/k-algorithm-train.level.json'),
  'g13-data-weather': () => import('./details/g13-data-weather.level.json'),
  'g46-data-invariant': () => import('./details/g46-data-invariant.level.json'),
  'k-modeling-share': () => import('./details/k-modeling-share.level.json'),
  'g13-modeling-pack': () => import('./details/g13-modeling-pack.level.json'),
  'g13-structure-symmetry': () => import('./details/g13-structure-symmetry.level.json'),
  'g46-structure-tiling': () => import('./details/g46-structure-tiling.level.json'),
  'g46-modeling-queue': () => import('./details/g46-modeling-queue.level.json'),
  'g79-data-sampling': () => import('./details/g79-data-sampling.level.json'),
  'g79-structure-network': () => import('./details/g79-structure-network.level.json'),
  'g1012-data-inference': () => import('./details/g1012-data-inference.level.json'),
  'g79-algorithm-schedule': () => import('./details/g79-algorithm-schedule.level.json'),
};

export async function loadLevel(
  id: ShippedLevelId,
  _locale: Locale = 'zh-CN',
): Promise<LevelDetail | null> {
  const summary = getLevelSummary(id);
  if (!summary) return null;
  const loader = LOADERS[id];
  if (!loader) return null;
  const raw = (await loader()) as { default?: unknown } | unknown;
  const detail = (raw && typeof raw === 'object' && 'default' in raw ? raw.default : raw) as LevelDetail;
  if (detail.id !== id) throw new Error('关卡详情 id 不一致：' + id);
  return detail;
}
