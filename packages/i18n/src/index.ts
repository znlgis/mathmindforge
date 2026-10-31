import type { Locale } from '@mmf/content/ids';
import { zh } from './messages';
import type { MessageKey } from './messages';

export { zh };
export type { MessageKey };

export type MessageParams = Record<string, string | number>;

function interpolate(text: string, params?: MessageParams): string {
  if (!params) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export interface Translator {
  readonly locale: Locale;
  t(key: MessageKey | string, params?: MessageParams): string;
}

export function createTranslator(locale: Locale = 'zh-CN'): Translator {
  const table: Record<string, string> = zh;
  return {
    locale,
    t(key, params) {
      const text = table[key] ?? key;
      return interpolate(text, params);
    },
  };
}

export async function ensureMessages(_locale: Locale): Promise<void> {
  // M0 只有中文界面；英文表在 v0.9 接入。
}
