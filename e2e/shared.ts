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
