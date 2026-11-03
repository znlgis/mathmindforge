<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

const dataset = computed(() => props.snapshot.toolState.probe?.dataset);
const counts = computed(() => dataset.value?.counts ?? null);
const busy = ref(false);
const error = ref<string | null>(null);

async function sample(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'probe/sample', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="invariant-tool">
    <p class="text-xs text-ink-soft">把图形按棋盘染色，数一数黑格与白格。</p>
    <button
      type="button"
      data-testid="invariant-sample"
      :disabled="busy"
      class="min-h-12 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
      @click="sample"
    >
      统计黑白格
    </button>
    <div v-if="counts" data-testid="invariant-counts" class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">黑格</p>
        <p class="text-lg font-black text-ink">{{ counts.black }}</p>
      </div>
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">白格</p>
        <p class="text-lg font-black text-ink">{{ counts.white }}</p>
      </div>
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">总格</p>
        <p class="text-lg font-black text-ink">{{ counts.cells }}</p>
      </div>
    </div>
    <p v-else class="text-xs text-ink-soft">还没有统计。</p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
