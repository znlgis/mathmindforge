/**
 * 画布绘制助手：所有块、卡片、虚线框都走这里。
 * 只依赖 Phaser 类型，不 import Phaser runtime（调用方已经在场景里）。
 */
import type Phaser from 'phaser';
import { PALETTE, textStyle, toColor } from './theme';

export interface RoundRectOptions {
  fill?: string | number;
  fillAlpha?: number;
  stroke?: string | number;
  strokeAlpha?: number;
  lineWidth?: number;
  radius?: number;
}

/** 圆角矩形：先填后描边，两者都可省略。 */
export function roundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: RoundRectOptions = {},
): void {
  const radius = opts.radius ?? 12;
  if (opts.fill !== undefined) {
    g.fillStyle(toColor(opts.fill), opts.fillAlpha ?? 1);
    g.fillRoundedRect(x, y, w, h, radius);
  }
  if (opts.stroke !== undefined) {
    g.lineStyle(opts.lineWidth ?? 2, toColor(opts.stroke), opts.strokeAlpha ?? 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
}

export interface CircleOptions {
  fill?: string | number;
  fillAlpha?: number;
  stroke?: string | number;
  strokeAlpha?: number;
  lineWidth?: number;
}

/** 圆形：与 roundRect 同参数的填/描边。 */
export function circle(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  radius: number,
  opts: CircleOptions = {},
): void {
  if (opts.fill !== undefined) {
    g.fillStyle(toColor(opts.fill), opts.fillAlpha ?? 1);
    g.fillCircle(cx, cy, radius);
  }
  if (opts.stroke !== undefined) {
    g.lineStyle(opts.lineWidth ?? 2, toColor(opts.stroke), opts.strokeAlpha ?? 1);
    g.strokeCircle(cx, cy, radius);
  }
}

export interface DashOptions {
  color?: string | number;
  alpha?: number;
  lineWidth?: number;
  dash?: number;
  gap?: number;
}

/** 一条虚线（调用方自己先 lineStyle 也可以，这里统一处理）。 */
export function dashLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: DashOptions = {},
): void {
  g.lineStyle(opts.lineWidth ?? 2, toColor(opts.color ?? PALETTE.blueprint), opts.alpha ?? 1);
  traceDashed(g, x1, y1, x2, y2, Math.max(2, opts.dash ?? 9), Math.max(2, opts.gap ?? 6));
}

/** 虚线矩形：断开格 / 待修补区域的统一视觉。 */
export function dashedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: DashOptions = {},
): void {
  g.lineStyle(opts.lineWidth ?? 2, toColor(opts.color ?? PALETTE.blueprint), opts.alpha ?? 1);
  const dash = Math.max(2, opts.dash ?? 9);
  const gap = Math.max(2, opts.gap ?? 6);
  traceDashed(g, x, y, x + w, y, dash, gap);
  traceDashed(g, x + w, y, x + w, y + h, dash, gap);
  traceDashed(g, x + w, y + h, x, y + h, dash, gap);
  traceDashed(g, x, y + h, x, y, dash, gap);
}

function traceDashed(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return;
  const ux = dx / length;
  const uy = dy / length;
  for (let travelled = 0; travelled < length; travelled += dash + gap) {
    const start = travelled;
    const end = Math.min(travelled + dash, length);
    g.lineBetween(
      x1 + ux * start,
      y1 + uy * start,
      x1 + ux * end,
      y1 + uy * end,
    );
  }
}

export interface LabelOptions {
  size?: number;
  color?: string;
  bold?: boolean;
  originX?: number;
  originY?: number;
  depth?: number;
}

/** 左对齐、垂直中线的文字（表头、说明）。 */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: LabelOptions = {},
): Phaser.GameObjects.Text {
  const target = scene.add.text(
    x,
    y,
    text,
    textStyle(opts.size ?? 16, opts.color ?? PALETTE.ink, opts.bold ?? false),
  );
  target.setOrigin(opts.originX ?? 0, opts.originY ?? 0.5);
  if (opts.depth !== undefined) target.setDepth(opts.depth);
  return target;
}

/** 居中的文字（格子里的 A / B / ?）。 */
export function centeredLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: LabelOptions = {},
): Phaser.GameObjects.Text {
  return label(scene, x, y, text, { ...opts, originX: 0.5, originY: 0.5 });
}
