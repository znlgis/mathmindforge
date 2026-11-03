import type { Locale } from '@mmf/content/ids';
import { en } from './en';
import { zh } from './messages';
import type { MessageKey } from './messages';
import { zhSourceEn } from './zh-source';

export { en, zh, zhSourceEn };
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

/**
 * 英文表 = 正式 en 表 + "中文源串 → 英文"兜底表。
 * 后者兜住历史遗留的"以中文句子当 key"（内容 feedback / 模板失败文案），
 * 让英文界面不再漏出中文；正式 key 优先，避免兜底表盖掉真实文案。
 */
const EN: Record<string, string> = { ...zhSourceEn, ...en };

const TABLES: Record<Locale, Record<string, string>> = { 'zh-CN': ZH, en: EN };

let currentLocale: Locale = 'zh-CN';

/**
 * 不传 locale 时跟随 setTranslatorLocale 设置的全局语言。
 * 以前写死 'zh-CN'，切英文后默认构造的 translator 仍然是中文——
 * 这正是 docs/02 §12 第 2 条要防的"界面英文、卡片中文"。
 */
export function createTranslator(locale: Locale = currentLocale): Translator {
  const table = TABLES[locale];
  return {
    locale,
    t(key, params) {
      // 英文缺 key 时回落中文是刻意的（宁可中文也不白屏），见 docs/02 §7.3。
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

/**
 * 中英表都是静态打包的（en 是独立 chunk，import 即到位），没有异步要等的东西。
 * 保留这个接口是为了外壳"先 await 文案再切语言"的纪律不被破坏（docs/02 §12 第 2 条）。
 */
export async function ensureMessages(_locale: Locale): Promise<void> {
  // 无操作：表随模块加载完成。将来若把 en 改成动态 import，这里再补真实加载。
}
