<script setup lang="ts">
import type { BadgeId } from '@mmf/content/ids';
import type { BadgeView } from '@mmf/evidence';
import { useI18n } from '../shell/useI18n';

defineProps<{ badges: BadgeView[] }>();

const { t } = useI18n();

/**
 * 徽章数据里没有图案字段（证据层只管"授没授"），
 * 贴纸图案属于外壳的视觉决定，所以放在这里而不是 @mmf/evidence。
 */
const STICKER_EMOJI: Record<BadgeId, string> = {
  observer: '👀',
  'pattern-spotter': '🧩',
  'rule-designer': '📜',
  builder: '🧱',
  modeler: '⚙️',
  experimenter: '🔬',
  'boundary-explorer': '🧭',
  reviser: '🔁',
  transferer: '🌈',
};

/** 已获得的贴纸微微歪一点，像真的贴上去的；灰度虚线的是还没收集到的空位。 */
const STICKER_TILT = ['-rotate-1', 'rotate-1', 'rotate-2', '-rotate-2', 'rotate-1', '-rotate-1'];

function percent(current: number, target: number): string {
  return Math.round((Math.min(current, target) / Math.max(1, target)) * 100) + '%';
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3 lg:grid-cols-4">
    <article
      v-for="(badge, index) in badges"
      :key="badge.id"
      :data-testid="'badge-' + badge.id"
      class="flex min-w-0 flex-col items-center rounded-[26px] border-2 p-3 text-center transition-transform sm:p-4"
      :class="badge.earned
        ? 'border-teal/40 bg-card shadow-md ' + STICKER_TILT[index % STICKER_TILT.length]
        : 'border-dashed border-grid bg-paper/80 opacity-80 grayscale'"
    >
      <div
        class="grid h-16 w-16 place-items-center rounded-full border-4 sm:h-20 sm:w-20"
        :class="badge.earned ? 'border-card bg-mint' : 'border-card bg-cream'"
      >
        <span class="text-3xl sm:text-4xl" aria-hidden="true">{{ STICKER_EMOJI[badge.id] }}</span>
      </div>
      <p
        class="mt-2 break-words text-sm font-black leading-tight"
        :class="badge.earned ? 'text-ink' : 'text-ink-soft'"
      >
        {{ badge.title }}
      </p>
      <p class="mt-1 text-[11px] leading-4 text-ink-soft">{{ badge.criteria }}</p>
      <div class="mt-auto w-full pt-3">
        <div class="h-1.5 overflow-hidden rounded-full bg-grid">
          <div
            class="h-full rounded-full transition-all"
            :class="badge.earned ? 'bg-teal' : 'bg-brass'"
            :style="{ width: percent(badge.progress.current, badge.progress.target) }"
          />
        </div>
        <p class="mt-1 flex flex-wrap items-baseline justify-center gap-x-1 text-[11px] font-semibold text-ink-soft">
          <span>{{ t('badges.progress', { current: Math.min(badge.progress.current, badge.progress.target), target: badge.progress.target }) }}</span>
          <span v-if="badge.earned" :data-testid="'badge-earned-' + badge.id" class="font-bold text-teal">
            {{ t('badges.earned') }}
          </span>
        </p>
      </div>
    </article>
  </div>
</template>
