import { defineStore } from 'pinia';
import { ref } from 'vue';
import { platform } from '../shell/platform';
import { locale, setLocale } from '../shell/locale';
import { ensureMessages } from '@mmf/i18n';
import type { Locale } from '@mmf/i18n';

export const useSettings = defineStore('settings', () => {
  const muted = ref(platform.preferences.get('muted') === '1');
  const stored = platform.preferences.get('locale');
  const initialLocale: Locale = stored === 'en' ? 'en' : 'zh-CN';

  function apply(): void {
    platform.audio.setMuted(muted.value);
  }

  function toggle(): void {
    muted.value = !muted.value;
    platform.preferences.set('muted', muted.value ? '1' : '0');
    apply();
  }

  /**
   * 启动即用本地偏好，先渲染正确语言。
   * 目前英文表是内置分片（ensureMessages 为空实现），所以这里不需要 await；
   * 真正"先 await 再切"的纪律落在 setLocalePreference（docs/02 §12 纪律 2）。
   */
  function init(): void {
    apply();
    setLocale(initialLocale);
  }

  async function setLocalePreference(next: Locale): Promise<void> {
    if (next === locale.value) return;
    try {
      // 补丁没就位就切状态，会出现"界面英文、卡片中文"；失败保持当前语言（回落中文）。
      await ensureMessages(next);
    } catch (cause) {
      console.warn('[mmf] 语言补丁加载失败，保持当前语言', cause);
      return;
    }
    platform.preferences.set('locale', next);
    setLocale(next);
  }

  function toggleLocale(): void {
    void setLocalePreference(locale.value === 'en' ? 'zh-CN' : 'en');
  }

  return { muted, locale, init, toggle, setLocale: setLocalePreference, toggleLocale };
});
