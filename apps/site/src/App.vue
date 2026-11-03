<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, watchEffect } from 'vue';
import { navigate, useRoute } from './router';
import { useI18n } from './shell/useI18n';
import { useSettings } from './stores/settings';
import HomeView from './views/HomeView.vue';
import ForgeView from './views/ForgeView.vue';

const WorkshopView = defineAsyncComponent(() => import('./views/WorkshopView.vue'));
const JournalView = defineAsyncComponent(() => import('./views/JournalView.vue'));
const BadgesView = defineAsyncComponent(() => import('./views/BadgesView.vue'));
const ReportView = defineAsyncComponent(() => import('./views/ReportView.vue'));

const route = useRoute();
const settings = useSettings();
const { t } = useI18n();

const mainEl = ref<HTMLElement | null>(null);
/** 只有 play 路由才有 levelId；开工即判一次，模板里就不用到处空值判断。 */
const playLevelId = computed(() => (route.value.name === 'play' ? route.value.levelId ?? null : null));
const routeKey = computed(() => route.value.name + ':' + (playLevelId.value ?? ''));

// <html lang> 与 document.title 跟随语言（docs/02 §12 纪律 4）
watchEffect(() => {
  const isEnglish = settings.locale === 'en';
  document.documentElement.lang = isEnglish ? 'en' : 'zh-CN';
  document.title = isEnglish ? 'Math Mind Forge' : '数思工坊 · Math Mind Forge';
});

// hash 路由没有页面级焦点重置：路由切换后把焦点交给主内容区，读屏才知道换了页。
watch(routeKey, async () => {
  await nextTick();
  mainEl.value?.focus();
});

function focusMain(): void {
  mainEl.value?.focus();
}

function goHome(): void {
  navigate('/');
}
</script>

<template>
  <div class="flex h-full flex-col bg-cream text-ink">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-bold"
      @click.prevent="focusMain"
    >
      跳到主内容 / Skip to content
    </a>

    <header
      v-if="route.name !== 'play'"
      class="app-header flex items-center justify-between gap-3 border-b border-grid bg-paper px-4 py-3"
    >
      <button type="button" class="flex items-center gap-2 text-left" @click="goHome">
        <span class="text-2xl" aria-hidden="true">🛠️</span>
        <span>
          <span class="block text-lg font-bold">{{ t('app.title') }}</span>
          <span class="block text-xs text-ink-soft">{{ t('app.subtitle') }}</span>
        </span>
      </button>
      <nav aria-label="主导航" class="flex flex-wrap items-center justify-end gap-1.5 text-sm font-semibold">
        <button
          type="button"
          class="min-h-11 rounded-full px-4 py-2"
          :class="route.name === 'home' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          :aria-current="route.name === 'home' ? 'page' : undefined"
          @click="navigate('/')"
        >
          {{ t('nav.home') }}
        </button>
        <button
          type="button"
          class="min-h-11 rounded-full px-4 py-2"
          :class="route.name === 'forge' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          :aria-current="route.name === 'forge' ? 'page' : undefined"
          @click="navigate('/forge')"
        >
          {{ t('nav.forge') }}
        </button>
        <button
          type="button"
          class="min-h-11 rounded-full px-4 py-2"
          :class="route.name === 'journal' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          :aria-current="route.name === 'journal' ? 'page' : undefined"
          @click="navigate('/journal')"
        >
          {{ t('nav.journal') }}
        </button>
        <button
          type="button"
          class="min-h-11 rounded-full px-4 py-2"
          :class="route.name === 'badges' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          :aria-current="route.name === 'badges' ? 'page' : undefined"
          @click="navigate('/badges')"
        >
          {{ t('nav.badges') }}
        </button>
        <button
          type="button"
          data-testid="locale-toggle"
          class="min-h-11 min-w-11 rounded-full bg-paper px-3 py-2 text-xs font-bold text-ink-soft"
          :aria-label="settings.locale === 'en' ? '切换到中文' : 'Switch to English'"
          @click="settings.toggleLocale()"
        >
          {{ settings.locale === 'en' ? '中文' : 'EN' }}
        </button>
      </nav>
    </header>

    <main id="main-content" ref="mainEl" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto focus:outline-none">
      <HomeView v-if="route.name === 'home'" />
      <ForgeView v-else-if="route.name === 'forge'" />
      <WorkshopView
        v-else-if="route.name === 'play' && route.levelId"
        :key="route.levelId"
        :level-id="route.levelId"
      />
      <JournalView v-else-if="route.name === 'journal'" />
      <BadgesView v-else-if="route.name === 'badges'" />
      <ReportView v-else-if="route.name === 'report'" />
      <HomeView v-else />
    </main>
  </div>
</template>
