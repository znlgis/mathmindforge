<script setup lang="ts">
import type { ToolId } from '@mmf/content/ids';
import { getLevelSummary, localizedSummary } from '@mmf/content';
import { computed } from 'vue';
import { navigate } from '../router';
import { recommendedLevelId } from '../shell/progression';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';

const { t, locale } = useI18n();
const progress = useProgress();

/** "接着玩"直接进下一关：孩子回到首页最想做的事是继续，而不是先看星图。 */
const recommended = computed(() => {
  const id = recommendedLevelId(progress.save);
  const summary = id ? getLevelSummary(id) : undefined;
  if (!summary) return null;
  return { id: summary.id, emoji: summary.emoji, ...localizedSummary(summary, locale.value) };
});

const tools: { id: ToolId; key: string }[] = [
  { id: 'pattern', key: 'home.tool.pattern' },
  { id: 'rule', key: 'home.tool.rule' },
  { id: 'construct', key: 'home.tool.construct' },
  { id: 'knob', key: 'home.tool.knob' },
  { id: 'probe', key: 'home.tool.probe' },
  { id: 'counter', key: 'home.tool.counter' },
];
</script>

<template>
  <section class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-5">
    <div class="rounded-3xl border border-grid bg-card p-6 shadow-sm sm:p-8">
      <p class="text-xs font-bold tracking-[0.3em] text-brass">{{ t('app.kicker') }}</p>
      <h1 class="mt-3 text-3xl font-black text-blueprint sm:text-4xl">{{ t('app.title') }}</h1>
      <p class="mt-2 text-lg font-semibold text-ink-soft">{{ t('app.subtitle') }}</p>
      <p class="mt-6 max-w-2xl text-base leading-7">{{ t('home.intro') }}</p>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">{{ t('home.body') }}</p>
      <div class="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="home-start"
          class="min-h-14 rounded-2xl bg-blueprint px-8 text-lg font-bold text-white active:scale-95"
          @click="navigate('/forge')"
        >
          {{ t('home.start') }} →
        </button>
        <button
          v-if="recommended"
          type="button"
          data-testid="home-continue"
          class="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border-2 border-teal bg-card px-5 text-left text-ink active:scale-95"
          @click="navigate('/play/' + recommended.id)"
        >
          <span class="text-2xl" aria-hidden="true">{{ recommended.emoji }}</span>
          <span class="min-w-0">
            <span class="block text-[11px] font-bold tracking-widest text-teal">{{ t('forge.continue') }}</span>
            <span class="block max-w-[12rem] truncate text-base font-black">{{ recommended.title }}</span>
          </span>
        </button>
      </div>
    </div>

    <div>
      <h2 class="text-xl font-bold">{{ t('home.archive') }}</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          data-testid="home-journal"
          class="rounded-2xl border border-grid bg-card p-5 text-left active:scale-95"
          @click="navigate('/journal')"
        >
          <p class="text-sm font-bold text-teal">{{ t('nav.journal') }}</p>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ t('home.archive.journal') }}</p>
        </button>
        <button
          type="button"
          data-testid="home-badges"
          class="rounded-2xl border border-grid bg-card p-5 text-left active:scale-95"
          @click="navigate('/badges')"
        >
          <p class="text-sm font-bold text-brass">{{ t('nav.badges') }}</p>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ t('home.archive.badges') }}</p>
        </button>
        <button
          type="button"
          data-testid="home-report"
          class="rounded-2xl border border-grid bg-card p-5 text-left active:scale-95"
          @click="navigate('/report')"
        >
          <p class="text-sm font-bold text-blueprint">{{ t('nav.report') }}</p>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ t('home.archive.report') }}</p>
        </button>
      </div>
    </div>

    <div>
      <h2 class="text-xl font-bold">{{ t('home.tools') }}</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="tool in tools" :key="tool.id" class="rounded-2xl border border-grid bg-card p-5">
          <p class="text-sm font-bold text-teal">{{ t('tool.' + tool.id + '.title') }}</p>
          <p class="mt-2 text-sm leading-6 text-ink-soft">{{ t(tool.key) }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
