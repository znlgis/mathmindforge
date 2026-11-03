import type Phaser from 'phaser';
import type { LevelContext, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { PatternRule } from '@mmf/toolkit/pattern';
import { tokenAt } from '@mmf/toolkit/pattern';
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
import {
  mismatchedPlacements,
  nextFillToken,
  parseScript,
  patternRuleKey,
  patternStateOf,
  sameTokenShape,
} from './logic';
import type { PatternPreview, PatternToolStateView } from './logic';
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
  /** 已提交规律下这块放错了：只是过程提示，不进 verdict。 */
  wrong: boolean;
  /** 预览预测：空格画 ghost；有内容时标出与预测一致/冲突。 */
  ghost?: { token: string; conflict: boolean };
  /** 空格上「点一下会放进来的字母」：让一次点击的后果在点之前就可读。 */
  next?: string;
}

const TILE_RADIUS = 12;
/** 预览 ghost 的透明度：要看得见，又要一眼看出「还没填」。 */
const GHOST_ALPHA = 0.5;

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
  // C 在 g13 的调色板里是三角形；用蓝图色把第三种形状和 A/B 分开。
  if (token === 'C') return PALETTE.blueprint;
  return PALETTE.ink;
}

/** A 是圆、B 是圆角方、C 是三角；construct 传来的 palette shape（round/square）也认。 */
function tokenShape(token: string): 'circle' | 'square' | 'triangle' {
  const normalized = token.toLowerCase();
  if (normalized === 'a' || normalized === 'round' || normalized === 'circle') return 'circle';
  if (normalized === 'c' || normalized === 'triangle') return 'triangle';
  return 'square';
}

function tokenCaption(token: string): string {
  return token.length <= 2 ? token : '?';
}

/**
 * 模式关画布：一条 12 格的纸带。
 * 只读 runtime 快照重绘，同时就是答题面：点空格循环填字母（一次点击填一格），
 * 点已填的空格换下一个字母，点原本可见的格子只做观察环。
 */
class PatternScene extends BaseScene {
  private readonly runtime: LevelRuntime;
  private script: PatternScript | null = null;
  private strip: Phaser.GameObjects.Container | null = null;
  private hover: Phaser.GameObjects.Graphics | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastSignature = '';
  /** 命中检测用的格数：放指针回调里读，避免每次点都重新 parse 脚本。 */
  private tileTotal = 0;
  /** 画布填格用的字母循环顺序：优先工具配置的 tokens，再补上带子里出现过的字母。 */
  private tokenOrder: string[] = [];

  constructor(ctx: LevelContext, runtime: LevelRuntime) {
    super(ctx.manifest.id, ctx);
    this.runtime = runtime;
  }

