<script setup lang="ts">
import type { ClaimInput, LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { wilsonInterval } from '@mmf/toolkit/shared';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

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

/** 每一批的比例：runtime 把每批存成 groups['batch-n'] = [n, red]，两批的波动才有得比。 */
const batchRows = computed(() => {
  const groups = dataset.value?.groups ?? {};
  return Object.entries(groups)
    .map(([id, values]) => ({ id, n: values[0] ?? 0, red: values[1] ?? 0 }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }))
    .map((row) => ({
      ...row,
      proportion: row.n > 0 ? row.red / row.n : 0,
    }));
});

const stats = computed(() => {
  if (total.value <= 0) return null;
  const p = red.value / total.value;
  // 与 KnobTool 共用 toolkit 的 Wilson 实现：各写一份，区间口径早晚会漂移。
  const interval = wilsonInterval(red.value, total.value);
  return { p, low: interval.low, high: interval.high };
});

function percent(value: number): string {
  return (Math.round(value * 1000) / 10).toFixed(1) + '%';
}

/** 进入工具卡就自动抽两批：两批比例差多少才是这一关要看的东西，玩家只需要看数据、写结论。 */
async function ensureBatches(): Promise<void> {
  if (busy.value || batches.value > 0 || total.value > 0) return;
  const size = sizes.value[0] ?? 20;
  busy.value = true;
  error.value = null;
  try {
    for (let index = 0; index < 2; index += 1) {
      const result = await props.runtime.dispatch({ type: 'probe/sample', payload: { n: size } });
      if (!result.ok) {
        error.value = result.message ? props.t.t(result.message) : null;
        return;
      }
    }
  } finally {
    busy.value = false;
  }
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 自动抽样放在宏任务里：autoplay 调试路径整段在微任务里跑完，
 * 不能让它和自动抽样抢同一个运行时（否则自动播放的样本序列会被多抽两批打乱）。
 * 正常游玩时这一拍只有一帧，玩家看不到空样本。
 */
function scheduleBatches(): void {
  if (autoTimer !== null) return;
  autoTimer = setTimeout(() => {
    autoTimer = null;
    void ensureBatches();
  }, 0);
}

onMounted(scheduleBatches);
// 「重来」会把样本清空（批次与总数回到 0）：再自动抽两批。
watch([batches, total], () => {
  if (batches.value === 0 && total.value === 0) scheduleBatches();
});
onBeforeUnmount(() => {
  if (autoTimer !== null) clearTimeout(autoTimer);
  autoTimer = null;
});

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

    <!-- 每批比例同屏：两批的波动就是这一关要看见的东西，不能只给累计值。 -->
    <div v-if="batchRows.length > 0" class="rounded-2xl border border-grid bg-paper p-3" data-testid="sampling-batches">
      <p class="text-xs font-bold text-ink">每批样本比例</p>
      <ul class="mt-2 flex flex-col gap-1 text-xs font-semibold text-ink">
        <li
          v-for="(row, index) in batchRows"
          :key="row.id"
          :data-testid="'sampling-batch-' + (index + 1)"
          class="flex items-center justify-between gap-2"
        >
          <span class="text-ink-soft">第 {{ index + 1 }} 批</span>
          <span>{{ row.red }} / {{ row.n }}</span>
          <span class="font-black">{{ percent(row.proportion) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="stats" class="rounded-2xl border border-grid bg-paper p-3 text-xs">
      <p class="font-bold text-ink">合计样本比例 {{ percent(stats.p) }}</p>
      <p data-testid="sampling-ci" class="mt-1 text-ink-soft">
        95% 区间：{{ percent(stats.low) }} – {{ percent(stats.high) }}
      </p>
    </div>
    <p v-else class="text-xs text-ink-soft">正在自动抽两批样本（每批 {{ sizes[0] ?? 20 }} 个）……</p>

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
