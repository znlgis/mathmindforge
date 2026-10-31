interface MmfDebugBridge {
  events: string[];
  save: unknown;
  snapshot: unknown;
  lastError?: string;
  attemptSubmit?: () => Promise<void>;
}

declare global {
  interface Window {
    __mmf?: MmfDebugBridge;
  }
}

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
}

export function setDebugSave(save: unknown): void {
  const b = bridge();
  if (b) b.save = save;
}

export function setDebugSnapshot(snapshot: unknown): void {
  const b = bridge();
  if (b) b.snapshot = snapshot;
}

export function recordDebugError(message: string): void {
  const b = bridge();
  if (b) b.lastError = message;
  console.error('[mmf] ' + message);
}

export function registerSubmit(fn: () => Promise<void>): void {
  const b = bridge();
  if (b) b.attemptSubmit = fn;
}
