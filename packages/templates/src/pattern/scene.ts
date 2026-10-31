import type Phaser from 'phaser';
import type { LevelContext, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import {
  BaseScene,
  PALETTE,
  centeredLabel,
  circle,
  dashedRect,
  dashLine,
  roundRect,
  toColor,
} from '@mmf/canvas-kit';
import { PATH_LAYOUT } from '../layout';
import { parseScript } from './logic';
import type { PatternScript } from './schema';

interface TileBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

interface TileState {
  inspected: boolean;
  failed: boolean;
  passed: boolean;
  piece: boolean;
}

const TILE_RADIUS = 12;

function tileBox(index: number): TileBox {
  const x = PATH_LAYOUT.startX + index * (PATH_LAYOUT.cellW + PATH_LAYOUT.gap);
  const y = PATH_LAYOUT.y;
  const w = PATH_LAYOUT.cellW;
  const h = PATH_LAYOUT.cellH;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function stripWidth(length: number): number {
  return length * PATH_LAYOUT.cellW + Math.max(0, length - 1) * PATH_LAYOUT.gap;
}

function tileCenterX(index: number): number {
  return PATH_LAYOUT.startX + index * (PATH_LAYOUT.cellW + PATH_LAYOUT.gap) + PATH_LAYOUT.cellW / 2;
}

/** verdict.failure.causes 的 ref 可能是 "6"、"-1"、"6,7,8"，统一拆成下标。 */
function parseCellRefs(ref: string): number[] {
  const out: number[] = [];
  for (const part of ref.split(/[^0-9]+/)) {
    if (part === '') continue;
    const value = Number.parseInt(part, 10);
    if (Number.isInteger(value)) out.push(value);
  }
  return out;
}

function tokenColor(token: string): string {
  if (token === 'A') return PALETTE.teal;
  if (token === 'B') return PALETTE.brass;
  return PALETTE.ink;
}

/** A 是圆、B 是圆角方；construct 传来的 palette shape（round/square）也认。 */
function tokenShape(token: string): 'circle' | 'square' {
  const normalized = token.toLowerCase();
  if (normalized === 'a' || normalized === 'round' || normalized === 'circle') return 'circle';
  return 'square';
}

function tokenCaption(token: string): string {
  return token.length <= 2 ? token : '?';
}

/**
 * 模式关画布：一条 12 格的纸带。
 * 只读 runtime 快照重绘，不接管指针；所有动作由 ToolDock 派发。
 */
class PatternScene extends BaseScene {
  private readonly runtime: LevelRuntime;
  private script: PatternScript | null = null;
  private strip: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastSignature = '';

  constructor(ctx: LevelContext, runtime: LevelRuntime) {
    super(ctx.manifest.id, ctx);
    this.runtime = runtime;
  }

  create(): void {
    this.script = parseScript(this.ctx.detail.levelScript);
    this.lastSignature = '';
    this.drawPaperBackground();
    this.add
      .text(26, 160, '先点几格，看看它是怎么重复的。', {
        fontFamily: '"Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontSize: '20px',
        color: PALETTE.inkSoft,
      })
      .setDepth(1);
    this.add
      .text(this.W - 26, 160, '一条被踩乱的积木路', {
        fontFamily: '"Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontSize: '15px',
        color: PALETTE.brass,
      })
      .setOrigin(1, 0)
      .setDepth(1);
    this.strip = this.add.container(0, 0).setDepth(10);

    this.unsubscribe = this.runtime.subscribe((snapshot) => this.render(snapshot));
    this.onShutdownCleanup(() => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });

    this.render(this.runtime.snapshot());
  }

  private render(snapshot: RunSnapshot): void {
    const strip = this.strip;
    const script = this.script;
    if (!strip || !script) return;

    const signature = this.signatureOf(snapshot);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.tweens.killTweensOf(strip.list);
    strip.removeAll(true);

    const visible = script.scenario.visible;
    const length = Math.max(script.scenario.length, visible.length);
    const inspected = new Set(snapshot.toolState.pattern?.inspected ?? []);
    const pieces = new Map<number, string>();
    for (const piece of snapshot.toolState.construct?.pieces ?? []) {
      if (Number.isInteger(piece.x)) pieces.set(piece.x, piece.shape);
    }
    const failed = this.failedCells(snapshot);
    const passed = snapshot.lastRun?.outcome === 'pass';

    this.drawStrip(length, passed);

    for (let index = 0; index < length; index += 1) {
      const piece = pieces.get(index);
      const token = piece ?? visible[index] ?? null;
      const tile = this.add.container(0, 0);
      this.paintTile(tile, index, token, {
        inspected: inspected.has(index),
        failed: failed.has(index),
        passed,
        piece: piece !== undefined,
      });
      strip.add(tile);
      this.reveal(tile, Math.min(index * 18, 180));
    }

    if (passed && length > 0) this.drawWalker(length);
  }

  private signatureOf(snapshot: RunSnapshot): string {
    const pattern = snapshot.toolState.pattern;
    const pieces = snapshot.toolState.construct?.pieces ?? [];
    const causes = snapshot.verdict?.failure?.causes ?? [];
    return [
      snapshot.phase,
      String(snapshot.revision),
      (pattern?.inspected ?? []).join(','),
      pattern?.cycle?.join('') ?? '',
      pattern?.committed ? 'committed' : 'open',
      pieces.map((piece) => `${piece.x}:${piece.shape}`).join(','),
      snapshot.lastRun?.id ?? '',
      snapshot.lastRun?.outcome ?? '',
      causes.map((cause) => `${cause.kind}:${cause.ref}`).join(';'),
    ].join('|');
  }

  private failedCells(snapshot: RunSnapshot): Set<number> {
    const cells = new Set<number>();
    if (snapshot.lastRun?.outcome !== 'fail') return cells;
    for (const cause of snapshot.verdict?.failure?.causes ?? []) {
      if (cause.kind !== 'cell') continue;
      for (const index of parseCellRefs(cause.ref)) cells.add(index);
    }
    return cells;
  }

  private drawStrip(length: number, passed: boolean): void {
    const strip = this.strip;
    if (!strip) return;
    const total = stripWidth(length);
    const g = this.add.graphics();
    roundRect(g, PATH_LAYOUT.startX - 18, PATH_LAYOUT.y - 34, total + 36, PATH_LAYOUT.cellH + 68, {
      fill: PALETTE.card,
      fillAlpha: 0.62,
      stroke: passed ? PALETTE.teal : PALETTE.grid,
      lineWidth: passed ? 2 : 1.5,
      radius: 20,
    });
    dashLine(
      g,
      PATH_LAYOUT.startX - 6,
      PATH_LAYOUT.y + PATH_LAYOUT.cellH + 30,
      PATH_LAYOUT.startX + total + 6,
      PATH_LAYOUT.y + PATH_LAYOUT.cellH + 30,
      {
        color: passed ? PALETTE.teal : PALETTE.grid,
        lineWidth: 2,
        dash: 10,
        gap: 8,
        alpha: 0.7,
      },
    );
    strip.add(g);
  }

  private paintTile(
    target: Phaser.GameObjects.Container,
    index: number,
    token: string | null,
    state: TileState,
  ): void {
    const box = tileBox(index);
    const tile = this.add.graphics();
    const stroke = state.failed ? PALETTE.red : state.passed ? PALETTE.teal : PALETTE.grid;
    const strokeWidth = state.failed ? 2.5 : state.passed ? 2 : 1.5;

    if (token === null) {
      roundRect(tile, box.x, box.y, box.w, box.h, {
        fill: PALETTE.paper,
        fillAlpha: 0.7,
        radius: TILE_RADIUS,
      });
      dashedRect(tile, box.x + 2, box.y + 2, box.w - 4, box.h - 4, {
        color: state.failed ? PALETTE.red : PALETTE.blueprint,
        lineWidth: 2,
        dash: 8,
        gap: 6,
        alpha: state.failed ? 1 : 0.8,
      });
    } else {
      roundRect(tile, box.x, box.y, box.w, box.h, {
        fill: PALETTE.card,
        stroke,
        lineWidth: strokeWidth,
        radius: TILE_RADIUS,
      });
      this.paintTokenShape(tile, token, box, state.passed);
    }
    target.add(tile);

    const caption = token === null ? '?' : tokenCaption(token);
    const text = centeredLabel(this, box.cx, box.cy, caption, {
      size: 20,
      bold: true,
      color: token === null ? PALETTE.inkSoft : tokenColor(token),
    });
    target.add(text);

    // 下标贴纸：ToolDock 的 index 与画布一一对应
    const indexText = centeredLabel(this, box.cx, box.y + box.h + 16, String(index + 1), {
      size: 11,
      color: PALETTE.inkSoft,
    });
    target.add(indexText);

    if (state.inspected) {
      const ring = this.add.graphics();
      roundRect(ring, box.x - 5, box.y - 5, box.w + 10, box.h + 10, {
        stroke: state.failed ? PALETTE.red : PALETTE.blueprint,
        lineWidth: 3,
        radius: TILE_RADIUS + 5,
      });
      target.add(ring);
    }

    if (state.piece) {
      const mark = this.add.graphics();
      roundRect(mark, box.x + box.w - 14, box.y + 6, 8, 8, {
        fill: PALETTE.brass,
        radius: 4,
      });
      target.add(mark);
    }

    if (state.failed) this.paintFailure(target, box);
  }

  private paintTokenShape(
    g: Phaser.GameObjects.Graphics,
    token: string,
    box: TileBox,
    passed: boolean,
  ): void {
    const half = 17;
    const tint = passed ? PALETTE.teal : tokenColor(token);
    if (tokenShape(token) === 'circle') {
      circle(g, box.cx, box.cy, half, {
        fill: tint,
        fillAlpha: 0.18,
        stroke: tint,
        lineWidth: 2.5,
      });
      return;
    }
    roundRect(g, box.cx - half, box.cy - half, half * 2, half * 2, {
      fill: tint,
      fillAlpha: 0.18,
      stroke: tint,
      lineWidth: 2.5,
      radius: 9,
    });
  }

  private paintFailure(target: Phaser.GameObjects.Container, box: TileBox): void {
    const g = this.add.graphics();
    // 红色下划线
    roundRect(g, box.x + 8, box.y + box.h - 12, box.w - 16, 3, {
      fill: PALETTE.red,
      radius: 1.5,
    });
    // 红色裂纹
    g.lineStyle(2, toColor(PALETTE.red), 0.9);
    g.lineBetween(box.x + 14, box.y + 12, box.cx + 2, box.y + box.h * 0.38);
    g.lineBetween(box.cx + 2, box.y + box.h * 0.38, box.cx - 4, box.y + box.h * 0.62);
    g.lineBetween(box.cx - 4, box.y + box.h * 0.62, box.x + box.w - 14, box.y + box.h - 16);
    target.add(g);
  }

  private drawWalker(length: number): void {
    const strip = this.strip;
    if (!strip) return;
    const endX = tileCenterX(length - 1);
    const startX = tileCenterX(0);
    const walker = this.add.container(endX, PATH_LAYOUT.y - 24);

    const g = this.add.graphics();
    circle(g, 0, 0, 10, {
      fill: PALETTE.teal,
      fillAlpha: 0.9,
      stroke: PALETTE.ink,
      lineWidth: 1.5,
    });
    g.lineStyle(2, toColor(PALETTE.ink), 1);
    g.lineBetween(-4, 9, -6, 17);
    g.lineBetween(4, 9, 6, 17);
    walker.add(g);
    strip.add(walker);

    if (this.reducedMotion) {
      walker.setX(endX);
      return;
    }
    walker.setX(startX);
    this.tweens.add({
      targets: walker,
      x: endX,
      duration: 720,
      delay: 140,
      ease: 'Sine.easeInOut',
    });
  }
}

export function createPatternScene(
  ctx: LevelContext,
  runtime: LevelRuntime,
): Phaser.Types.Scenes.SceneType {
  return new PatternScene(ctx, runtime);
}