  create(): void {
    this.script = parseScript(this.ctx.detail.levelScript);
    this.lastSignature = '';
    this.tileTotal = Math.max(this.script.scenario.length, this.script.scenario.visible.length);
    this.tokenOrder = this.readTokenOrder();
    this.drawPaperBackground();
    this.add
      .text(26, 160, '把缺的三块补上', {
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
    // 悬停高亮单独一层：指针移动只重画这一个 Graphics，不触发整条带子的 signature 重绘。
    this.hover = this.add.graphics().setDepth(12);

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    // 指针移出画布时 Phaser 不再发 pointermove，悬停环与手型光标要在这里收掉。
    this.input.on('gameout', this.clearHover, this);

    this.unsubscribe = this.runtime.subscribe((snapshot) => this.render(snapshot));
    this.onShutdownCleanup(() => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('gameout', this.clearHover, this);
      this.hover = null;
      this.setCanvasCursor(false);
    });

    this.render(this.runtime.snapshot());
  }

  /**
   * 设计坐标命中：整张纸带卡片都算可点，落在卡片里就取横向最近的格子。
   * 孩子点偏一点也能观察，e2e 也不必像素级对准格子中心。
   */
  private indexAt(x: number, y: number): number {
    const total = this.tileTotal;
    if (total <= 0) return -1;
    const left = PATH_LAYOUT.startX - 26;
    const right = PATH_LAYOUT.startX + stripWidth(total) + 26;
    const top = PATH_LAYOUT.y - 52;
    const bottom = PATH_LAYOUT.y + PATH_LAYOUT.cellH + 72;
    if (x < left || x > right || y < top || y > bottom) return -1;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < total; index += 1) {
      const distance = Math.abs(tileCenterX(index) - x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    return nearest;
  }

  /** 字母循环顺序：工具配置 tokens 优先，再补带子里出现过的字母，最后兜底 A/B/C。 */
  private readTokenOrder(): string[] {
    const order: string[] = [];
    const push = (token: string | null | undefined): void => {
      if (typeof token === 'string' && token.length > 0 && !order.includes(token)) order.push(token);
    };
    const spec = this.ctx.detail.tools.find((tool) => tool.kind === 'pattern');
    if (spec && spec.kind === 'pattern') {
      for (const token of spec.config.tokens) push(token);
    }
    for (const token of this.script?.scenario.visible ?? []) push(token);
    if (order.length < 2) {
      for (const token of ['A', 'B', 'C']) push(token);
    }
    return order.slice(0, 4);
  }

  /** 当前规则（选过候选 chip 就会立刻提交）；空格第一下据此放「照这样做」的字母。 */
  private currentRule(pattern: PatternToolStateView | undefined): PatternRule | null {
    if (!pattern?.cycle || pattern.cycle.length < 2) return null;
    return { tokens: [...pattern.cycle], period: pattern.cycle.length, transform: pattern.transform ?? 'none' };
  }

  private predictedToken(index: number, pattern: PatternToolStateView | undefined): string {
    const rule = this.currentRule(pattern);
    return rule ? tokenAt(rule, index) : '';
  }

  private pieceAt(snapshot: RunSnapshot, index: number): string | undefined {
    for (const piece of snapshot.toolState.construct?.pieces ?? []) {
      if (piece.x === index) return piece.shape;
    }
    return undefined;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const index = this.indexAt(pointer.worldX, pointer.worldY);
    if (index < 0) return;
    // 派发会同步 notify → 重画整条带子（含销毁显示对象）。延到微任务，
    // 避免在 Phaser 输入处理的栈里销毁正在派发事件的显示对象。
    const visible = this.script?.scenario.visible[index] ?? null;
    if (visible !== null) {
      // 原本就可见的格子只做观察：立刻出现观察环，不改答案。
      queueMicrotask(() => {
        void this.runtime.dispatch({ type: 'pattern/inspect', payload: { index } });
      });
      return;
    }
    const snapshot = this.runtime.snapshot();
    const current = this.pieceAt(snapshot, index);
    // 空格第一下按「照这样做」放规律预测的字母；再点一次换下一个——一次点击 = 一次输入。
    const token = nextFillToken(this.tokenOrder, current, this.predictedToken(index, patternStateOf(snapshot)));
    queueMicrotask(() => {
      void this.runtime.dispatch({
        type: 'construct/place',
        payload: { piece: { id: 'tile-' + index, shape: token, x: index, y: 0 } },
      });
    });
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const hover = this.hover;
    if (!hover) return;
    const index = this.indexAt(pointer.worldX, pointer.worldY);
    this.setCanvasCursor(index >= 0);
    hover.clear();
    if (index < 0) return;
    const box = tileBox(index);
    // 比观察环再外扩一点：两个环同时出现时不叠成一根线。
    dashedRect(hover, box.x - 9, box.y - 9, box.w + 18, box.h + 18, {
      color: PALETTE.brass,
      lineWidth: 2,
      dash: 7,
      gap: 5,
      alpha: 0.8,
    });
  }

  /** 指针离开画布：收掉悬停环与手型光标。 */
  private clearHover(): void {
    this.hover?.clear();
    this.setCanvasCursor(false);
  }

  /** 让「可点」在鼠标上看得见；触屏没有指针样式，不影响。 */
  private setCanvasCursor(pointer: boolean): void {
    const canvas = this.input.manager?.canvas;
    if (canvas) canvas.style.cursor = pointer ? 'pointer' : 'default';
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
    this.tileTotal = length;
    const pattern = patternStateOf(snapshot);
    const inspected = new Set(pattern?.inspected ?? []);
    const pieces = new Map<number, string>();
    for (const piece of snapshot.toolState.construct?.pieces ?? []) {
      if (Number.isInteger(piece.x)) pieces.set(piece.x, piece.shape);
    }
    const failed = this.failedCells(snapshot);
    const passed = snapshot.lastRun?.outcome === 'pass';
    const rule = this.committedRule(pattern);
    // 放错块只画裂纹/红圈提示，submit 的最终判定仍由 runtime 的校验决定。
    const wrong = new Set(mismatchedPlacements(rule, pieces));
    const preview = this.activePreview(pattern);
    const predicted = new Map<number, string>();
    for (const cell of preview?.cells ?? []) predicted.set(cell.index, cell.token);

    this.drawStrip(length, passed, preview !== undefined);

    for (let index = 0; index < length; index += 1) {
      const piece = pieces.get(index);
      const token = piece ?? visible[index] ?? null;
      const ghostToken = predicted.get(index);
      const tile = this.add.container(0, 0);
      this.paintTile(tile, index, token, {
        inspected: inspected.has(index),
        failed: failed.has(index),
        passed,
        piece: piece !== undefined,
        wrong: wrong.has(index),
        ghost: ghostToken === undefined
          ? undefined
          : { token: ghostToken, conflict: token !== null && !sameTokenShape(token, ghostToken) },
        next: token === null
          ? nextFillToken(this.tokenOrder, undefined, this.predictedToken(index, pattern))
          : undefined,
      });
      strip.add(tile);
      // 预览时按格错峰亮起，让「规则跑了一遍」看得见。
      const delay = preview ? Math.min(index * 26, 260) : Math.min(index * 18, 180);
      this.reveal(tile, delay);
    }

    if (passed && length > 0) this.drawWalker(length);
  }

  /** 已提交的规则；没提交就没有「放错」提示，避免拿草稿规则误伤玩家。 */
  private committedRule(pattern: PatternToolStateView | undefined): PatternRule | null {
    if (!pattern?.committed || !pattern.cycle || pattern.cycle.length < 2) return null;
    return {
      tokens: [...pattern.cycle],
      period: pattern.cycle.length,
      transform: pattern.transform ?? 'none',
    };
  }

  /** 预览只对生成它的那条规则有效：周期/变换被改过就作废，不画过期 ghost。 */
  private activePreview(pattern: PatternToolStateView | undefined): PatternPreview | undefined {
    const preview = pattern?.preview;
    if (!preview || !pattern?.cycle) return undefined;
    const key = patternRuleKey({ tokens: pattern.cycle, transform: pattern.transform ?? 'none' });
    return preview.ruleKey === key ? preview : undefined;
  }

  private signatureOf(snapshot: RunSnapshot): string {
    const pattern = patternStateOf(snapshot);
    const pieces = snapshot.toolState.construct?.pieces ?? [];
    const causes = snapshot.verdict?.failure?.causes ?? [];
    const preview = this.activePreview(pattern);
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
      // 预览也要进 signature：ghost 与「连点重新跑一遍」都靠它触发重绘。
      preview ? preview.ruleKey + '@' + preview.seq : '',
      preview?.cells.map((cell) => `${cell.index}:${cell.token}`).join(',') ?? '',
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

  private drawStrip(length: number, passed: boolean, previewing: boolean): void {
    const strip = this.strip;
    if (!strip) return;
    const total = stripWidth(length);
    const frameColor = passed ? PALETTE.teal : previewing ? PALETTE.brass : PALETTE.grid;
    const g = this.add.graphics();
    roundRect(g, PATH_LAYOUT.startX - 18, PATH_LAYOUT.y - 34, total + 36, PATH_LAYOUT.cellH + 68, {
      fill: PALETTE.card,
      fillAlpha: 0.62,
      stroke: frameColor,
      lineWidth: passed || previewing ? 2 : 1.5,
      radius: 20,
    });
    dashLine(
      g,
      PATH_LAYOUT.startX - 6,
      PATH_LAYOUT.y + PATH_LAYOUT.cellH + 30,
      PATH_LAYOUT.startX + total + 6,
      PATH_LAYOUT.y + PATH_LAYOUT.cellH + 30,
      {
        color: frameColor,
        lineWidth: 2,
        dash: 10,
        gap: 8,
        alpha: 0.7,
      },
    );
    // 预览中：纸带外面套一圈铜色虚线，和「已经填好」的实线状态区分开。
    if (previewing) {
      dashedRect(g, PATH_LAYOUT.startX - 24, PATH_LAYOUT.y - 40, total + 48, PATH_LAYOUT.cellH + 80, {
        color: PALETTE.brass,
        lineWidth: 2,
        dash: 9,
        gap: 7,
        alpha: 0.55,
      });
    }
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
    const broken = state.failed || state.wrong;
    const stroke = broken ? PALETTE.red : state.passed ? PALETTE.teal : PALETTE.grid;
    const strokeWidth = broken ? 2.5 : state.passed ? 2 : 1.5;

    if (token === null) {
      roundRect(tile, box.x, box.y, box.w, box.h, {
        fill: PALETTE.paper,
        fillAlpha: 0.7,
        radius: TILE_RADIUS,
      });
      dashedRect(tile, box.x + 2, box.y + 2, box.w - 4, box.h - 4, {
        color: broken ? PALETTE.red : state.ghost ? PALETTE.brass : PALETTE.blueprint,
        lineWidth: 2,
        dash: 8,
        gap: 6,
        alpha: broken ? 1 : 0.8,
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

    if (token === null && state.ghost) {
      // 空格上画预测：虚线铜框 + 半透明字母/形状，左下角的小问号提醒「其实还空着」。
      this.paintGhost(target, box, state.ghost.token);
      const hint = centeredLabel(this, box.x + 11, box.y + 13, '?', {
        size: 11,
        color: PALETTE.inkSoft,
      });
      hint.setAlpha(0.75);
      target.add(hint);
    } else if (token === null && state.next) {
      // 空格还没填：淡色预告「点一下会放这个字母」，点完立刻变成实块（一次点击 = 一次输入）。
      this.paintUpcoming(target, box, state.next);
      const hint = centeredLabel(this, box.x + 11, box.y + 13, '?', {
        size: 11,
        color: PALETTE.inkSoft,
      });
      hint.setAlpha(0.75);
      target.add(hint);
    } else {
      const caption = token === null ? '?' : tokenCaption(token);
      const text = centeredLabel(this, box.cx, box.cy, caption, {
        size: 20,
        bold: true,
        color: token === null ? PALETTE.inkSoft : tokenColor(token),
      });
      target.add(text);
      if (token !== null && state.ghost) {
        if (state.ghost.conflict) this.paintPreviewConflict(target, box, state.ghost.token);
        else this.paintPreviewMatch(target, box);
      }
    }

    // 下标贴纸：ToolDock 的 index 与画布一一对应
    const indexText = centeredLabel(this, box.cx, box.y + box.h + 16, String(index + 1), {
      size: 11,
      color: PALETTE.inkSoft,
    });
    target.add(indexText);

    if (state.inspected) {
      const ring = this.add.graphics();
      roundRect(ring, box.x - 5, box.y - 5, box.w + 10, box.h + 10, {
        stroke: broken ? PALETTE.red : PALETTE.blueprint,
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

    // 判定失败照旧用实线裂纹；过程提示（放错块）用虚线框+浅裂纹，两者都不改 verdict。
    if (state.failed) this.paintFailure(target, box);
    else if (state.wrong) this.paintWrongHint(target, box);
  }

  /** 空格预告：淡一档的字母/形状，提示这一下点击会放什么，又不至于像已经填好。 */
  private paintUpcoming(
    target: Phaser.GameObjects.Container,
    box: TileBox,
    token: string,
  ): void {
    const shape = this.add.graphics();
    this.paintGhostShape(shape, token, box, tokenColor(token));
    target.add(shape);
    const text = centeredLabel(this, box.cx, box.cy, tokenCaption(token), {
      size: 20,
      bold: true,
      color: tokenColor(token),
    });
    text.setAlpha(0.32);
    target.add(text);
  }

  /** 预测格：铜色半透明形状 + 字母，看得见「规则猜这里是什么」。 */
  private paintGhost(
    target: Phaser.GameObjects.Container,
    box: TileBox,
    token: string,
  ): void {
    const shape = this.add.graphics();
    this.paintGhostShape(shape, token, box);
    target.add(shape);
    const text = centeredLabel(this, box.cx, box.cy, tokenCaption(token), {
      size: 20,
      bold: true,
      color: PALETTE.brass,
    });
    text.setAlpha(GHOST_ALPHA);
    target.add(text);
  }

  private paintGhostShape(
    g: Phaser.GameObjects.Graphics,
    token: string,
    box: TileBox,
    tint: string = PALETTE.brass,
  ): void {
    const half = 17;
    const shape = tokenShape(token);
    if (shape === 'circle') {
      circle(g, box.cx, box.cy, half, {
        fill: tint,
        fillAlpha: 0.1,
        stroke: tint,
        strokeAlpha: 0.55,
        lineWidth: 2,
      });
      return;
    }
    if (shape === 'triangle') {
      g.fillStyle(toColor(tint), 0.1);
      g.fillTriangle(box.cx, box.cy - half, box.cx + half, box.cy + half - 3, box.cx - half, box.cy + half - 3);
      g.lineStyle(2, toColor(tint), 0.55);
      g.strokeTriangle(box.cx, box.cy - half, box.cx + half, box.cy + half - 3, box.cx - half, box.cy + half - 3);
      return;
    }
    roundRect(g, box.cx - half, box.cy - half, half * 2, half * 2, {
      fill: tint,
      fillAlpha: 0.1,
      stroke: tint,
      strokeAlpha: 0.55,
      lineWidth: 2,
      radius: 9,
    });
  }

  /** 规律预测和已经填好的内容对不上：红虚线框 + 右下角标注规律猜的 token。 */
  private paintPreviewConflict(
    target: Phaser.GameObjects.Container,
    box: TileBox,
    token: string,
  ): void {
    const g = this.add.graphics();
    dashedRect(g, box.x - 5, box.y - 5, box.w + 10, box.h + 10, {
      color: PALETTE.red,
      lineWidth: 2,
      dash: 6,
      gap: 4,
      alpha: 0.9,
    });
    target.add(g);
    const guess = centeredLabel(this, box.x + box.w - 12, box.y + box.h - 12, tokenCaption(token), {
      size: 12,
      bold: true,
      color: PALETTE.brass,
    });
    guess.setAlpha(0.95);
    target.add(guess);
  }

  /** 规律在已有内容上成立：格子底部一条青色细线，像「规则跑过了这一格」。 */
  private paintPreviewMatch(target: Phaser.GameObjects.Container, box: TileBox): void {
    const g = this.add.graphics();
    g.lineStyle(2, toColor(PALETTE.teal), 0.55);
    g.lineBetween(box.x + 14, box.y + box.h - 9, box.x + box.w - 14, box.y + box.h - 9);
    target.add(g);
  }

  /** 即时提示：放下的块和已提交规律不一致 —— 虚线红框 + 浅裂纹，改掉就消失。 */
  private paintWrongHint(target: Phaser.GameObjects.Container, box: TileBox): void {
    const g = this.add.graphics();
    dashedRect(g, box.x - 4, box.y - 4, box.w + 8, box.h + 8, {
      color: PALETTE.red,
      lineWidth: 2.5,
      dash: 7,
      gap: 5,
      alpha: 0.95,
    });
    g.lineStyle(2, toColor(PALETTE.red), 0.8);
    g.lineBetween(box.x + 16, box.y + 10, box.cx + 4, box.y + box.h * 0.36);
    g.lineBetween(box.cx + 4, box.y + box.h * 0.36, box.cx - 4, box.y + box.h * 0.62);
    g.lineBetween(box.cx - 4, box.y + box.h * 0.62, box.x + box.w - 16, box.y + box.h - 10);
    target.add(g);
  }

  private paintTokenShape(
    g: Phaser.GameObjects.Graphics,
    token: string,
    box: TileBox,
    passed: boolean,
  ): void {
    const half = 17;
    const tint = passed ? PALETTE.teal : tokenColor(token);
    const shape = tokenShape(token);
    if (shape === 'circle') {
      circle(g, box.cx, box.cy, half, {
        fill: tint,
        fillAlpha: 0.18,
        stroke: tint,
        lineWidth: 2.5,
      });
      return;
    }
    if (shape === 'triangle') {
      g.fillStyle(toColor(tint), 0.18);
      g.fillTriangle(box.cx, box.cy - half, box.cx + half, box.cy + half - 3, box.cx - half, box.cy + half - 3);
      g.lineStyle(2.5, toColor(tint), 1);
      g.strokeTriangle(box.cx, box.cy - half, box.cx + half, box.cy + half - 3, box.cx - half, box.cy + half - 3);
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
