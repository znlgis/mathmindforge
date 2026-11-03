<script setup lang="ts">
import type { ClaimInput, LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { wilsonInterval } from '@mmf/toolkit/shared';
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
const red = computed(() => dataset.value?.counts?.red ?? 0);
const total = computed(() => dataset.value?.counts?.total ?? 0);
const batches = computed(() => dataset.value?.counts?.batches ?? 0);
const claim = computed(() => props.snapshot.toolState.probe?.claim);
const sizes = computed(() => props.spec.config.sampleSizes ?? [20]);
const busy = ref(false);
const error = ref<string | null>(null);

const stats = computed(() => {
  if (total.value <= 0) return null;
  const p = red.value / total.value;
  // 与 SampleTool 共用 toolkit 的 Wilson 实现：各写一份，区间口径早晚会漂移。
  const interval = wilsonInterval(red.value, total.value);
  return { p, low: interval.low, high: interval.high };
});

function percent(value: number): string {
  return (Math.round(value * 1000) / 10).toFixed(1) + '%';
}

async function sample(n: number): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'probe/sample', payload: { n } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function clear(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'probe/clear', payload: {} });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function submitClaim(): Promise<void> {
  const current = stats.value;
  if (busy.value || !current) return;
  busy.value = true;
  error.value = null;
  try {
    const claimInput: ClaimInput = {
      kind: 'stat',
      statistic: 'proportion',
      value: Math.round(current.p * 10000) / 10000,
      n: total.value,
      ci: [Math.round(current.low * 10000) / 10000, Math.round(current.high * 10000) / 10000],
    };
    const action: LevelAction = { type: 'probe/claim', payload: { claim: claimInput } };
    const result = await props.runtime.dispatch(action);
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="sampling-tool" class="mt-3 flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">
        样本 <span data-testid="sampling-count">{{ red }} / {{ total }}</span> · {{ batches }} 批
      </p>
      <span
        v-if="claim"
        data-testid="sampling-claim-ready"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        结论已记录
      </span>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="n in sizes"
        :key="n"
        type="button"
        :data-testid="'sampling-sample-' + n"
        :disabled="busy"
        class="min-h-11 rounded-xl bg-blueprint px-4 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
        @click="sample(n)"
      >
        再抽 {{ n }} 个
      </button>
      <button
        type="button"
        data-testid="sampling-clear"
        :disabled="busy"
        class="min-h-11 rounded-xl bg-card px-4 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="clear"
      >
        倒回袋里
      </button>
    </div>

    <div v-if="stats" class="rounded-2xl border border-grid bg-paper p-3 text-xs">
      <p class="font-bold text-ink">样本比例 {{ percent(stats.p) }}</p>
      <p data-testid="sampling-ci" class="mt-1 text-ink-soft">
        95% 区间：{{ percent(stats.low) }} – {{ percent(stats.high) }}
      </p>
    </div>
    <p v-else class="text-xs text-ink-soft">还没有样本。至少抽两批，每批 20 个。</p>

    <button
      type="button"
      data-testid="sampling-claim"
      :disabled="busy || !stats"
      class="min-h-11 rounded-xl bg-brass px-4 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
      @click="submitClaim"
    >
      用样本比例与区间记录结论
    </button>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
