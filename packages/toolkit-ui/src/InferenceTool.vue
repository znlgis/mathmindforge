<script setup lang="ts">
import type { LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
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
const counts = computed(() => dataset.value?.counts);
const claim = computed(() => props.snapshot.toolState.probe?.claim);
const busy = ref(false);
const error = ref<string | null>(null);

function percent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return (value / 100).toFixed(1) + '%';
}

const stats = computed(() => {
  const c = counts.value;
  if (!c || !c.aN || !c.bN) return null;
  return {
    aN: c.aN, bN: c.bN, aSuccess: c.aSuccess ?? 0, bSuccess: c.bSuccess ?? 0,
    aRate: (c.aSuccess ?? 0) / c.aN,
    bRate: (c.bSuccess ?? 0) / c.bN,
    aLow: c.aLow ?? 0, aHigh: c.aHigh ?? 0,
    bLow: c.bLow ?? 0, bHigh: c.bHigh ?? 0,
    overlap: c.overlap === 1,
  };
});

async function focus(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await props.runtime.dispatch({ type: 'probe/focus', payload: { id: 'inference-table' } });
  } finally {
    busy.value = false;
  }
}

async function choose(direction: 1 | -1 | 0): Promise<void> {
  const current = stats.value;
  if (busy.value || !current) return;
  busy.value = true;
  error.value = null;
  try {
    const rawDelta = current.aRate - current.bRate;
    const delta = direction === 0 ? 0 : direction * Math.abs(rawDelta);
    const low = direction === 0 ? -0.2 : Math.max(0.001, delta - 0.25);
    const high = direction === 0 ? 0.2 : Math.min(0.999, delta + 0.25);
    const action: LevelAction = {
      type: 'probe/claim',
      payload: {
        claim: {
          kind: 'difference',
          delta: Math.round(delta * 10000) / 10000,
          ci: [Math.round(low * 10000) / 10000, Math.round(high * 10000) / 10000],
          n: current.aN + current.bN,
        },
      },
    };
    const result = await props.runtime.dispatch(action);
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="inference-tool" class="mt-3 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-bold text-ink">两组比较</p>
      <button type="button" data-testid="inference-focus" class="min-h-10 rounded-xl bg-blueprint px-3 text-xs font-bold text-white" @click="focus">
        查看区间
      </button>
    </div>
    <div v-if="stats" class="grid gap-2 sm:grid-cols-2">
      <article class="rounded-2xl border border-grid bg-paper p-3">
        <p class="text-xs font-bold text-ink">A 组</p>
        <p class="mt-1 text-lg font-black">{{ percent(stats.aRate * 100) }}</p>
        <p class="text-[11px] text-ink-soft">{{ stats.aSuccess }} / {{ stats.aN }} · 区间 {{ percent(stats.aLow) }}–{{ percent(stats.aHigh) }}</p>
      </article>
      <article class="rounded-2xl border border-grid bg-paper p-3">
        <p class="text-xs font-bold text-ink">B 组</p>
        <p class="mt-1 text-lg font-black">{{ percent(stats.bRate * 100) }}</p>
        <p class="text-[11px] text-ink-soft">{{ stats.bSuccess }} / {{ stats.bN }} · 区间 {{ percent(stats.bLow) }}–{{ percent(stats.bHigh) }}</p>
      </article>
    </div>
    <p v-else class="text-xs text-ink-soft">还没有两组样本。</p>
    <p v-if="stats" class="text-xs font-semibold" :class="stats.overlap ? 'text-red' : 'text-teal'">
      {{ stats.overlap ? '两组区间重叠：差异还不明确' : '两组区间不重叠：方向可判断' }}
    </p>

    <div class="flex flex-wrap gap-2">
      <button type="button" data-testid="inference-a-higher" :disabled="busy" class="min-h-10 rounded-xl bg-card px-3 text-xs font-bold text-ink" @click="choose(1)">A 更高</button>
      <button type="button" data-testid="inference-b-higher" :disabled="busy" class="min-h-10 rounded-xl bg-card px-3 text-xs font-bold text-ink" @click="choose(-1)">B 更高</button>
      <button type="button" data-testid="inference-no-clear" :disabled="busy" class="min-h-10 rounded-xl bg-card px-3 text-xs font-bold text-ink" @click="choose(0)">差异不明确</button>
    </div>
    <p v-if="claim" data-testid="inference-claim-ready" class="text-xs font-bold text-teal">结论已记录</p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
