<script setup lang="ts">
import { LEVEL_SUMMARIES } from '@mmf/content';
import { evaluateBadges } from '@mmf/evidence';
import { computed, onMounted } from 'vue';
import BadgeGrid from '../components/BadgeGrid.vue';
import { emptySave } from '@mmf/progress';
import { useProgress } from '../stores/progress';
import { useI18n } from '../shell/useI18n';

const progress = useProgress();
const { t, locale } = useI18n();

const badges = computed(() => evaluateBadges(
  progress.save ?? emptySave(0),
  progress.evidence,
  LEVEL_SUMMARIES,
  locale.value,
));
const earned = computed(() => badges.value.filter((badge) => badge.earned).length);
const percent = computed(() => Math.round((earned.value / Math.max(1, badges.value.length)) * 100));
/** conic-gradient 画进度环：不引 SVG，环的百分比与贴纸数天然同步。 */
const ringStyle = computed(() => ({
  background: 'conic-gradient(var(--color-teal) ' + percent.value + '%, var(--color-grid) 0)',
}));

onMounted(async () => {
  await progress.init();
  await progress.loadEvidence(300);
  await progress.refreshBadges();
});
</script>

<template>
  <section data-testid="badges-view" class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-black text-blueprint sm:text-3xl">{{ t('badges.title') }}</h1>
        <p class="mt-1 text-sm text-ink-soft">{{ t('badges.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="grid h-16 w-16 shrink-0 place-items-center rounded-full"
          :style="ringStyle"
          role="img"
          :aria-label="t('badges.count', { earned, total: badges.length })"
        >
          <span class="grid h-12 w-12 place-items-center rounded-full bg-card text-xs font-black text-teal">
            {{ earned }}/{{ badges.length }}
          </span>
        </div>
        <span class="rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-soft">
          {{ t('badges.count', { earned, total: badges.length }) }}
        </span>
      </div>
    </div>
    <div class="mt-6">
      <BadgeGrid :badges="badges" />
    </div>
  </section>
</template>
