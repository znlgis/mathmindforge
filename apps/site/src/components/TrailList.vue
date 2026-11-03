<script setup lang="ts">
import type { TrailItem } from '@mmf/evidence';
import { useI18n } from '../shell/useI18n';

const props = defineProps<{
  items: TrailItem[];
  /** 失败类 id → 已本地化的分类名；由宿主页面按 failcat.* 映射后传进来。 */
  failureLabels?: Record<string, string>;
}>();

const { t } = useI18n();

function failureLabel(failureClass: string): string {
  return props.failureLabels?.[failureClass] ?? t('failcat.other');
}

/**
 * buildTrail/localizeTrail 已经把失败类拼进 label 的括号里（"（未通过：pattern-cycle-wrong）"），
 * 宿主之外改不了那两个包，这里在渲染前把原始 id 换成分类名，避免孩子读到英文 id。
 */
function displayLabel(item: TrailItem): string {
  if (!item.failureClass) return item.label;
  return item.label
    .replace('（未通过：' + item.failureClass + '）', '（未通过：' + failureLabel(item.failureClass) + '）')
    .replace(' (failed: ' + item.failureClass + ')', ' (failed: ' + failureLabel(item.failureClass) + ')');
}

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
      class="relative min-w-0 rounded-2xl border border-grid bg-card p-4"
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
      <p class="mt-1 text-sm leading-6 text-ink-soft">{{ displayLabel(item) }}</p>
      <p v-if="item.failureClass" class="mt-1 flex flex-wrap gap-1.5">
        <span
          data-testid="trail-failure"
          class="rounded-full border border-grid bg-paper px-2 py-0.5 text-[11px] font-semibold text-red"
          :title="item.failureClass"
        >
          ⚠ {{ failureLabel(item.failureClass) }}
        </span>
      </p>
    </li>
  </ol>
</template>
