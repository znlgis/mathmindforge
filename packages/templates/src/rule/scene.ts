import type Phaser from 'phaser';
import type {
  LevelAction, LevelContext, LevelRuntime, ProgramBlock, RunSnapshot,
} from '@mmf/game-kit';
import {
  BaseScene, PALETTE, centeredLabel, circle, dashLine, label, roundRect, toColor,
} from '@mmf/canvas-kit';
import { cellKey, executeProgram } from './engine';
import type { RuleTrace } from './engine';
import { parseScript, planRouteClick } from './logic';
import type { RouteClickPlan } from './logic';
import type { Cell, RuleScript } from './schema';

const CELL = 100;
const GAP = 10;
const BOARD_INSET = 16;

function spanOf(count: number): number {
  return count * CELL + Math.max(0, count - 1) * GAP;
}

/** 五角星顶点：不依赖 Phaser 的几何类，纯算术。 */
function starPoints(cx: number, cy: number, outer: number, inner: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

const ARROW_ANGLE = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI } as const;

/**
 * 规则关画布：一张 5×5 的路线图纸。
 * 快照驱动重绘；同时是一条输入路径：点同排/同列的格子会把路线编译成
 * 展开版程序块（rule/place 追加到末尾），与右侧积木按钮产出同一个 program。
 * 本轮去卡片化后只保留这一条输入路径：不再有积木面板。
 */
class RuleScene extends BaseScene {
  private readonly runtime: LevelRuntime;
  private script: RuleScript | null = null;
  private layer: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastSignature = '';
  private originX = 0;
  private originY = 0;
  /** 悬停预览层：点这里会发生什么（虚线 + 箭头 + 转向弧），与重绘层分开。 */
  private hover: Phaser.GameObjects.Graphics | null = null;
  /** 点不中时的短暂高亮层（不弹模态，只闪一下）。 */
  private flash: Phaser.GameObjects.Graphics | null = null;
  /** 一次点击会连发多个 rule/place；派发期间忽略新点击，避免 at 下标打架。 */
  private dispatching = false;
  private clickSeq = 0;

  constructor(ctx: LevelContext, runtime: LevelRuntime) {
    super(ctx.manifest.id, ctx);
    this.runtime = runtime;
  }

  create(): void {
    this.script = parseScript(this.ctx.detail.levelScript);
    this.lastSignature = '';

    this.drawPaperBackground();
    this.drawHeader('路线图纸');
    label(this, this.W - 26, this.headerHeight / 2, '收齐星星 · 开到终点', {
      size: 15,
      color: PALETTE.brass,
      originX: 1,
      depth: 1,
    });

    this.originX = (this.W - spanOf(this.script.grid.width)) / 2;
    this.originY = this.headerHeight + 26;
    this.layer = this.add.container(0, 0).setDepth(10);
    this.hover = this.add.graphics().setDepth(12);
    this.flash = this.add.graphics().setDepth(13);

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('gameout', this.clearHover, this);

    this.unsubscribe = this.runtime.subscribe((snapshot) => this.render(snapshot));
    this.onShutdownCleanup(() => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('gameout', this.clearHover, this);
      this.hover = null;
      this.flash = null;
      this.setCanvasCursor(false);
    });

