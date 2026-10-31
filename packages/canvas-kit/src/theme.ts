/**
 * 画布主题（与 Tailwind token 同名）。
 * 只放常量与纯函数，不 import Phaser runtime，避免主题被拖进首屏。
 */

export const PALETTE = {
  paper: '#f7f1e6',
  card: '#fffdf8',
  ink: '#22303c',
  inkSoft: '#5b6b78',
  blueprint: '#1f4e6b',
  brass: '#b07d2b',
  teal: '#2f7d78',
  red: '#b4473f',
  grid: '#d8e2e8',
} as const;

export type PaletteColor = keyof typeof PALETTE;

/** 拉丁优先；中文回落到 Noto / PingFang / 雅黑，避免全角弯引号。 */
export const FONT_FAMILY =
  '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

/** 画布上允许的字号档位，避免组件各写各的魔数。 */
export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
} as const;

/**
 * 把主题里的 #rrggbb 字符串转成 Phaser Graphics 需要的 0xrrggbb。
 * 数字原样返回，方便调用方直接传 Phaser 常量。
 */
export function toColor(value: string | number): number {
  if (typeof value === 'number') return value;
  const raw = value.trim().replace(/^#/, '');
  const hex = raw.length === 3 ? raw.replace(/./g, (char) => char + char) : raw;
  const parsed = Number.parseInt(hex, 16);
  return Number.isNaN(parsed) ? 0x000000 : parsed;
}

/**
 * 文本样式工厂：字号用 px 数字，颜色用主题 hex，粗体开关。
 * 返回结构可直接传给 scene.add.text 或 Text#setStyle。
 */
export function textStyle(
  size: number,
  color: string = PALETTE.ink,
  bold = false,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
  };
}
