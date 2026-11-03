import { createTranslator } from '@mmf/i18n';

const translator = createTranslator('zh-CN');

export function useI18n() {
  return {
    t: translator.t,
    translator,
    locale: 'zh-CN' as const,
  };
}
