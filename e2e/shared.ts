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
 * 点击 Phaser 画布上的第 index 个格子（0-based）。
 *
 * 画布是 900×560 设计坐标按容器等比缩放的 <canvas>，所以先把设计坐标
 * （PATH_LAYOUT：startX=70 / y=320 / cellW=56 / gap=8）映射到实际像素。
 * pattern 关的"填答案"就走这里：点空格 = 填一格，点已填格 = 换下一个字母。
 */
export async function clickCanvasCell(page: Page, index: number): Promise<void> {
  const box = await page.getByTestId('level-canvas').boundingBox();
  if (!box) throw new Error('level-canvas 还没有渲染出来');
  const DESIGN_W = 900;
  const DESIGN_H = 560;
  const scale = Math.min(box.width / DESIGN_W, box.height / DESIGN_H);
  const offsetX = box.x + (box.width - DESIGN_W * scale) / 2;
  const offsetY = box.y + (box.height - DESIGN_H * scale) / 2;
  const worldX = 70 + index * (56 + 8) + 56 / 2;
  const worldY = 320 + 76 / 2;
  await page.mouse.click(offsetX + worldX * scale, offsetY + worldY * scale);
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