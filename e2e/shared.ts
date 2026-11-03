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
