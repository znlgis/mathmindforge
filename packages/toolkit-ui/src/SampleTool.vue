<script setup lang="ts">
import type { ClaimInput, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { wilsonInterval } from '@mmf/toolkit/shared';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 probe 成员结构一致；toolkit-ui 不直接依赖 content。 */
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const probe = computed(() => props.snapshot.toolState.probe);
const dataset = computed(() => probe.value?.dataset);
const sampleCount = computed(() => dataset.value?.n ?? 0);
const wins = computed(() => dataset.value?.counts?.wins ?? 0);
const seed = computed(() => dataset.value?.counts?.seed ?? 0);
const claimed = computed(() => probe.value?.claim !== undefined);
const busy = ref(false);
const error = ref<string | null>(null);

const sizes = computed(() => props.spec.config.sampleSizes ?? [100]);

const stats = computed(() => {
  const n = sampleCount.value;
  if (n <= 0) return null;
  const winRate = wins.value / n;
  const interval = wilsonInterval(wins.value, n);
  return { n, winRate, low: interval.low, high: interval.high };
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
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
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
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
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
    const claim: ClaimInput = {
      kind: 'stat',
      statistic: 'proportion',
      value: Math.round(current.winRate * 10000) / 10000,
      n: current.n,
      ci: [Math.round(current.low * 10000) / 10000, Math.round(current.high * 10000) / 10000],
    };
    const result = await props.runtime.dispatch({ type: 'probe/claim', payload: { claim } });
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="sample-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">
        样本量 <span data-testid="sample-count">{{ sampleCount }}</span>
        <template v-if="seed > 0"> · 种子 {{ seed }}</template>
      </p>
      <span
        v-if="claimed"
        data-testid="sample-claim-ready"
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
        :data-testid="'sample-' + n"
        :disabled="busy"
        class="min-h-12 flex-1 rounded-2xl bg-blueprint px-3 text-sm font-black text-white active:scale-95 disabled:opacity-40"
        @click="sample(n)"
      >
        跑 {{ n }} 局
      </button>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="sample-result">
      <template v-if="stats">
        <p class="text-sm font-bold text-ink">
          胜率 <span class="text-lg text-blueprint">{{ percent(stats.winRate) }}</span>
        </p>
        <p class="mt-1 text-xs font-semibold text-ink-soft">
          95% 区间 {{ percent(stats.low) }} ~ {{ percent(stats.high) }} · {{ stats.n }} 局
        </p>
        <p class="mt-1 text-xs text-ink-soft">胜场 {{ wins }} ／ {{ stats.n }}（平局各记半场）</p>
      </template>
      <p v-else class="text-xs text-ink-soft">还没有数据：先确认配置，再跑一次采样。</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="sample-clear"
        :disabled="busy || sampleCount === 0"
        class="min-h-11 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="clear"
      >
        清空数据
      </button>
      <button
        type="button"
        data-testid="sample-claim"
        :disabled="busy || !stats"
        class="min-h-11 flex-1 rounded-xl bg-teal px-3 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
        @click="submitClaim"
      >
        {{ translate('probe.claim') }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
