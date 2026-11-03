<script setup lang="ts">
/**
 * 墨点向导：只在"还没走完这一步"时出现的一句话提示。
 * 设计取舍（docs/01 §2）：不评价、不卖萌、不打断，所以是画布角上的小气泡，
 * 不是模态框；点"知道了"才前进，点"不用了"就这一轮不再出现。
 *
 * variant：
 * - floating：贴在画布左下角（有画布的关，不占布局高度）；
 * - inline：占一行的卡片（16/20 关没有画布，浮在按钮上会挡住操作）。
 */
withDefaults(defineProps<{
  title: string;
  step: string;
  index: number;
  total: number;
  nextLabel: string;
  skipLabel: string;
  variant?: 'floating' | 'inline';
}>(), { variant: 'floating' });

const emit = defineEmits<{ next: []; dismiss: [] }>();
</script>

<template>
  <div
    data-testid="guide-bubble"
    class="z-30"
    :class="variant === 'floating' ? 'pointer-events-none absolute bottom-3 left-3 max-w-sm' : 'shrink-0 px-3 py-1.5'"
    role="status"
    aria-live="polite"
  >
    <div
      class="rounded-3xl border border-grid bg-card/95 shadow-lg backdrop-blur"
      :class="variant === 'floating' ? 'pointer-events-auto p-3' : 'p-2'"
    >
      <div class="flex items-center gap-2">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blueprint text-xs text-white" aria-hidden="true">
          🖋️
        </span>
        <p class="text-xs font-bold tracking-wide text-blueprint">{{ title }}</p>
        <span class="ml-auto text-[11px] font-semibold text-ink-soft">{{ index + 1 }}/{{ total }}</span>
      </div>
      <div class="mt-1 flex items-center gap-2">
        <p class="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink">{{ step }}</p>
        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-testid="guide-skip"
            class="min-h-8 rounded-xl px-2.5 text-xs font-bold text-ink-soft active:scale-95"
            @click="emit('dismiss')"
          >
            {{ skipLabel }}
          </button>
          <button
            type="button"
            data-testid="guide-next"
            class="min-h-8 rounded-xl bg-teal px-3 text-xs font-bold text-white active:scale-95"
            @click="emit('next')"
          >
            {{ nextLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
