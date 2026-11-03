import type { Locale } from '@mmf/i18n';
import { setTranslatorLocale } from '@mmf/i18n';
import { ref } from 'vue';

/** 全局界面语言：只影响 UI 文案；关卡内容当前仍以中文为准，找不到英文时回退中文。 */
export const locale = ref<Locale>('zh-CN');

export function setLocale(next: Locale): void {
  locale.value = next;
  setTranslatorLocale(next);
}
