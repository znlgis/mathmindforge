<script setup lang="ts">
import type { BadgeView } from '@mmf/evidence';

defineProps<{ badges: BadgeView[] }>();
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <article
      v-for="badge in badges"
      :key="badge.id"
      :data-testid="'badge-' + badge.id"
      class="flex flex-col rounded-3xl border p-5"
      :class="badge.earned ? 'border-teal bg-card' : 'border-grid bg-paper opacity-80'"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="text-base font-black" :class="badge.earned ? 'text-teal' : 'text-ink-soft'">
          {{ badge.title }}
        </p>
        <span class="text-2xl" aria-hidden="true">{{ badge.earned ? '🏅' : '🔒' }}</span>
      </div>
      <p class="mt-2 flex-1 text-sm leading-6 text-ink-soft">{{ badge.criteria }}</p>
      <div class="mt-4">
        <div class="h-2 overflow-hidden rounded-full bg-grid">
          <div
            class="h-full rounded-full transition-all"
            :class="badge.earned ? 'bg-teal' : 'bg-brass'"
            :style="{ width: Math.min(100, Math.round((badge.progress.current / Math.max(1, badge.progress.target)) * 100)) + '%' }"
          />
        </div>
        <p class="mt-1 text-[11px] font-semibold text-ink-soft">
          {{ Math.min(badge.progress.current, badge.progress.target) }} / {{ badge.progress.target }}
          <span v-if="badge.earned" :data-testid="'badge-earned-' + badge.id" class="ml-2 text-teal">已获得</span>
        </p>
      </div>
    </article>
  </div>
</template>
