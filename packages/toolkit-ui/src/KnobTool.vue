<script setup lang="ts">
import type { LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { wilsonInterval } from '@mmf/toolkit/shared';
import { computed, ref } from 'vue';
import {
  latestMetricsRow, latestQueueMetricsRow, queuePasses, seedPasses,
} from './metricsRows';
import type { MetricsRow, MetricsTargets, QueueMetricsRow } from './metricsRows';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中 knob 成员结构一致；toolkit-ui 不直接依赖 content。 */
type KnobSpec = Extract<ToolSpecLike, { kind: 'knob' }>;

interface KnobKeyConfig {
  key: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface KnobOption {
  value: number;
  label: string;
}

interface KnobTargets {
  /** dispatch：两个种子日的覆盖率/等待目标 */
  A?: { coverageMin: number; waitMax: number };
  B?: { coverageMin: number; waitMax: number };
  /** queue：平均等待与加班上限 */
  avgWaitMax?: number;
  overtimeMax?: number;
  /** duel：胜率目标线、区间下界、B 种子基线 */
  winRate?: number;
  winRateLow?: number;
  baselineB?: number;
}

/** config 是 passthrough：keys 之外的可选字段只在这一层收窄，读不到就退到默认文案。 */
interface KnobConfigView {
  keys: KnobKeyConfig[];
  options?: Record<string, KnobOption[]>;
  labels?: Record<string, string>;
  /** 新：直接给中文按钮文案（level JSON 里写，不依赖 i18n key）。 */
  runLabel?: string;
  runLabelKey?: string;
  resetLabel?: string;
  /** 可选：有预算的关卡把「成本 / 预算」一起显示出来 */
  budget?: number;
  /** 可选：参数需要加总到固定值（例如 winrate 的 100 点）。 */
  sumTo?: number;
  /** 可选：一档直填的预设加点。 */
  presets?: Record<string, number>[];
  /** 可选：指标面板读哪一类运行记录；缺省按旋钮字段推断。 */
  metricsMode?: 'dispatch' | 'queue' | 'duel';
  /** 可选：目标线（必须上屏，尤其 winrate 的 55% / 50% / 52%）。 */
  targets?: KnobTargets;
}

const DEFAULT_DISPATCH_TARGETS: MetricsTargets = {
  A: { coverageMin: 0.9, waitMax: 18 },
  B: { coverageMin: 0.85, waitMax: 20 },
};

const props = defineProps<{
  spec: KnobSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const config = computed(() => props.spec.config as unknown as KnobConfigView);
const knobState = computed(() => props.snapshot.toolState.knob);
const probe = computed(() => props.snapshot.toolState.probe);
const values = computed<Record<string, number>>(() => knobState.value?.values ?? {});
const budget = computed(() => config.value.budget ?? null);
const sumTo = computed(() => config.value.sumTo ?? null);
const busy = ref(false);
const error = ref<string | null>(null);
/** 数字框的草稿：只保存玩家正在改的那一格，提交后立刻丢掉，其余格回落到快照值。 */
const drafts = ref<Record<string, string>>({});

/** 指标模式：配置优先；老内容没写就按旋钮字段推断，避免静默读不到数据。 */
const mode = computed<'dispatch' | 'queue' | 'duel'>(() => {
  const declared = config.value.metricsMode;
  if (declared) return declared;
  if ('vehicles' in values.value) return 'dispatch';
  if ('servers' in values.value) return 'queue';
  return 'duel';
});

const dispatchTargets = computed<MetricsTargets>(() => {
  const targets = config.value.targets;
  if (targets?.A && targets?.B) return { A: targets.A, B: targets.B };
  return DEFAULT_DISPATCH_TARGETS;
});
const queueTargets = computed(() => ({
  avgWaitMax: config.value.targets?.avgWaitMax ?? 1,
  overtimeMax: config.value.targets?.overtimeMax ?? 0,
}));
const duelTargets = computed(() => ({
  winRate: config.value.targets?.winRate ?? 0.55,
  winRateLow: config.value.targets?.winRateLow ?? 0.5,
  baselineB: config.value.targets?.baselineB ?? 0.52,
}));

const latestRun = computed<MetricsRow | null>(() => (
  mode.value === 'dispatch' ? latestMetricsRow(props.snapshot) : null
));
const latestQueueRun = computed<QueueMetricsRow | null>(() => (
  mode.value === 'queue' ? latestQueueMetricsRow(props.snapshot) : null
));

/** duel 的采样结果由 probe 数据集给出（experiment/runtime.ts 的 dataset-duel）。 */
const duelSample = computed(() => {
  if (mode.value !== 'duel') return null;
  const dataset = probe.value?.dataset;
  if (!dataset || dataset.id !== 'dataset-duel' || dataset.n <= 0) return null;
  const wins = dataset.counts?.wins ?? 0;
  const seed = dataset.counts?.seed ?? 0;
  const rate = wins / dataset.n;
  const interval = wilsonInterval(wins, dataset.n);
  return { n: dataset.n, wins, seed, rate, low: interval.low, high: interval.high };
});

const duelClaim = computed(() => (mode.value === 'duel' ? probe.value?.claim : undefined));

/** 参数动过之后，最后一个运行记录已经不代表当前参数了。 */
const latestIsCurrent = computed(() => {
  if (mode.value === 'dispatch') {
    const row = latestRun.value;
    if (!row) return false;
    return row.vehicles === values.value.vehicles
      && row.teams === values.value.teams
      && row.shift === values.value.shift
      && row.routeIndex === values.value.route;
  }
  if (mode.value === 'queue') {
    const row = latestQueueRun.value;
    if (!row) return false;
    return row.servers === values.value.servers
      && row.serviceTime === values.value.serviceTime
      && row.openMinutes === values.value.openMinutes;
  }
  return duelSample.value !== null;
});

const dispatchPass = computed(() => (
  latestRun.value ? seedPasses(latestRun.value, dispatchTargets.value, budget.value ?? Infinity) : null
));
const queuePass = computed(() => (
  latestQueueRun.value ? queuePasses(latestQueueRun.value, queueTargets.value, budget.value ?? Infinity) : null
));
const duelPass = computed(() => {
  const sample = duelSample.value;
  if (!sample) return null;
  return {
    rate: sample.rate + 1e-9 >= duelTargets.value.winRate,
    low: sample.low + 1e-9 >= duelTargets.value.winRateLow,
  };
});

const allocated = computed(() => Object.values(values.value).reduce((sum, value) => sum + value, 0));
const presets = computed(() => config.value.presets ?? []);

function keyLabel(key: string): string {
  return config.value.labels?.[key] ?? key;
}

function optionsFor(key: string): KnobOption[] {
  return config.value.options?.[key] ?? [];
}

function knobValue(key: string): number {
  return values.value[key] ?? 0;
}

function formatValue(key: KnobKeyConfig): string {
  const raw = knobValue(key.key);
  const unit = key.unit ?? '';
  return unit === '' ? String(raw) : String(raw) + ' ' + unit;
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

async function dispatchAction(action: LevelAction): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch(action);
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}

/** 把任意输入夹回这一档允许的整数档位（与模板侧 normalizeValues 同口径）。 */
function snapToKey(key: KnobKeyConfig, raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const stepped = key.step > 0
    ? key.min + Math.round((raw - key.min) / key.step) * key.step
    : Math.round(raw);
  return Math.min(key.max, Math.max(key.min, stepped));
}

function draftValue(key: KnobKeyConfig): string {
  return drafts.value[key.key] ?? String(knobValue(key.key));
}

function onNumberInput(key: KnobKeyConfig, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  drafts.value = { ...drafts.value, [key.key]: target?.value ?? '' };
}

/** 数字框：blur / Enter 时把整份当前值 dispatch 一次，不逐格累加。 */
async function commitNumber(key: KnobKeyConfig): Promise<void> {
  const draft = drafts.value[key.key];
  if (draft === undefined) return;
  const next = snapToKey(key, Number(draft));
  const cleared = { ...drafts.value };
  delete cleared[key.key];
  drafts.value = cleared;
  if (next === null || sameValue(next, knobValue(key.key))) return;
  await dispatchAction({ type: 'knob/set', payload: { key: key.key, value: next } });
}

async function chooseOption(key: string, value: number): Promise<void> {
  if (sameValue(value, knobValue(key))) return;
  await dispatchAction({ type: 'knob/set', payload: { key, value } });
}

/** 预设档位：一次点击把整组参数写到目标值。 */
async function applyPreset(preset: Record<string, number>): Promise<void> {
  if (busy.value) return;
  for (const key of config.value.keys) {
    const want = preset[key.key];
    if (typeof want !== 'number' || sameValue(want, knobValue(key.key))) continue;
    await dispatchAction({ type: 'knob/set', payload: { key: key.key, value: want } });
  }
}

function presetLabel(preset: Record<string, number>): string {
  return config.value.keys
    .map((key) => keyLabel(key.key) + (preset[key.key] ?? ''))
    .join(' · ');
}

async function resetParams(): Promise<void> {
  drafts.value = {};
  await dispatchAction({ type: 'knob/reset', payload: {} });
}

function percent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return (value * 100).toFixed(0) + '%';
}

function percent1(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return (value * 100).toFixed(1) + '%';
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="knob-tool">
    <div
      v-if="sumTo !== null"
      data-testid="knob-sum"
      class="flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-black"
      :class="allocated === sumTo ? 'bg-mint text-teal' : 'bg-card text-red'"
    >
      <span>已分配 {{ allocated }} / {{ sumTo }}</span>
      <span v-if="allocated !== sumTo" class="text-xs font-bold">还差 {{ sumTo - allocated }} 点</span>
      <span v-else class="text-xs font-bold">正好用完</span>
    </div>

    <div v-if="presets.length > 0" class="flex flex-wrap gap-2" data-testid="knob-presets">
      <button
        v-for="(preset, index) in presets"
        :key="'preset-' + index"
        type="button"
        :data-testid="'knob-preset-' + index"
        :disabled="busy"
        class="min-h-10 rounded-xl border border-grid bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="applyPreset(preset)"
      >
        {{ presetLabel(preset) }}
      </button>
    </div>

    <div
      v-for="key in config.keys"
      :key="key.key"
      class="rounded-2xl border border-grid bg-paper p-3"
      :data-testid="'knob-row-' + key.key"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-bold text-ink">{{ keyLabel(key.key) }}</p>
        <p class="text-xs font-semibold text-ink-soft">{{ formatValue(key) }}</p>
      </div>

      <!-- 选项 ≤ 4 个：点一下就是一次输入，不用原生下拉（下拉要展开 + 选中两击）。 -->
      <div v-if="optionsFor(key.key).length > 0" class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="option in optionsFor(key.key)"
          :key="option.value"
          type="button"
          :data-testid="'knob-' + key.key + '-' + option.value"
          :disabled="busy"
          class="min-h-11 rounded-xl px-3 text-xs font-bold active:scale-95 disabled:opacity-40"
          :class="sameValue(option.value, knobValue(key.key)) ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="chooseOption(key.key, option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 数值：一个数字框顶替逐格 ±；blur / Enter 时一次 dispatch。 -->
      <div v-else class="mt-2 flex items-center gap-2">
        <input
          :value="draftValue(key)"
          :data-testid="'knob-' + key.key"
          :aria-label="keyLabel(key.key)"
          :disabled="busy"
          type="number"
          inputmode="numeric"
          :min="key.min"
          :max="key.max"
          :step="key.step"
          class="min-h-11 w-24 rounded-xl border border-grid bg-card px-3 text-sm font-black text-ink"
          @input="onNumberInput(key, $event)"
          @change="commitNumber(key)"
          @blur="commitNumber(key)"
          @keydown.enter="commitNumber(key)"
        >
        <span class="text-xs font-semibold text-ink-soft">{{ key.unit ?? '' }}</span>
      </div>
    </div>

    <!-- 目标线必须上屏：这三条决定「多高才算过」，winrate 关尤其不能藏。 -->
    <div class="rounded-2xl border border-grid bg-paper p-3 text-xs" data-testid="knob-targets">
      <p class="text-sm font-bold text-ink">{{ translate('sim.targets') }}</p>
      <template v-if="mode === 'duel'">
        <div class="mt-1 flex flex-wrap gap-2 font-semibold text-ink-soft">
          <span data-testid="knob-target-winrate" class="rounded-full bg-card px-2.5 py-1">
            胜率 ≥ {{ percent(duelTargets.winRate) }}
          </span>
          <span data-testid="knob-target-low" class="rounded-full bg-card px-2.5 py-1">
            区间下界 ≥ {{ percent(duelTargets.winRateLow) }}
          </span>
          <span data-testid="knob-target-b" class="rounded-full bg-card px-2.5 py-1">
            B 种子 ≥ {{ percent(duelTargets.baselineB) }}
          </span>
        </div>
      </template>
      <template v-else-if="mode === 'queue'">
        <p class="mt-1 font-semibold text-ink-soft">
          全部服务 · 平均等待 ≤ {{ queueTargets.avgWaitMax }} 分 · 加班 ≤ {{ queueTargets.overtimeMax }} 分
          <template v-if="budget !== null"> · 成本 ≤ {{ budget }}</template>
        </p>
      </template>
      <template v-else>
        <p class="mt-1 font-semibold text-ink-soft">
          A：覆盖率 ≥ {{ percent(dispatchTargets.A.coverageMin) }}、等待 ≤ {{ dispatchTargets.A.waitMax }} 分；
          B：覆盖率 ≥ {{ percent(dispatchTargets.B.coverageMin) }}、等待 ≤ {{ dispatchTargets.B.waitMax }} 分
          <template v-if="budget !== null">；成本 ≤ {{ budget }}</template>
        </p>
      </template>
    </div>

    <!-- 运行结果与旋钮同卡：跑完这一眼就能看到，不用去展开第二张工具卡。 -->
    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="knob-current">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-bold text-ink">{{ translate('sim.metrics') }}</p>
        <span
          v-if="(mode === 'dispatch' && latestRun) || (mode === 'queue' && latestQueueRun) || (mode === 'duel' && duelSample)"
          :data-testid="'knob-outcome'"
          class="rounded-full px-3 py-1 text-xs font-bold"
          :class="latestIsCurrent ? 'bg-mint text-teal' : 'bg-card text-ink-soft'"
        >
          {{ !latestIsCurrent ? '上一组参数的结果' : (mode === 'duel' ? '本次采样结果' : '本次运行结果') }}
        </span>
      </div>

      <div v-if="mode === 'dispatch' && latestRun" class="mt-2 grid grid-cols-2 gap-1 text-xs font-semibold text-ink">
        <p :class="dispatchPass?.a ? 'text-teal' : 'text-red'">
          覆盖 A {{ percent(latestRun.coverageA) }} · 等待 {{ latestRun.waitA }} 分
        </p>
        <p :class="dispatchPass?.b ? 'text-teal' : 'text-red'">
          覆盖 B {{ percent(latestRun.coverageB) }} · 等待 {{ latestRun.waitB }} 分
        </p>
        <p :class="dispatchPass?.budget ? 'text-ink' : 'text-red'">
          成本 {{ latestRun.cost }}<template v-if="budget !== null"> / 预算 {{ budget }}</template>
        </p>
        <p class="text-ink-soft">{{ latestRun.vehicles }} 车 · {{ latestRun.teams }} 队 · {{ latestRun.shift }} 分</p>
      </div>

      <div v-else-if="mode === 'queue' && latestQueueRun" class="mt-2 grid grid-cols-2 gap-1 text-xs font-semibold text-ink">
        <p :class="queuePass?.wait ? 'text-teal' : 'text-red'">平均等待 {{ latestQueueRun.avgWait }} 分</p>
        <p :class="queuePass?.overtime ? 'text-teal' : 'text-red'">加班 {{ latestQueueRun.overtime }} 分</p>
        <p class="text-ink-soft">最长队列 {{ latestQueueRun.maxQueue }}</p>
        <p :class="queuePass?.budget ? 'text-ink' : 'text-red'">
          成本 {{ latestQueueRun.cost }}<template v-if="budget !== null"> / 预算 {{ budget }}</template>
        </p>
        <p class="text-ink-soft">{{ latestQueueRun.servers }} 台 · {{ latestQueueRun.serviceTime }} 分/位 · 营业 {{ latestQueueRun.openMinutes }} 分</p>
      </div>

      <div v-else-if="mode === 'duel' && duelSample" class="mt-2 text-xs font-semibold text-ink">
        <p class="flex flex-wrap items-center gap-2">
          <span :class="duelPass?.rate ? 'text-teal' : 'text-red'">
            胜率 <span class="text-lg font-black">{{ percent1(duelSample.rate) }}</span>
          </span>
          <span :class="duelPass?.low ? 'text-teal' : 'text-red'">
            95% 区间 {{ percent1(duelSample.low) }} – {{ percent1(duelSample.high) }}
          </span>
        </p>
        <p class="mt-1 text-ink-soft">
          A 种子 {{ duelSample.seed }} · {{ duelSample.n }} 局 · 胜场 {{ duelSample.wins }}
        </p>
        <p
          v-if="duelClaim"
          data-testid="knob-claim-ready"
          class="mt-1 font-bold text-teal"
        >
          结论已记录
        </p>
        <p v-else class="mt-1 text-ink-soft">还差一句结论：在下面点一句用这次数据写下的结论。</p>
      </div>

      <p v-else class="mt-1 text-xs text-ink-soft">
        <template v-if="mode === 'duel' && sumTo !== null && allocated !== sumTo">
          三个旋钮还差 {{ sumTo - allocated }} 点没分完，凑满 {{ sumTo }} 点就会自动跑出结果。
        </template>
        <template v-else>还没有运行结果：参数一改就自动运行，这里会立刻显示指标。</template>
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <p data-testid="knob-auto-run" class="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
        参数一改就自动运行，不用再点「运行」。
      </p>
      <button
        type="button"
        data-testid="knob-reset"
        :disabled="busy"
        class="min-h-12 shrink-0 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="resetParams"
      >
        {{ config.resetLabel ?? '重置' }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
