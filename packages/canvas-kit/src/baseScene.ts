import Phaser from 'phaser';
import type { LevelContext } from '@mmf/game-kit';
import { label } from './draw';
import { PALETTE, toColor } from './theme';

export type CleanupFn = () => void;

/** 与模板 layout 的 headerH 对齐；canvas-kit 不反向依赖 templates。 */
export const CANVAS_HEADER_HEIGHT = 84;

/** 纸张背景上的细网格步长（纯装饰，不参与命中）。 */
const PAPER_GRID_STEP = 32;

interface AlphaTarget {
  setAlpha(value: number): unknown;
}

/**
 * 关卡画布的公共底座：纸张背景、表头、关机清理、减弱动态。
 * 子类在 create 里画自己的内容，并把需要在 shutdown/destroy 时解绑的逻辑交给
 * onShutdownCleanup（场景重启后 init 会重置状态）。
 */
export abstract class BaseScene extends Phaser.Scene {
  protected readonly ctx: LevelContext;
  private readonly cleanups: CleanupFn[] = [];
  private cleanedUp = false;

  constructor(key: string, ctx: LevelContext) {
    super(key);
    this.ctx = ctx;
  }

  /** 设计宽度（与 createPhaserGame 的 designSize 一致）。 */
  get W(): number {
    return this.ctx.manifest.designSize.width;
  }

  /** 设计高度（与 createPhaserGame 的 designSize 一致）。 */
  get H(): number {
    return this.ctx.manifest.designSize.height;
  }

  protected get headerHeight(): number {
    return CANVAS_HEADER_HEIGHT;
  }

  /** 用户在系统里要求减少动态效果时，子类不要跑补间。 */
  protected get reducedMotion(): boolean {
    return this.ctx.reducedMotion;
  }

  /**
   * Phaser 在 create 之前调用 init；此时 sys.events 已经可用。
   * 只在这里挂生命周期监听，子类不应覆盖 init。
   */
  init(): void {
    this.cleanedUp = false;
    this.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, this.flushCleanups, this);
    this.sys.events.once(Phaser.Scenes.Events.DESTROY, this.flushCleanups, this);
  }

  /** 纸张底色 + 轻微网格 + 表头分隔线；返回的 Graphics 由场景显示列表托管。 */
  protected drawPaperBackground(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.setDepth(-10);
    g.fillStyle(toColor(PALETTE.paper), 1);
    g.fillRect(0, 0, this.W, this.H);

    g.lineStyle(1, toColor(PALETTE.grid), 0.35);
    for (let x = PAPER_GRID_STEP; x < this.W; x += PAPER_GRID_STEP) {
      g.lineBetween(x, 0, x, this.H);
    }
    for (let y = PAPER_GRID_STEP; y < this.H; y += PAPER_GRID_STEP) {
      g.lineBetween(0, y, this.W, y);
    }

    // 表头与画布内容的分界：双线（细）让纸面像一张工作图纸。
    g.lineStyle(1, toColor(PALETTE.grid), 1);
    g.lineBetween(0, this.headerHeight, this.W, this.headerHeight);
    g.lineStyle(2, toColor(PALETTE.blueprint), 0.18);
    g.lineBetween(0, this.headerHeight + 2, this.W, this.headerHeight + 2);
    return g;
  }

  /** 卡片式表头：左侧书脊 + 标题 + 铜色短横线。返回标题 Text 方便加副标题。 */
  protected drawHeader(text: string): Phaser.GameObjects.Text {
    const height = this.headerHeight;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(toColor(PALETTE.card), 1);
    g.fillRect(0, 0, this.W, height);
    g.fillStyle(toColor(PALETTE.blueprint), 1);
    g.fillRect(0, 20, 6, height - 40);

    const title = label(this, 26, height / 2 - 2, text, {
      size: 24,
      color: PALETTE.ink,
      bold: true,
      depth: 1,
    });

    g.fillStyle(toColor(PALETTE.brass), 1);
    g.fillRect(26, height - 18, 42, 3);
    return title;
  }

  /** shutdown/destroy 时按注册顺序执行一次；重复调用安全。 */
  protected onShutdownCleanup(fn: CleanupFn): void {
    if (this.cleanedUp) {
      fn();
      return;
    }
    this.cleanups.push(fn);
  }

  /**
   * 入场淡入；reducedMotion 下直接落到终态。
   * target 只需实现 setAlpha，Graphics / Text / Container 都满足。
   */
  protected reveal(target: AlphaTarget, delay = 0): void {
    if (this.reducedMotion) {
      target.setAlpha(1);
      return;
    }
    target.setAlpha(0);
    this.tweens.add({
      targets: target,
      alpha: 1,
      delay,
      duration: 220,
      ease: 'Sine.easeOut',
    });
  }

  private flushCleanups(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    const pending = this.cleanups.splice(0, this.cleanups.length);
    for (const fn of pending) fn();
  }
}
