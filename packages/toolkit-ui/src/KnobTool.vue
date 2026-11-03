<script setup lang="ts">
import type { LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';
import { latestMetricsRow } from './metricsRows';

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

/** config 是 passthrough：keys 之外的可选字段只在这一层收窄，读不到就退到默认文案。 */
interface KnobConfigView {
  keys: KnobKeyConfig[];
  options?: Record<string, KnobOption[]>;
  labels?: Record<string, string>;
  runLabelKey?: string;
  commitLabel?: string;
  resetLabel?: string;
  /** 可选：有预算的关卡把「成本 / 预算」一起显示出来 */
  budget?: number;
}

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
const values = computed<Record<string, number>>(() => knobState.value?.values ?? {});
const latest = computed(() => latestMetricsRow(props.snapshot));
/** 参数动过之后，最后一个运行记录已经不代表当前参数了。 */
const latestIsCurrent = computed(() => {
  const row = latest.value;
  if (!row) return false;
  const current = values.value;
  return row.vehicles === current.vehicles
    && row.teams === current.teams
    && row.shift === current.shift
    && row.routeIndex === current.route;
});
const budget = computed(() => config.value.budget ?? null);
const busy = ref(false);
const error = ref<string | null>(null);

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

/** 数字键：+/− 一次一格，夹在 min/max 之间；减到不能减时按钮自己禁用。 */
async function step(key: KnobKeyConfig, direction: 1 | -1): Promise<void> {
  const next = Math.min(key.max, Math.max(key.min, knobValue(key.key) + direction * key.step));
  if (sameValue(next, knobValue(key.key))) return;
  await dispatchAction({ type: 'knob/set', payload: { key: key.key, value: next } });
}

async function onSelect(key: string, event: Event): Promise<void> {
  const element = event.target as HTMLSelectElement | null;
  const next = Number(element?.value);
  if (!Number.isFinite(next) || sameValue(next, knobValue(key))) return;
  await dispatchAction({ type: 'knob/set', payload: { key, value: next } });
}

async function runSimulation(): Promise<void> {
  await dispatchAction({ type: 'knob/run', payload: {} });
}

async function commitParams(): Promise<void> {
  await dispatchAction({ type: 'knob/commit', payload: {} });
}

async function resetParams(): Promise<void> {
  await dispatchAction({ type: 'knob/reset', payload: {} });
}

function percent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return (value * 100).toFixed(0) + '%';
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="knob-tool">
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

      <select
        v-if="optionsFor(key.key).length > 0"
        :value="String(knobValue(key.key))"
        :disabled="busy"
        :data-testid="'knob-' + key.key"
        :aria-label="keyLabel(key.key)"
        class="mt-2 min-h-11 w-full rounded-xl border border-grid bg-card px-3 text-sm font-semibold text-ink"
        @change="onSelect(key.key, $event)"
      >
        <option v-for="option in optionsFor(key.key)" :key="option.value" :value="String(option.value)">
          {{ option.label }}
        </option>
      </select>

      <div v-else class="mt-2 flex items-center gap-2">
        <button
          type="button"
          :data-testid="'knob-' + key.key + '-minus'"
          :disabled="busy || knobValue(key.key) <= key.min"
          :aria-label="'减少' + keyLabel(key.key)"
          class="h-11 w-11 rounded-xl border border-grid bg-card text-lg font-black text-ink active:scale-95 disabled:opacity-40"
          @click="step(key, -1)"
        >
          −
        </button>
        <span class="min-w-12 text-center text-sm font-black text-ink">{{ formatValue(key) }}</span>
        <button
          type="button"
          :data-testid="'knob-' + key.key"
          :disabled="busy || knobValue(key.key) >= key.max"
          :aria-label="'增加' + keyLabel(key.key)"
          class="h-11 min-w-14 rounded-xl bg-blueprint px-4 text-sm font-black text-white active:scale-95 disabled:opacity-40"
          @click="step(key, 1)"
        >
          +
        </button>
      </div>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="knob-current">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-bold text-ink">{{ translate('sim.metrics') }}</p>
        <span
          v-if="latest"
          :data-testid="'knob-outcome'"
          class="rounded-full px-3 py-1 text-xs font-bold"
          :class="latest.passed ? 'bg-mint text-teal' : 'bg-card text-ink-soft'"
        >
          {{ !latestIsCurrent ? '上一组参数的结果' : latest.passed ? '两个种子日都达标' : '还没达标' }}
        </span>
      </div>
      <div v-if="latest" class="mt-2 grid grid-cols-2 gap-1 text-xs font-semibold text-ink">
        <p>覆盖率 A {{ percent(latest.coverageA) }}</p>
        <p>覆盖率 B {{ percent(latest.coverageB) }}</p>
        <p>等待 A {{ latest.waitA }} 分</p>
        <p>等待 B {{ latest.waitB }} 分</p>
        <p>成本 {{ latest.cost }}<template v-if="budget !== null"> / 预算 {{ budget }}</template></p>
        <p>{{ latest.vehicles }} 车 · {{ latest.teams }} 队 · {{ latest.shift }} 分</p>
      </div>
      <p v-if="latest && !latestIsCurrent" class="mt-2 text-xs font-semibold text-red">
        参数改过了，点“运行两个种子”刷新指标。
      </p>
      <p v-if="!latest" class="mt-1 text-xs text-ink-soft">还没有运行记录。调好旋钮，再点“运行两个种子”。</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="knob-run"
        :disabled="busy"
        class="min-h-12 flex-1 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
        @click="runSimulation"
      >
        {{ translate(config.runLabelKey ?? 'knob.run') }}
      </button>
      <button
        type="button"
        data-testid="knob-commit"
        :disabled="busy"
        class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="commitParams"
      >
        {{ config.commitLabel ?? '锁定参数' }}
      </button>
      <button
        type="button"
        data-testid="knob-reset"
        :disabled="busy"
        class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="resetParams"
      >
        {{ config.resetLabel ?? '重置' }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>