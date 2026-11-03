import { defineStore } from 'pinia';
import { ref } from 'vue';
import { platform } from '../shell/platform';
import { locale, setLocale } from '../shell/locale';
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

  function init(): void {
    apply();
    setLocale(initialLocale);
  }

  function setLocalePreference(next: Locale): void {
    platform.preferences.set('locale', next);
    setLocale(next);
  }

  function toggleLocale(): void {
    setLocalePreference(locale.value === 'en' ? 'zh-CN' : 'en');
  }

  return { muted, locale, init, toggle, setLocale: setLocalePreference, toggleLocale };
});
