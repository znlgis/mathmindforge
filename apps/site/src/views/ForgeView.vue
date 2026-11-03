<script setup lang="ts">
import type { Band, ShippedLevelId, ThreadId } from '@mmf/content/ids';
import { THREADS } from '@mmf/content/ids';
import { LEVEL_SUMMARIES, localizedSummary } from '@mmf/content';
import { computed, ref } from 'vue';
import { navigate } from '../router';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';
import {
  bandGroups, nextLevelId, recommendedLevelId, threadLevels,
} from '../shell/progression';
import type { LevelNode } from '../shell/progression';

const { t, locale } = useI18n();
const progress = useProgress();

/**
 * 视角只决定"怎么分组"，不决定"有哪些关卡"：
 * 孩子默认按学段一横带一横带往上走，家长/老师可以切到主线看四条能力线。
 */
const view = ref<'band' | 'thread'>('band');

const BAND_EMOJI: Record<Band, string> = {
  k: '🧸', g13: '🚀', g46: '🧭', g79: '⚙️', g1012: '🎓',
};
const THREAD_EMOJI: Record<ThreadId, string> = {
  structure: '🧩', algorithm: '🛠️', modeling: '📈', data: '🔎',
};

interface StarSection {
  key: string;
  emoji: string;
  label: string;
  levels: LevelNode[];
  completedCount: number;
}

const sections = computed<StarSection[]>(() => {
  if (view.value === 'thread') {
    return THREADS.map((thread) => {
      const levels = threadLevels(progress.save, locale.value, thread);
      return {
        key: thread,
        emoji: THREAD_EMOJI[thread],
        label: t('thread.' + thread),
        levels,
        completedCount: levels.filter((node) => node.completed).length,
      };
    }).filter((section) => section.levels.length > 0);
  }
  return bandGroups(progress.save, locale.value).map((group) => ({
    key: group.band,
    emoji: BAND_EMOJI[group.band],
    label: t('band.' + group.band),
    levels: group.levels,
    completedCount: group.completedCount,
  })).filter((section) => section.levels.length > 0);
});

function localizedLevel(id: ShippedLevelId) {
  const summary = LEVEL_SUMMARIES.find((level) => level.id === id);
  if (!summary) return null;
  return { ...summary, ...localizedSummary(summary, locale.value) };
}

/** 今天先玩这一关：登记顺序上第一个还没通过的关，不跨学段乱跳。 */
const recommended = computed(() => {
  const id = recommendedLevelId(progress.save);
  return id ? localizedLevel(id) : null;
});

/** 接着上次玩：从上次打开的那一关往后找；没有历史时等价于"今天先玩"。 */
const continueLevel = computed(() => {
  const levels = progress.save?.levels;
  let last: ShippedLevelId | null = null;
  let lastAt = -1;
  if (levels) {
    for (const id of Object.keys(levels) as ShippedLevelId[]) {
      const at = levels[id]?.lastPlayedAt;
      if (typeof at === 'number' && at > lastAt) {
        last = id;
        lastAt = at;
      }
    }
  }
  const id = nextLevelId(progress.save, last) ?? recommendedLevelId(progress.save);
  return id ? localizedLevel(id) : null;
});

function percent(done: number, total: number): string {
  return Math.round((done / Math.max(1, total)) * 100) + '%';
}

function enterLevel(level: LevelNode): void {
  if (!level.unlocked) return;
  navigate('/play/' + level.summary.id);
}
</script>

