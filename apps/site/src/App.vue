<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue';
import { navigate, useRoute } from './router';
import { initDebug } from './shell/debug';
import { useI18n } from './shell/useI18n';
import { useProgress } from './stores/progress';
import { useSettings } from './stores/settings';
import HomeView from './views/HomeView.vue';
import ForgeView from './views/ForgeView.vue';

const WorkshopView = defineAsyncComponent(() => import('./views/WorkshopView.vue'));
const JournalView = defineAsyncComponent(() => import('./views/JournalView.vue'));
const BadgesView = defineAsyncComponent(() => import('./views/BadgesView.vue'));
const ReportView = defineAsyncComponent(() => import('./views/ReportView.vue'));

const route = useRoute();
const progress = useProgress();
const settings = useSettings();
const { t } = useI18n();

onMounted(() => {
  initDebug();
  settings.init();
  void progress.init();
});

function goHome(): void {
  navigate('/');
}
</script>

<template>
  <div class="flex h-full flex-col bg-cream text-ink">
    <header
      v-if="route.name !== 'play'"
      class="flex items-center justify-between border-b border-grid bg-paper px-4 py-3"
    >
      <button type="button" class="flex items-center gap-2 text-left" @click="goHome">
        <span class="text-2xl" aria-hidden="true">🛠️</span>
        <span>
          <span class="block text-lg font-bold">{{ t('app.title') }}</span>
          <span class="block text-xs text-ink-soft">{{ t('app.subtitle') }}</span>
        </span>
      </button>
      <nav class="flex flex-wrap items-center justify-end gap-1.5 text-sm font-semibold">
        <button
          type="button"
          class="rounded-full px-4 py-2"
          :class="route.name === 'home' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="navigate('/')"
        >
          {{ t('nav.home') }}
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2"
          :class="route.name === 'forge' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="navigate('/forge')"
        >
          {{ t('nav.forge') }}
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2"
          :class="route.name === 'journal' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="navigate('/journal')"
        >
          {{ t('nav.journal') }}
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2"
          :class="route.name === 'badges' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="navigate('/badges')"
        >
          {{ t('nav.badges') }}
        </button>
        <button
          type="button"
          data-testid="locale-toggle"
          class="rounded-full bg-paper px-3 py-2 text-xs font-bold text-ink-soft"
          @click="settings.toggleLocale()"
        >
          {{ settings.locale === 'en' ? '中文' : 'EN' }}
        </button>
      </nav>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto">
      <HomeView v-if="route.name === 'home'" />
      <ForgeView v-else-if="route.name === 'forge'" />
      <WorkshopView v-else-if="route.name === 'play' && route.levelId" :level-id="route.levelId" />
      <JournalView v-else-if="route.name === 'journal'" />
      <BadgesView v-else-if="route.name === 'badges'" />
      <ReportView v-else-if="route.name === 'report'" />
    </main>
  </div>
</template>
