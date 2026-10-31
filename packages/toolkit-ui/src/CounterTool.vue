<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref, watch } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中的 counter 成员结构一致；toolkit-ui 不直接依赖 content。 */
type CounterSpec = Extract<ToolSpecLike, { kind: 'counter' }>;

const props = defineProps<{
  spec: CounterSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

const PREMISE_LABELS: Record<string, string> = {
  'greedy-optimal': '贪心总是最优',
  'no-1-coin': '因为没有 1 元面额',
  'target-residue': '因为目标金额除不尽',
};

const pool = computed(() => props.spec.config.denominationPool ?? [1, 3, 4, 5]);
const premises = computed(() => props.spec.config.premises ?? []);
const range = computed<[number, number]>(() => {
  const value = props.spec.config.targetRange;
  return value ? [value[0], value[1]] : [1, 20];
});
const snapDraft = computed(() => props.snapshot.toolState.counter?.draft);
const lastTest = computed(() => props.snapshot.toolState.counter?.lastTest);
const counterSummary = computed(() => (
  props.snapshot.artifacts.find((item) => item.id === 'counterexample')?.summary ?? null
));

function initialTarget(): number {
  const value = snapDraft.value?.instance.target;
  return typeof value === 'number' ? value : range.value[0];
}

function initialDenominations(): number[] {
  const value = snapDraft.value?.instance.denominations;
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

const draftTarget = ref<number>(initialTarget());
const draftDenominations = ref<number[]>(initialDenominations());
const premise = ref<string>(snapDraft.value?.premiseId ?? '');
const busy = ref(false);
const error = ref<string | null>(null);

const canEdit = computed(() => (
  Number.isInteger(draftTarget.value)
  && draftTarget.value >= range.value[0]
  && draftTarget.value <= range.value[1]
  && draftDenominations.value.length >= 2
));

function premiseLabel(id: string): string {
  return PREMISE_LABELS[id] ?? id;
}

async function dispatchEdit(): Promise<boolean> {
  error.value = null;
  const result = await props.runtime.dispatch({
    type: 'counter/edit',
    payload: {
      patch: {
        ruleId: 'greedy',
        instance: {
          target: draftTarget.value,
          denominations: [...draftDenominations.value],
        },
      },
    },
  });
  if (!result.ok) {
    error.value = result.message ?? null;
    return false;
  }
  return true;
}

async function onTargetChange(event: Event): Promise<void> {
  if (busy.value) return;
  const value = Number((event.target as HTMLInputElement | null)?.value);
  draftTarget.value = Number.isFinite(value) ? Math.trunc(value) : range.value[0];
  if (draftDenominations.value.length < 2) {
    error.value = '至少选两种面额，才谈得上贪心。';
    return;
  }
  if (!canEdit.value) {
    error.value = '目标金额要在 ' + range.value[0] + ' 到 ' + range.value[1] + ' 之间。';
    return;
  }
  busy.value = true;
  try {
    await dispatchEdit();
  } finally {
    busy.value = false;
  }
}

async function onDenominationChange(coin: number, event: Event): Promise<void> {
  if (busy.value) return;
  const checked = Boolean((event.target as HTMLInputElement | null)?.checked);
  const next = checked
    ? [...draftDenominations.value, coin].sort((a, b) => a - b)
    : draftDenominations.value.filter((value) => value !== coin);
  draftDenominations.value = [...new Set(next)];
  if (draftDenominations.value.length < 2) {
    error.value = '至少选两种面额，才谈得上贪心。';
    return;
  }
  if (!canEdit.value) {
    error.value = '目标金额要在 ' + range.value[0] + ' 到 ' + range.value[1] + ' 之间。';
    return;
  }
  busy.value = true;
  try {
    await dispatchEdit();
  } finally {
    busy.value = false;
  }
}

async function runTest(): Promise<void> {
  if (busy.value || !canEdit.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (!(await dispatchEdit())) return;
    const result = await props.runtime.dispatch({ type: 'counter/test', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

async function onPremiseChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement | null)?.value ?? '';
  premise.value = value;
  if (busy.value || value.length === 0) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'counter/annotate',
      payload: { premiseId: value },
    });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

async function commitCounter(): Promise<void> {
  if (busy.value || !canEdit.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (!(await dispatchEdit())) return;
    if (premise.value.length > 0) {
      const annotated = await props.runtime.dispatch({
        type: 'counter/annotate',
        payload: { premiseId: premise.value },
      });
      if (!annotated.ok) {
        error.value = annotated.message ?? null;
        return;
      }
    }
    const result = await props.runtime.dispatch({ type: 'counter/commit', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

// 刻画"运行时已有草稿"的状态：只有真正被重来（reset）时才清空本地表单，
// 避免玩家刚勾了一格面额、又去放硬币时把草稿冲掉。
let hasRuntimeDraft = snapDraft.value !== undefined && snapDraft.value !== null;
watch(snapDraft, (next) => {
  if (!next) {
    if (hasRuntimeDraft) {
      hasRuntimeDraft = false;
      draftTarget.value = range.value[0];
      draftDenominations.value = [];
      premise.value = '';
    }
    return;
  }
  hasRuntimeDraft = true;
  const target = next.instance.target;
  if (typeof target === 'number') draftTarget.value = target;
  const values = next.instance.denominations;
  draftDenominations.value = Array.isArray(values)
    ? values.filter((item): item is number => typeof item === 'number')
    : [];
  premise.value = next.premiseId ?? '';
});
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="counter-tool">
    <label class="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
      反例目标
      <input
        type="number"
        :min="range[0]"
        :max="range[1]"
        :value="draftTarget"
        :disabled="busy"
        data-testid="counter-target"
        class="min-h-11 w-24 rounded-xl border border-grid bg-card px-3 text-sm font-semibold text-ink"
        @change="onTargetChange"
      >
      <span class="text-xs font-semibold text-ink-soft">元（{{ range[0] }}–{{ range[1] }}）</span>
    </label>

    <fieldset class="rounded-2xl border border-grid bg-paper p-3">
      <legend class="px-1 text-sm font-bold text-ink">这个例子的面额</legend>
      <div class="mt-2 flex flex-wrap gap-2">
        <label
          v-for="coin in pool"
          :key="coin"
          class="flex min-h-11 items-center gap-2 rounded-xl border border-grid bg-card px-3 text-sm font-semibold text-ink"
        >
          <input
            type="checkbox"
            :checked="draftDenominations.includes(coin)"
            :disabled="busy"
            :data-testid="'counter-denom-' + coin"
            @change="onDenominationChange(coin, $event)"
          >
          {{ coin }} 元
        </label>
      </div>
    </fieldset>

    <button
      type="button"
      data-testid="counter-test"
      :disabled="busy || !canEdit"
      class="min-h-12 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
      @click="runTest"
    >
      测试贪心
    </button>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="counter-result">
      <p class="text-sm font-bold text-ink">{{ counterSummary ?? '还没测试' }}</p>
      <p
        v-if="lastTest"
        class="mt-1 text-xs font-semibold"
        :class="lastTest.passed ? 'text-teal' : 'text-ink-soft'"
      >
        {{ lastTest.passed ? '这个例子里贪心不是最优。' : '这个例子里贪心也用了最少枚数。' }}
      </p>
    </div>

    <label class="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
      失效前提
      <select
        :value="premise"
        :disabled="busy || !lastTest?.passed"
        data-testid="counter-premise"
        class="min-h-11 rounded-xl border border-grid bg-card px-3 text-sm font-semibold text-ink"
        @change="onPremiseChange"
      >
        <option value="">选一条前提</option>
        <option v-for="item in premises" :key="item" :value="item">{{ premiseLabel(item) }}</option>
      </select>
    </label>

    <button
      type="button"
      data-testid="counter-commit"
      :disabled="busy || !lastTest?.passed || premise.length === 0"
      class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
      @click="commitCounter"
    >
      提交反例
    </button>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
    <p class="text-xs text-ink-soft">先让贪心跑一遍，再指出它错在哪条前提上。</p>
  </section>
</template>