    this.render(this.runtime.snapshot());
  }

  /* 坐标：格子 (x, y) 的 y 轴向上，屏幕行 = height - 1 - y */
  private centerOf(cell: Cell): { x: number; y: number } {
    const script = this.script;
    const height = script?.grid.height ?? 5;
    return {
      x: this.originX + cell.x * (CELL + GAP) + CELL / 2,
      y: this.originY + (height - 1 - cell.y) * (CELL + GAP) + CELL / 2,
    };
  }

  /** 屏幕点 → 格子：命中格内矩形，点缝里也算最近的格子之外一律 null。 */
  private cellAt(worldX: number, worldY: number): Cell | null {
    const script = this.script;
    if (!script) return null;
    for (let y = 0; y < script.grid.height; y += 1) {
      for (let x = 0; x < script.grid.width; x += 1) {
        const point = this.centerOf({ x, y });
        if (Math.abs(worldX - point.x) <= CELL / 2 + 2 && Math.abs(worldY - point.y) <= CELL / 2 + 2) {
          return { x, y };
        }
      }
    }
    return null;
  }

  /** 从当前快照把「点这一格」编译成路线；悬停和点击用同一份计划，规则自解释。 */
  private planAt(cell: Cell, idPrefix: string): {
    program: ProgramBlock[];
    result: ReturnType<typeof planRouteClick>;
  } | null {
    const script = this.script;
    if (!script) return null;
    const snapshot = this.runtime.snapshot();
    const program = snapshot.toolState.rule?.program ?? [];
    return { program, result: planRouteClick(script, program, cell, { idPrefix }) };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer.worldX, pointer.worldY);
    if (!cell || this.dispatching) return;
    this.clickSeq += 1;
    const planned = this.planAt(cell, 'c' + this.clickSeq);
    if (!planned || !planned.result.ok) {
      // 点车头/不可达：不发动作，只闪一下红环 + 叉（不弹模态）。
      this.flashReject(cell);
      return;
    }
    if (planned.result.plan.blocks.length === 0) return;
    const base = planned.program.length;
    const blocks = planned.result.plan.blocks;
    this.dispatching = true;
    this.hover?.clear();
    void (async () => {
      try {
        for (const [offset, block] of blocks.entries()) {
          const action: LevelAction = {
            type: 'rule/place',
            payload: { block, at: base + offset },
          };
          const result = await this.runtime.dispatch(action);
          if (!result.ok) break;
        }
      } finally {
        this.dispatching = false;
      }
    })();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const hover = this.hover;
    if (!hover) return;
    const cell = this.cellAt(pointer.worldX, pointer.worldY);
    this.setCanvasCursor(cell !== null);
    hover.clear();
    if (!cell) return;
    const planned = this.planAt(cell, 'p');
    if (!planned) return;
    if (!planned.result.ok) {
      this.drawRejectHint(hover, cell);
      return;
    }
    this.drawRoutePreview(hover, planned.result.plan);
  }

  /** 指针离开画布：收掉悬停预览与手型光标。 */
  private clearHover(): void {
    this.hover?.clear();
    this.setCanvasCursor(false);
  }

  /** 让「可点」在鼠标上看得见；触屏没有指针样式，不影响。 */
  private setCanvasCursor(pointer: boolean): void {
    const canvas = this.input.manager?.canvas;
    if (canvas) canvas.style.cursor = pointer ? 'pointer' : 'default';
  }

  /** 悬停预览：虚线 + 箭头 + 转向弧 + 距离，告诉玩家这一下会追加什么。 */
  private drawRoutePreview(g: Phaser.GameObjects.Graphics, plan: RouteClickPlan): void {
    const start = this.centerOf(plan.from);
    const end = this.centerOf(plan.target);
    const tint = plan.turn ? PALETTE.brass : PALETTE.teal;
    dashLine(g, start.x, start.y, end.x, end.y, {
      color: tint,
      lineWidth: 4,
      dash: 9,
      gap: 6,
      alpha: 0.55,
    });
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const tipX = end.x - Math.cos(angle) * 18;
    const tipY = end.y - Math.sin(angle) * 18;
    g.fillStyle(toColor(tint), 0.75);
    g.fillTriangle(
      tipX + Math.cos(angle) * 12, tipY + Math.sin(angle) * 12,
      tipX + Math.cos(angle + 2.5) * 12, tipY + Math.sin(angle + 2.5) * 12,
      tipX + Math.cos(angle - 2.5) * 12, tipY + Math.sin(angle - 2.5) * 12,
    );
    circle(g, end.x, end.y, 16, {
      fill: tint,
      fillAlpha: 0.14,
      stroke: tint,
      lineWidth: 2,
    });
    if (plan.turn) {
      g.lineStyle(3, toColor(PALETTE.brass), 0.7);
      g.beginPath();
      g.arc(start.x, start.y, 24, angle - Math.PI / 2, angle - Math.PI / 2 + (plan.turn === 'right' ? Math.PI / 2 : -Math.PI / 2), plan.turn === 'left');
      g.strokePath();
    }
  }

  /** 不可达提示：红色虚线环 + 叉，和悬停预览同一个视觉语言。 */
  private drawRejectHint(g: Phaser.GameObjects.Graphics, cell: Cell): void {
    const point = this.centerOf(cell);
    for (let index = 0; index < 12; index += 1) {
      const from = (index / 12) * Math.PI * 2;
      const to = ((index + 0.55) / 12) * Math.PI * 2;
      g.lineStyle(3, toColor(PALETTE.red), 0.5);
      g.beginPath();
      g.arc(point.x, point.y, 34, from, to);
      g.strokePath();
    }
    g.lineStyle(4, toColor(PALETTE.red), 0.65);
    g.lineBetween(point.x - 12, point.y - 12, point.x + 12, point.y + 12);
    g.lineBetween(point.x - 12, point.y + 12, point.x + 12, point.y - 12);
  }

  /** 点不中时闪一下：红环 + 叉，520ms 淡出。 */
  private flashReject(cell: Cell): void {
    const flash = this.flash;
    if (!flash) return;
    this.tweens.killTweensOf(flash);
    flash.clear();
    flash.setAlpha(1);
    this.drawRejectHint(flash, cell);
    // 场景卸载后 self.flash 会被清理成 null；回调统一走这个守卫，避免操作已销毁的显示对象。
    const clearFlash = (): void => { this.flash?.clear(); };
    if (this.reducedMotion) {
      this.time.delayedCall(520, clearFlash);
      return;
    }
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 520,
      delay: 120,
      ease: 'Sine.easeIn',
      onComplete: clearFlash,
    });
  }

  private render(snapshot: RunSnapshot): void {
    const layer = this.layer;
    const script = this.script;
    if (!layer || !script) return;

    const signature = this.signatureOf(snapshot);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.tweens.killTweensOf(layer.list);
    layer.removeAll(true);

    const program = snapshot.toolState.rule?.program ?? [];
    const trace = executeProgram(script, program);
    const visited = new Set(trace.path.map(cellKey));
    const collected = new Set(trace.collected.map(cellKey));
    const failureCell = this.failureCell(trace);
    const passed = snapshot.lastRun?.outcome === 'pass';

    this.drawBoard(layer, script, passed);
    this.drawCells(layer, script, { visited, collected, failureCell });
    this.drawPath(layer, trace);
    this.drawStars(layer, script, collected);
    this.drawWalker(layer, trace);
    this.drawStatus(layer, script, trace, program.length, snapshot);
  }

  private signatureOf(snapshot: RunSnapshot): string {
    const state = snapshot.toolState.rule;
    const program = state?.program ?? [];
    return [
      snapshot.phase,
      String(snapshot.revision),
      state?.lastTrace ? 'committed' : 'open',
      program.map((block) => [block.id, block.op, block.n ?? 0, (block.children ?? []).map((child) => child.op).join('+')].join(':')).join(','),
      snapshot.lastRun?.id ?? '',
      snapshot.lastRun?.outcome ?? '',
      (snapshot.verdict?.failure?.causes ?? []).map((cause) => cause.kind + ':' + cause.ref).join(';'),
    ].join('|');
  }

  /** 撞墙时标出被挡住的格子；越界就退回到出发格。 */
  private failureCell(trace: RuleTrace): Cell | null {
    if (trace.failureClass !== 'rule-wall') return null;
    const last = trace.log[trace.log.length - 1];
    if (!last?.blocked) return null;
    const script = this.script;
    if (!script) return null;
    const inside = last.to.x >= 0 && last.to.y >= 0
      && last.to.x < script.grid.width && last.to.y < script.grid.height;
    return inside ? last.to : last.from;
  }

  private drawBoard(layer: Phaser.GameObjects.Container, script: RuleScript, passed: boolean): void {
    const g = this.add.graphics();
    const width = spanOf(script.grid.width);
    const height = spanOf(script.grid.height);
    roundRect(g, this.originX - BOARD_INSET, this.originY - BOARD_INSET, width + BOARD_INSET * 2, height + BOARD_INSET * 2, {
      fill: PALETTE.card,
      fillAlpha: 0.72,
      stroke: passed ? PALETTE.teal : PALETTE.grid,
      lineWidth: passed ? 2.5 : 1.5,
      radius: 24,
    });
    layer.add(g);
  }

  private drawCells(
    layer: Phaser.GameObjects.Container,
    script: RuleScript,
    flags: { visited: Set<string>; collected: Set<string>; failureCell: Cell | null },
  ): void {
    const failureKey = flags.failureCell ? cellKey(flags.failureCell) : null;
    const goalKey = cellKey(script.grid.goal);

    for (let y = script.grid.height - 1; y >= 0; y -= 1) {
      for (let x = 0; x < script.grid.width; x += 1) {
        const cell: Cell = { x, y };
        const key = cellKey(cell);
        const point = this.centerOf(cell);
        const isWall = script.walls.some((wall) => wall.x === x && wall.y === y);
        const isGoal = key === goalKey;
        const isFailure = key === failureKey;

        const tile = this.add.graphics();
        if (isWall) {
          roundRect(tile, point.x - CELL / 2 + 4, point.y - CELL / 2 + 4, CELL - 8, CELL - 8, {
            fill: PALETTE.ink,
            fillAlpha: 0.82,
            radius: 16,
          });
          tile.lineStyle(2, toColor(PALETTE.card), 0.3);
          tile.lineBetween(point.x - CELL / 2 + 22, point.y, point.x + CELL / 2 - 22, point.y);
          tile.lineBetween(point.x, point.y - CELL / 2 + 22, point.x, point.y + CELL / 2 - 22);
        } else {
          roundRect(tile, point.x - CELL / 2 + 3, point.y - CELL / 2 + 3, CELL - 6, CELL - 6, {
            fill: isGoal ? PALETTE.teal : PALETTE.paper,
            fillAlpha: isGoal ? 0.12 : 0.55,
            stroke: isGoal ? PALETTE.teal : PALETTE.grid,
            strokeAlpha: isGoal ? 0.9 : 0.8,
            lineWidth: isGoal ? 3 : 1.5,
            radius: 16,
          });
        }
        layer.add(tile);

        if (isGoal) {
          const flag = this.add.graphics();
          flag.fillStyle(toColor(PALETTE.teal), 1);
          flag.fillRect(point.x - 38, point.y - 34, 3, 34);
          flag.fillTriangle(
            point.x - 35, point.y - 34,
            point.x - 11, point.y - 25,
            point.x - 35, point.y - 16,
          );
          layer.add(flag);
        }

        if (isFailure) {
          const ring = this.add.graphics();
          roundRect(ring, point.x - CELL / 2 + 1, point.y - CELL / 2 + 1, CELL - 2, CELL - 2, {
            stroke: PALETTE.red,
            lineWidth: 3,
            radius: 18,
          });
          layer.add(ring);
        }

        if (flags.visited.has(key) && !isWall && !isGoal) {
          const dot = this.add.graphics();
          circle(dot, point.x + CELL / 2 - 16, point.y - CELL / 2 + 16, 4, {
            fill: PALETTE.brass,
            fillAlpha: 0.8,
          });
          layer.add(dot);
        }
      }
    }
  }

  private drawPath(layer: Phaser.GameObjects.Container, trace: RuleTrace): void {
    if (trace.path.length < 2) return;
    const g = this.add.graphics();
    const points = trace.path.map((cell) => this.centerOf(cell));
    const first = points[0];
    if (!first) return;
    g.lineStyle(8, toColor(PALETTE.brass), 0.28);
    g.beginPath();
    g.moveTo(first.x, first.y);
    for (const point of points.slice(1)) g.lineTo(point.x, point.y);
    g.strokePath();
    for (const point of points) {
      circle(g, point.x, point.y, 4, { fill: PALETTE.brass, fillAlpha: 0.45 });
    }
    layer.add(g);
  }

  private drawStars(layer: Phaser.GameObjects.Container, script: RuleScript, collected: Set<string>): void {
    for (const star of script.stars) {
      const point = this.centerOf(star);
      const taken = collected.has(cellKey(star));
      const g = this.add.graphics();
      const shape = starPoints(point.x, point.y, 30, 13);
      const tint = toColor(taken ? PALETTE.teal : PALETTE.brass);
      g.fillStyle(tint, taken ? 0.32 : 0.95);
      // 五角星 = 圆心为扇心的三角形扇；不用 fillPoints，避免依赖 Phaser 的 Vector2。
      for (let index = 0; index < shape.length; index += 1) {
        const current = shape[index];
        const next = shape[(index + 1) % shape.length];
        if (!current || !next) continue;
        g.fillTriangle(point.x, point.y, current.x, current.y, next.x, next.y);
      }
      g.lineStyle(2.5, tint, 1);
      for (let index = 0; index < shape.length; index += 1) {
        const current = shape[index];
        const next = shape[(index + 1) % shape.length];
        if (!current || !next) continue;
        g.lineBetween(current.x, current.y, next.x, next.y);
      }
      layer.add(g);

      const note = centeredLabel(this, point.x, point.y + 44, taken ? '已收' : '星星', {
        size: 12,
        color: taken ? PALETTE.teal : PALETTE.inkSoft,
      });
      layer.add(note);
    }
  }

  private drawWalker(layer: Phaser.GameObjects.Container, trace: RuleTrace): void {
    const point = this.centerOf(trace.end);
    const walker = this.add.container(point.x, point.y);
    const tint = trace.failureClass ? PALETTE.red : trace.reachedGoal ? PALETTE.teal : PALETTE.blueprint;

    const body = this.add.graphics();
    circle(body, 0, 0, 26, { fill: tint, fillAlpha: 0.94, stroke: PALETTE.card, lineWidth: 3 });
    const angle = ARROW_ANGLE[trace.end.dir];
    body.fillStyle(toColor(PALETTE.card), 1);
    body.fillTriangle(
      Math.cos(angle) * 36, Math.sin(angle) * 36,
      Math.cos(angle - 0.55) * 20, Math.sin(angle - 0.55) * 20,
      Math.cos(angle + 0.55) * 20, Math.sin(angle + 0.55) * 20,
    );
    walker.add(body);
    layer.add(walker);

    if (!this.reducedMotion) {
      this.tweens.add({
        targets: walker,
        scale: { from: 1, to: 1.07 },
        duration: 880,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private drawStatus(
    layer: Phaser.GameObjects.Container,
    script: RuleScript,
    trace: RuleTrace,
    blockCount: number,
    snapshot: RunSnapshot,
  ): void {
    const collected = trace.collected.length;
    const parts: string[] = [];
    if (blockCount === 0) {
      parts.push('先在图纸上点格子画路线');
    } else {
      parts.push('已走 ' + trace.steps + ' 步');
      parts.push('星星 ' + collected + '/' + script.stars.length);
    }
    if (trace.failureClass === 'rule-wall') {
      parts.push('第 ' + (trace.failureStep ?? trace.steps) + ' 步撞到墙');
    } else if (trace.failureClass === 'rule-loop') {
      parts.push('步数用完了，程序可能在绕圈');
    } else if (trace.reachedGoal) {
      parts.push(trace.steps <= 18 ? '路线跑通，还能更短' : '路线跑通');
    } else if (blockCount > 0) {
      parts.push('还没到终点');
    }
    if (snapshot.toolState.rule?.lastTrace) parts.push('程序已提交');

    const status = label(this, 26, this.H - 22, parts.join(' · '), {
      size: 15,
      color: trace.failureClass ? PALETTE.red : PALETTE.inkSoft,
    });
    layer.add(status);

    const legend = label(this, this.W - 26, this.H - 22, '深色块＝墙 · ★＝星星 · 旗子＝终点', {
      size: 13,
      color: PALETTE.inkSoft,
      originX: 1,
    });
    layer.add(legend);
  }
}

export function createRuleScene(
  ctx: LevelContext,
  runtime: LevelRuntime,
): Phaser.Types.Scenes.SceneType {
  return new RuleScene(ctx, runtime);
}
