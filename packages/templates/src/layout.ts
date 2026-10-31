/** 关卡设计尺寸：横向工坊台，手机竖屏时画布在上、工具台在下 */
export const DESIGN = { width: 900, height: 560 } as const;

/**
 * 模式关的路径布局（纯常量，不 import Phaser）。
 * e2e 或后续真实指针测试可以安全 import 这个文件。
 */
export const PATH_LAYOUT = {
  startX: 70,
  y: 320,
  cellW: 56,
  cellH: 76,
  gap: 8,
  headerH: 84,
} as const;
