import type { Band, ShippedLevelId, ThreadId } from '@mmf/content/ids';
import { BANDS, THREADS } from '@mmf/content/ids';
import { LEVEL_SUMMARIES, localizedSummary } from '@mmf/content';
import type { LevelSummary } from '@mmf/content';
import type { Locale } from '@mmf/content/ids';
import type { SaveData } from '@mmf/game-kit';

/**
 * 星图与"下一关"的推进逻辑。
 *
 * 内容层目前 20 关的 unlock.after 全是空数组（docs/03 只登记了矩阵，没登记依赖），
 * 所以这里**不做硬锁定**：顺序推荐 + 学段/主线分组。
 * 若将来内容补上 unlock.after，isLevelUnlocked 会立刻生效，星图不用再改。
 */

export interface LevelNode {
  summary: LevelSummary;
  title: string;
  thinkingTarget: string;
  completed: boolean;
  unlocked: boolean;
}

export interface BandGroup {
  band: Band;
  levels: LevelNode[];
  completedCount: number;
}

function completed(save: SaveData | null, id: ShippedLevelId): boolean {
  return save?.levels?.[id]?.completed === true;
}

/** 前置关全部通关才算解锁；unlock.after 为空即默认开放（现状）。 */
export function isLevelUnlocked(save: SaveData | null, level: LevelSummary): boolean {
  const after = level.unlock?.after ?? [];
  if (after.length === 0) return true;
  return after.every((id) => completed(save, id as ShippedLevelId));
}

/** 按内容登记顺序（SHIPPED_LEVEL_IDS）找下一关：第一个"已解锁且未通关"的。 */
export function nextLevelId(
  save: SaveData | null,
  current: ShippedLevelId | null,
): ShippedLevelId | null {
  const start = current === null ? 0 : LEVEL_SUMMARIES.findIndex((level) => level.id === current) + 1;
  const ordered = [...LEVEL_SUMMARIES.slice(Math.max(0, start)), ...LEVEL_SUMMARIES.slice(0, Math.max(0, start))];
  for (const level of ordered) {
    if (level.id === current) continue;
    if (completed(save, level.id)) continue;
    if (!isLevelUnlocked(save, level)) continue;
    return level.id;
  }
  return null;
}

/** 今日推荐：第一个未通关的关卡（不区分学段，按登记顺序）。 */
export function recommendedLevelId(save: SaveData | null): ShippedLevelId | null {
  for (const level of LEVEL_SUMMARIES) {
    if (completed(save, level.id)) continue;
    if (!isLevelUnlocked(save, level)) continue;
    return level.id;
  }
  return null;
}

/** 学段分组（星图的横带）。 */
export function bandGroups(save: SaveData | null, locale: Locale): BandGroup[] {
  const nodes = new Map<Band, LevelNode[]>();
  for (const band of BANDS) nodes.set(band, []);
  for (const summary of LEVEL_SUMMARIES) {
    const localized = localizedSummary(summary, locale);
    nodes.get(summary.band)?.push({
      summary,
      title: localized.title,
      thinkingTarget: localized.thinkingTarget,
      completed: completed(save, summary.id),
      unlocked: isLevelUnlocked(save, summary),
    });
  }
  return BANDS.map((band) => {
    const levels = nodes.get(band) ?? [];
    return { band, levels, completedCount: levels.filter((node) => node.completed).length };
  });
}

/** 主线筛选（星图的纵线）：返回该主线在所有学段的关卡。 */
export function threadLevels(save: SaveData | null, locale: Locale, thread: ThreadId): LevelNode[] {
  const out: LevelNode[] = [];
  for (const summary of LEVEL_SUMMARIES) {
    if (summary.thread !== thread) continue;
    const localized = localizedSummary(summary, locale);
    out.push({
      summary,
      title: localized.title,
      thinkingTarget: localized.thinkingTarget,
      completed: completed(save, summary.id),
      unlocked: isLevelUnlocked(save, summary),
    });
  }
  return out;
}

export { BANDS, THREADS };