<template>
  <section data-testid="forge-view" class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-5">
    <header class="min-w-0">
      <h1 class="text-2xl font-black text-blueprint sm:text-3xl">{{ t('forge.title') }}</h1>
      <p class="mt-1 text-sm text-ink-soft">{{ t('forge.subtitle') }}</p>
    </header>

    <div class="mt-6 grid gap-3 sm:grid-cols-2">
      <button
        v-if="recommended"
        type="button"
        data-testid="forge-recommended"
        class="flex min-h-16 min-w-0 items-center gap-3 rounded-3xl bg-blueprint px-4 py-3 text-left text-white shadow-sm active:scale-[0.99]"
        @click="navigate('/play/' + recommended.id)"
      >
        <span class="text-3xl" aria-hidden="true">{{ recommended.emoji }}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-[11px] font-bold tracking-widest text-mint">{{ t('forge.recommended') }}</span>
          <span class="mt-0.5 block truncate text-lg font-black">{{ recommended.title }}</span>
        </span>
        <span class="text-xl" aria-hidden="true">▶</span>
      </button>
      <button
        v-if="continueLevel"
        type="button"
        data-testid="forge-continue"
        class="flex min-h-16 min-w-0 items-center gap-3 rounded-3xl border border-teal bg-card px-4 py-3 text-left text-ink shadow-sm active:scale-[0.99]"
        @click="navigate('/play/' + continueLevel.id)"
      >
        <span class="text-3xl" aria-hidden="true">{{ continueLevel.emoji }}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-[11px] font-bold tracking-widest text-teal">{{ t('forge.continue') }}</span>
          <span class="mt-0.5 block truncate text-lg font-black">{{ continueLevel.title }}</span>
        </span>
        <span class="text-xl text-teal" aria-hidden="true">▶</span>
      </button>
    </div>
    <p
      v-if="!recommended"
      class="mt-6 rounded-3xl border border-teal bg-mint px-5 py-4 text-base font-bold text-teal"
    >
      {{ t('forge.allDone') }}
    </p>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <div role="group" class="flex rounded-full border border-grid bg-card p-1">
        <button
          type="button"
          data-testid="forge-view-band"
          class="min-h-9 rounded-full px-4 text-sm font-bold"
          :class="view === 'band' ? 'bg-blueprint text-white' : 'text-ink-soft'"
          :aria-pressed="view === 'band'"
          @click="view = 'band'"
        >
          {{ t('forge.viewByBand') }}
        </button>
        <button
          type="button"
          data-testid="forge-view-thread"
          class="min-h-9 rounded-full px-4 text-sm font-bold"
          :class="view === 'thread' ? 'bg-blueprint text-white' : 'text-ink-soft'"
          :aria-pressed="view === 'thread'"
          @click="view = 'thread'"
        >
          {{ t('forge.viewByThread') }}
        </button>
      </div>
    </div>

    <div class="mt-4 flex flex-col gap-5">
      <section
        v-for="group in sections"
        :key="group.key"
        :data-testid="'group-' + group.key"
        class="rounded-3xl border border-grid bg-paper/60 p-3 sm:p-4"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
          <span class="text-2xl" aria-hidden="true">{{ group.emoji }}</span>
          <h2 class="text-lg font-black text-ink">{{ group.label }}</h2>
          <span class="rounded-full bg-card px-2.5 py-0.5 text-xs font-bold text-ink-soft">
            {{ t('forge.group', { done: group.completedCount, total: group.levels.length }) }}
          </span>
          <span class="ml-auto h-2 w-20 overflow-hidden rounded-full bg-grid" aria-hidden="true">
            <span
              class="block h-full rounded-full bg-teal"
              :style="{ width: percent(group.completedCount, group.levels.length) }"
            />
          </span>
        </div>

        <ul class="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <li v-for="node in group.levels" :key="node.summary.id" class="min-w-0">
            <article
              class="flex h-full min-w-0 flex-col rounded-2xl border bg-card p-3 shadow-sm"
              :class="node.completed ? 'border-teal/50' : 'border-grid'"
              :data-testid="'level-card-' + node.summary.id"
            >
              <div class="flex items-start justify-between gap-1">
                <span class="text-2xl leading-none" aria-hidden="true">{{ node.summary.emoji }}</span>
                <span
                  v-if="node.completed"
                  class="shrink-0 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-bold text-teal"
                >
                  ✓ {{ t('forge.done') }}
                </span>
                <span
                  v-else-if="!node.unlocked"
                  class="shrink-0 rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-bold text-ink-soft"
                >
                  🔒 {{ t('forge.locked') }}
                </span>
              </div>
              <h3 class="mt-2 text-sm font-black leading-tight text-ink sm:text-base">{{ node.title }}</h3>
              <p class="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-soft sm:text-xs sm:leading-5">
                {{ node.thinkingTarget }}
              </p>
              <div class="mb-3 mt-2 hidden flex-wrap gap-1 sm:flex">
                <span
                  v-for="tool in node.summary.tools"
                  :key="tool"
                  class="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink-soft"
                >
                  {{ t('tool.' + tool + '.title') }}
                </span>
                <span class="rounded-full bg-lavender px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                  ⏱ {{ node.summary.estimatedMinutes }}
                </span>
              </div>
              <button
                type="button"
                class="mt-auto min-h-10 w-full rounded-xl px-2 text-xs font-bold active:scale-95 sm:text-sm"
                :class="node.completed ? 'border border-teal bg-paper text-teal' : 'bg-teal text-white'"
                :data-testid="'level-enter-' + node.summary.id"
                :disabled="!node.unlocked"
                :aria-disabled="!node.unlocked"
                @click="enterLevel(node)"
              >
                {{ node.completed ? t('level.replay') : t('forge.enter') }} →
              </button>
            </article>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
