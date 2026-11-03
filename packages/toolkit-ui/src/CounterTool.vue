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

/** 与引擎同口径的贪心枚数：每次拿不超过余额的最大面额。 */
function greedyCount(target: number, denominations: number[]): number | null {
  let remaining = target;
  let count = 0;
  for (const coin of [...denominations].sort((a, b) => b - a)) {
    while (remaining >= coin) {
      remaining -= coin;
      count += 1;
    }
  }
  return remaining === 0 ? count : null;
}

/** 与引擎同口径的最优枚数：完全背包取最少枚数。 */
function optimalCount(target: number, denominations: number[]): number | null {
  if (target === 0) return 0;
  const best = new Array<number>(target + 1).fill(Number.POSITIVE_INFINITY);
  best[0] = 0;
  for (let value = 1; value <= target; value += 1) {
    for (const coin of denominations) {
      if (coin > value) continue;
      const previous = best[value - coin] as number;
      if (!Number.isFinite(previous)) continue;
      if (previous + 1 < (best[value] as number)) best[value] = previous + 1;
    }
  }
  return Number.isFinite(best[target] as number) ? (best[target] as number) : null;
}

const live = computed(() => {
  if (!canEdit.value) return null;
  const greedy = greedyCount(draftTarget.value, draftDenominations.value);
  const optimal = optimalCount(draftTarget.value, draftDenominations.value);
  const diff = greedy !== null && optimal !== null ? greedy - optimal : null;
  return { greedy, optimal, diff };
});

const greedyText = computed(() => {
  if (!live.value) return '—';
  return live.value.greedy === null ? '付不清' : live.value.greedy + ' 枚';
});
const optimalText = computed(() => {
  if (!live.value) return '—';
  return live.value.optimal === null ? '付不清' : live.value.optimal + ' 枚';
});
const diffText = computed(() => {
  const diff = live.value?.diff;
  if (diff === null || diff === undefined) return '—';
  return diff > 0 ? '+' + diff : String(diff);
});

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
    error.value = result.message ? props.t.t(result.message) : null;
    return false;
  }
  return true;
}

/** 编辑即自动测：玩家不用再点一次"测试贪心"。 */
async function autoTest(): Promise<void> {
  const result = await props.runtime.dispatch({ type: 'counter/test', payload: {} });
  if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
}

async function commitEdit(): Promise<boolean> {
  if (!(await dispatchEdit())) return false;
  await autoTest();
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
    await commitEdit();
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
    await commitEdit();
  } finally {
    busy.value = false;
  }
}

/** 失效前提是一排 chip：点一下就指出（不需要下拉展开、也不需要再点提交）。 */
async function choosePremise(id: string): Promise<void> {
  if (busy.value || !lastTest.value?.passed) return;
  premise.value = id;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'counter/annotate', payload: { premiseId: id } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
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

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="counter-result">
      <p class="text-sm font-bold text-ink" data-testid="counter-live">
        贪心 {{ greedyText }} / 最优 {{ optimalText }} / 差 {{ diffText }}
      </p>
      <p
        v-if="lastTest"
        class="mt-1 text-xs font-semibold"
        :class="lastTest.passed ? 'text-teal' : 'text-ink-soft'"
      >
        {{ lastTest.passed ? '这个例子里贪心不是最优。' : '这个例子里贪心也用了最少枚数。' }}
      </p>
      <p v-else class="mt-1 text-xs text-ink-soft">填好目标金额和面额，会自动帮你看贪心与最优。</p>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-sm font-bold text-ink">这个反例推翻了哪条前提？</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="item in premises"
          :key="item"
          type="button"
          :data-testid="'counter-premise-' + item"
          :aria-pressed="premise === item"
          :disabled="busy || !lastTest?.passed"
          class="min-h-10 rounded-full border-2 px-3 text-xs font-bold active:scale-95 disabled:opacity-40"
          :class="premise === item ? 'border-teal bg-mint text-teal' : 'border-grid bg-card text-ink'"
          @click="choosePremise(item)"
        >
          {{ premiseLabel(item) }}
        </button>
      </div>
      <p class="mt-2 text-[11px] text-ink-soft">选中的那一刻就是最终答案，不用再点提交。</p>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
