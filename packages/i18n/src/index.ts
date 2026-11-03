import type { Locale } from '@mmf/content/ids';
import { en } from './en';
import { zh } from './messages';
import type { MessageKey } from './messages';

export { en, zh };
export type { Locale } from '@mmf/content/ids';
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

const ZH: Record<string, string> = zh;
const TABLES: Record<Locale, Record<string, string>> = { 'zh-CN': ZH, en };

let currentLocale: Locale = 'zh-CN';

export function createTranslator(locale: Locale = 'zh-CN'): Translator {
  const table = TABLES[locale];
  return {
    locale,
    t(key, params) {
      const text = table[key] ?? ZH[key] ?? key;
      return interpolate(text, params);
    },
  };
}

/** 切语言只影响后续调用；useI18n 的响应式包装会让模板重渲染。 */
export function setTranslatorLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getTranslatorLocale(): Locale {
  return currentLocale;
}

export function translate(locale: Locale, key: string, params?: MessageParams): string {
  return createTranslator(locale).t(key, params);
}

export async function ensureMessages(_locale: Locale): Promise<void> {
  // M0 只有中文界面；英文表在 v0.9 接入。
}
