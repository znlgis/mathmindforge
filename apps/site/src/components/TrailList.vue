<script setup lang="ts">
import type { TrailItem } from '@mmf/evidence';

defineProps<{ items: TrailItem[] }>();

function formatTime(at: number): string {
  return new Date(at).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<template>
  <div v-if="items.length === 0" class="rounded-2xl border border-grid bg-card p-6 text-sm text-ink-soft">
    还没有思维轨迹。完成一关后，观察、运行与修正会留在这里。
  </div>
  <ol v-else class="relative flex flex-col gap-3 border-l border-grid pl-5">
    <li
      v-for="item in items"
      :key="item.id"
      :data-testid="'trail-item-' + item.id"
      class="relative rounded-2xl border border-grid bg-card p-4"
    >
      <span
        class="absolute -left-[27px] top-5 h-2.5 w-2.5 rounded-full border-2 border-paper"
        :class="item.outcome === 'fail' ? 'bg-red' : item.outcome === 'pass' ? 'bg-teal' : 'bg-brass'"
        aria-hidden="true"
      />
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-sm font-bold text-ink">{{ item.title }} · {{ item.phaseLabel }}</p>
        <span class="text-[11px] font-semibold text-ink-soft">{{ formatTime(item.at) }}</span>
      </div>
      <p class="mt-1 text-sm leading-6 text-ink-soft">{{ item.label }}</p>
      <p v-if="item.failureClass" class="mt-1 text-[11px] font-semibold text-red">
        结构反馈：{{ item.failureClass }}
      </p>
    </li>
  </ol>
</template>
