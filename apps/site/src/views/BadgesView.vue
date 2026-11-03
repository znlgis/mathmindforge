<script setup lang="ts">
import { LEVEL_SUMMARIES } from '@mmf/content';
import { evaluateBadges } from '@mmf/evidence';
import { computed, onMounted } from 'vue';
import BadgeGrid from '../components/BadgeGrid.vue';
import { emptySave } from '@mmf/progress';
import { useProgress } from '../stores/progress';
import { useI18n } from '../shell/useI18n';

const progress = useProgress();
const { locale } = useI18n();

const badges = computed(() => evaluateBadges(
  progress.save ?? emptySave(0),
  progress.evidence,
  LEVEL_SUMMARIES,
  locale.value,
));
const earned = computed(() => badges.value.filter((badge) => badge.earned).length);


onMounted(async () => {
  await progress.init();
  await progress.loadEvidence(300);
  await progress.refreshBadges();
});
</script>

<template>
  <section data-testid="badges-view" class="mx-auto max-w-5xl px-5 py-8">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 class="text-2xl font-black text-blueprint">思想徽章</h1>
        <p class="mt-1 text-sm text-ink-soft">徽章由证据授予，不按通关次数；每一枚都能回到证据。</p>
      </div>
      <span class="rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-soft">
        已获得 {{ earned }} / {{ badges.length }}
      </span>
    </div>
    <div class="mt-6">
      <BadgeGrid :badges="badges" />
    </div>
  </section>
</template>
