import type { Page } from '@playwright/test';

export interface MmfSave {
  levels?: Record<string, { completed?: boolean }>;
}

export interface MmfBridge {
  events: string[];
  save: MmfSave | null;
  snapshot: unknown;
  lastError?: string;
  attemptSubmit?: () => Promise<void>;
}

interface MmfWindow {
  __mmf?: MmfBridge;
}

/**
 * 真实交互计数器：给"每关交互次数 ≤ 目标值"的门禁用（docs/12 §7-3）。
 *
 * 在页面里挂捕获阶段的 click / change 监听：Playwright 的 click / fill / selectOption
 * 都会派发真实事件，所以不依赖业务代码，也不会漏掉组件内部处理的点击。
 */
export async function startInteractionMeter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __mmfInteractionOff?: () => void };
    w.__mmfInteractionOff?.();
    let count = 0;
    const bump = (): void => { count += 1; };
    document.addEventListener('click', bump, true);
    document.addEventListener('change', bump, true);
    Object.defineProperty(window, '__mmfInteractions', { configurable: true, get: () => count });
    w.__mmfInteractionOff = () => {
      document.removeEventListener('click', bump, true);
      document.removeEventListener('change', bump, true);
    };
  });
}

/** 读当前交互次数。 */
export async function interactions(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __mmfInteractions?: number };
    return w.__mmfInteractions ?? 0;
  });
}

/**
 * 把设计坐标映射到屏幕像素。
 *
 * 每个模板的设计画布尺寸不同（pattern 900×560、rule 720×720），Phaser 用 FIT + CENTER_BOTH
 * 等比缩放后居中，所以必须按**实际 canvas 元素**的矩形换算，不能写死一套尺寸。
 */
async function designToScreen(
  page: Page,
  design: { width: number; height: number },
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const canvas = page.locator('[data-testid="level-canvas"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('level-canvas 里的 canvas 还没有渲染出来');
  const scale = Math.min(box.width / design.width, box.height / design.height);
  const offsetX = box.x + (box.width - design.width * scale) / 2;
  const offsetY = box.y + (box.height - design.height * scale) / 2;
  return { x: offsetX + x * scale, y: offsetY + y * scale };
}

/** pattern 关：点带子上的第 index 个格子（0-based）。点空格=填一格，点已填格=换下一个字母。 */
export async function clickCanvasCell(page: Page, index: number): Promise<void> {
  const point = await designToScreen(page, { width: 900, height: 560 }, 70 + index * (56 + 8) + 56 / 2, 320 + 76 / 2);
  await page.mouse.click(point.x, point.y);
}

/**
 * rule 关：点地图上的格子 (x, y)。场景布局见 packages/templates/src/rule/scene.ts：
 * CELL=100 / GAP=10 / 5×5，origin 居中、y 轴向上（屏幕行 = height-1-y）。
 */
export async function clickRuleCell(page: Page, x: number, y: number): Promise<void> {
  const grid = { width: 5, height: 5 };
  const cell = 100;
  const gap = 10;
  const span = grid.width * cell + (grid.width - 1) * gap;
  const originX = (720 - span) / 2;
  const originY = 84 + 26;
  const worldX = originX + x * (cell + gap) + cell / 2;
  const worldY = originY + (grid.height - 1 - y) * (cell + gap) + cell / 2;
  const point = await designToScreen(page, { width: 720, height: 720 }, worldX, worldY);
  await page.mouse.click(point.x, point.y);
}

export async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as unknown as MmfWindow).__mmf?.events ?? []).slice());
}

export async function saveSnapshot(page: Page): Promise<MmfSave | null> {
  return page.evaluate(() => (window as unknown as MmfWindow).__mmf?.save ?? null);
}

export async function lastError(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as MmfWindow).__mmf?.lastError);
}

/**
 * 工具卡是手风琴：同一时刻只展开一张，其余面板 display:none。
 * 点非首张卡的控件前必须先把卡头点开，否则 Playwright 会等到超时（元素不可见）。
 * 已经展开时点卡头会把它收起来，所以先读 aria-expanded 再决定点不点。
 */
export async function openTool(page: Page, kind: string, index: number): Promise<void> {
  const toggle = page.getByTestId('tool-card-toggle-' + kind + '-' + index);
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return;
  await toggle.click();
}

/**
 * 自动判定 + 自动过关（docs/13）：答案填完宿主自己判，答对直接进下一关。
 * 等的是"这一关完成事件 + 已经离开这一关的地址"，不依赖点「完成」按钮。
 */
export async function waitAdvance(page: Page, levelId: string, timeoutMs = 20_000): Promise<boolean> {
  const completed = await waitEvent(page, 'level:complete:' + levelId, timeoutMs);
  if (!completed) return false;
  try {
    await page.waitForFunction(
      (id) => !window.location.hash.includes('/play/' + id),
      levelId,
      { timeout: timeoutMs, polling: 50 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function waitEvent(page: Page, name: string, timeoutMs = 20_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (expected) => ((window as unknown as MmfWindow).__mmf?.events ?? []).includes(expected),
      name,
      { timeout: timeoutMs, polling: 50 },
    );
    return true;
  } catch {
    return false;
  }
}