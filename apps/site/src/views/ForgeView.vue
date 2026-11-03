<script setup lang="ts">
import { BAND_LABELS, THREAD_LABELS, TOOL_LABELS } from '@mmf/content/ids';
import { LEVEL_SUMMARIES, localizedSummary } from '@mmf/content';
import { navigate } from '../router';
import { computed } from 'vue';
import { useI18n } from '../shell/useI18n';
import { useProgress } from '../stores/progress';

const { t, locale } = useI18n();
const levels = computed(() => LEVEL_SUMMARIES.map((level) => ({
  ...level,
  ...localizedSummary(level, locale.value),
})));
const progress = useProgress();
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-8">
    <h1 class="text-2xl font-black text-blueprint">{{ t('forge.title') }}</h1>
    <p class="mt-1 text-sm text-ink-soft">{{ t('forge.subtitle') }}</p>

    <div class="mt-6 grid gap-4 md:grid-cols-2">
      <article
        v-for="level in levels"
        :key="level.id"
        class="flex flex-col rounded-3xl border border-grid bg-card p-6 shadow-sm"
        :data-testid="'level-card-' + level.id"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold tracking-widest text-brass">
              {{ BAND_LABELS[level.band] }} · {{ THREAD_LABELS[level.thread] }}
            </p>
            <h2 class="mt-1 text-2xl font-black">{{ level.emoji }} {{ level.title }}</h2>
          </div>
          <span v-if="progress.save?.levels[level.id]?.completed" class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal">
            {{ t('forge.done') }}
          </span>
        </div>
        <p class="mt-3 text-sm font-semibold text-ink-soft">{{ t('forge.thinking') }}</p>
        <p class="mt-1 text-base">{{ level.thinkingTarget }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <span
            v-for="tool in level.tools"
            :key="tool"
            class="rounded-full border border-grid bg-paper px-3 py-1 text-xs font-semibold"
          >
            {{ TOOL_LABELS[tool] }}
          </span>
          <span class="rounded-full bg-lavender px-3 py-1 text-xs font-semibold">{{ level.estimatedMinutes }} 分钟</span>
        </div>
        <button
          type="button"
          class="mt-6 min-h-12 rounded-2xl bg-teal px-5 text-base font-bold text-white active:scale-95"
          :data-testid="'level-enter-' + level.id"
          @click="navigate('/play/' + level.id)"
        >
          {{ t('forge.enter') }} →
        </button>
      </article>
    </div>
  </section>
</template>
