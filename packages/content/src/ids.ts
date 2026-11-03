/**
 * 常量层：不含 zod、不含 JSX、不含任何内容 JSON。
 * 外壳、工具、运行时都从这里取 id，避免把 zod 拖进首屏或单测。
 */

export const LOCALES = ['zh-CN', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';

export const BANDS = ['k', 'g13', 'g46', 'g79', 'g1012'] as const;
export type Band = (typeof BANDS)[number];

export const THREADS = ['structure', 'algorithm', 'modeling', 'data'] as const;
export type ThreadId = (typeof THREADS)[number];

export const TOOL_IDS = ['pattern', 'rule', 'construct', 'knob', 'probe', 'counter'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TEMPLATE_IDS = ['pattern', 'rule', 'construct', 'simulate', 'experiment', 'argue'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const STAMP_IDS = ['constraint', 'simple', 'transfer', 'argument'] as const;
export type StampId = (typeof STAMP_IDS)[number];

export const EVIDENCE_PHASES = [
  'observe', 'hypothesize', 'construct', 'run', 'result', 'revise', 'generalize', 'argue',
] as const;
export type EvidencePhase = (typeof EVIDENCE_PHASES)[number];

export const VARIANT_AXES = ['structure', 'representation', 'constraint', 'transfer'] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number];

/** 20 关目标矩阵：内容层唯一事实来源 */
export const LEVEL_IDS = [
  'k-structure-pattern-path',
  'k-algorithm-train',
  'k-modeling-share',
  'k-data-tally',
  'g13-structure-symmetry',
  'g13-algorithm-route',
  'g13-modeling-pack',
  'g13-data-weather',
  'g46-structure-tiling',
  'g46-algorithm-payment',
  'g46-modeling-queue',
  'g46-data-invariant',
  'g79-structure-network',
  'g79-algorithm-schedule',
  'g79-modeling-dispatch',
  'g79-data-sampling',
  'g1012-structure-invariant',
  'g1012-algorithm-frontier',
  'g1012-modeling-winrate',
  'g1012-data-inference',
] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

/** M0 只发布这一关；M1 扩到 6 关、M2 扩到 20 关 */
export const SHIPPED_LEVEL_IDS = [
  'k-structure-pattern-path',
  'k-data-tally',
  'g13-algorithm-route',
  'g46-algorithm-payment',
  'g79-modeling-dispatch',
  'g1012-modeling-winrate',
  'g1012-structure-invariant',
  'k-algorithm-train',
  'g13-data-weather',
  'g46-data-invariant',
  'k-modeling-share',
  'g13-modeling-pack',
  'g13-structure-symmetry',
  'g46-structure-tiling',
  'g46-modeling-queue',
  'g79-data-sampling',
  'g79-structure-network',
] as const;
export type ShippedLevelId = (typeof SHIPPED_LEVEL_IDS)[number];

export const BADGE_IDS = [
  'observer', 'pattern-spotter', 'rule-designer', 'builder', 'modeler',
  'experimenter', 'boundary-explorer', 'reviser', 'transferer',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export const BAND_LABELS: Record<Band, string> = {
  k: '幼儿园', g13: '小学低段', g46: '小学高段', g79: '初中', g1012: '高中',
};

export const THREAD_LABELS: Record<ThreadId, string> = {
  structure: '结构与模式', algorithm: '算法与构造', modeling: '建模与优化', data: '数据与系统',
};

export const TOOL_LABELS: Record<ToolId, string> = {
  pattern: '模式卡', rule: '规则卡', construct: '构造块',
  knob: '参数旋钮', probe: '数据采集器', counter: '反例探测器',
};
