import { defineStore } from 'pinia';
import { ref } from 'vue';
import { platform } from '../shell/platform';

export const useSettings = defineStore('settings', () => {
  const muted = ref(platform.preferences.get('muted') === '1');

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
  }

  return { muted, init, toggle };
});
