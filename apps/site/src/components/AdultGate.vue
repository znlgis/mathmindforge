<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

const emit = defineEmits<{ unlock: [] }>();

const holding = ref(false);
let timer: number | null = null;

function clearTimer(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function start(): void {
  if (holding.value) return;
  holding.value = true;
  clearTimer();
  timer = window.setTimeout(() => {
    timer = null;
    holding.value = false;
    emit('unlock');
  }, 3000);
}

function cancel(): void {
  clearTimer();
  holding.value = false;
}

onBeforeUnmount(clearTimer);
</script>

<template>
  <div
    data-testid="adult-gate"
    class="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-grid bg-card p-8 text-center"
  >
    <p class="text-3xl" aria-hidden="true">🗄️</p>
    <h1 class="text-xl font-black text-blueprint">家长 / 教师入口</h1>
    <p class="text-sm leading-6 text-ink-soft">
      报告只在本机生成，不含正确率、刷题量或排名。长按下面的按钮 3 秒进入。
    </p>
    <button
      type="button"
      data-testid="adult-hold"
      class="min-h-14 w-full max-w-sm rounded-2xl px-5 text-base font-bold text-white active:scale-95"
      :class="holding ? 'bg-brass' : 'bg-blueprint'"
      @pointerdown.prevent="start"
      @pointerup="cancel"
      @pointerleave="cancel"
      @pointercancel="cancel"
      @keydown.space.prevent="start"
      @keyup.space="cancel"
      @keydown.enter.prevent="start"
      @keyup.enter="cancel"
    >
      {{ holding ? '继续按住…' : '长按 3 秒查看报告' }}
    </button>
  </div>
</template>
