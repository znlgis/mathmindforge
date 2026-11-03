import type { RunSnapshot, SaveData } from '@mmf/game-kit';

/** e2e 只看最近的事件；调试会话可能开很久，无上限会一直吃内存。 */
const MAX_DEBUG_EVENTS = 400;

export interface MmfDebugBridge {
  events: string[];
  save: SaveData | null;
  snapshot: RunSnapshot | null;
  lastError?: string;
  attemptSubmit?: () => Promise<void>;
}

declare global {
  interface Window {
    __mmf?: MmfDebugBridge;
  }
}

/** 调试桥只在 DEV / webdriver 暴露；生产分享链接拿不到它（docs/02 §10.5） */
export function debugAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function bridge(): MmfDebugBridge | null {
  if (!debugAllowed()) return null;
  if (!window.__mmf) window.__mmf = { events: [], save: null, snapshot: null };
  return window.__mmf;
}

export function initDebug(): void {
  bridge();
}

export function recordDebugEvent(name: string): void {
  const b = bridge();
  if (!b) return;
  b.events.push(name);
  if (b.events.length > MAX_DEBUG_EVENTS) b.events.splice(0, b.events.length - MAX_DEBUG_EVENTS);
}

export function setDebugSave(save: SaveData | null): void {
  const b = bridge();
  if (b) b.save = save;
}

export function setDebugSnapshot(snapshot: RunSnapshot | null): void {
  const b = bridge();
  if (b) b.snapshot = snapshot;
}

export function recordDebugError(message: string): void {
  const b = bridge();
  if (b) b.lastError = message;
  console.error('[mmf] ' + message);
}

/**
 * 注册 / 注销宿主提交函数。退出关卡必须注销：桥是全局对象，
 * 留着闭包会一直持有已卸载的 runtime。
 */
export function registerSubmit(fn: (() => Promise<void>) | null): void {
  const b = bridge();
  if (!b) return;
  if (fn) b.attemptSubmit = fn;
  else delete b.attemptSubmit;
}
