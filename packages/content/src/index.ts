/**
 * 外壳侧入口：常量 / 摘要 + 动态详情加载。
 * 刻意不导出 zod schema：zod 是真实副作用，只要主入口引用它就会进首屏。
 * 需要构建期校验的地方走 '@mmf/content/full'。
 */
export * from './ids';
export type { LevelDetail, LevelSummary, ToolSpec } from './schema';
export { LEVEL_SUMMARIES, getLevelSummary, levelSummaries, ensureSummaries } from './summaries';
export { loadLevel } from './loadLevel';
export { localizedDetail, localizedSummary } from './localize';
export type { LocalizedDetail, LocalizedSummary } from './localize';
