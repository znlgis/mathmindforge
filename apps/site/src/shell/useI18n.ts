import { createTranslator } from '@mmf/i18n';

const translator = createTranslator('zh-CN');

export function useI18n() {
  return {
    t: translator.t,
    locale: 'zh-CN' as const,
  };
}
