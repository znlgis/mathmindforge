import { createTranslator } from '@mmf/i18n';
import type { Locale, MessageParams, Translator } from '@mmf/i18n';
import { locale } from './locale';

const zh = createTranslator('zh-CN');
const en = createTranslator('en');

function t(key: string, params?: MessageParams): string {
  return locale.value === 'en' ? en.t(key, params) : zh.t(key, params);
}

const translator: Translator = {
  get locale(): Locale {
    return locale.value;
  },
  t,
};

export function useI18n() {
  return { t, translator, locale };
}
