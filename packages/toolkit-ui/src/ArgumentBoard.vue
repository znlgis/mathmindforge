<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];

/** 选项池仍然来自关卡脚本：模板不写死某一关的依据/范围措辞。 */
type ArgueScriptView = {
  warrants?: string[];
  scopes?: string[];
};

const props = defineProps<{
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const script = computed<ArgueScriptView>(() => (props.detail.levelScript ?? {}) as ArgueScriptView);
const argument = computed(() => props.snapshot.argument);
const counts = computed(() => props.snapshot.toolState.probe?.dataset?.counts ?? null);
const busy = ref(false);
const error = ref<string | null>(null);

const WARRANT_LABELS: Record<string, string> = {
  coloring: '黑白染色',
  parity: '奇偶',
  area: '面积',
};
const CLAIM_LABELS: Record<string, string> = {
  impossible: '不可能铺满',
  possible: '可以铺满',
};
const SCOPE_LABELS: Record<string, string> = {
  'domino-tiling': '1×2 多米诺铺满',
};

/**
 * 一切显示都从快照派生：没有本地表单状态，所以重玩/换关不会把上一轮的旧选择带回来。
 * 主张与范围不再由玩家填：选一条依据，运行时就把「不可能铺满 → 1×2 多米诺铺满」推出来。
 */
const warrant = computed(() => argument.value?.warrant ?? '');
const claim = computed(() => argument.value?.claim ?? '');
const scope = computed(() => argument.value?.scope ?? '');
const evidence = computed(() => argument.value?.evidence ?? null);
const black = computed(() => (counts.value ? Number(counts.value.black) : null));
const white = computed(() => (counts.value ? Number(counts.value.white) : null));
const cells = computed(() => (counts.value ? Number(counts.value.cells) : null));

/**
 * 这条依据在这张棋盘上到底能不能下结论。
 * 判定仍以运行时的 validateArtifact 为准，这里只把同一条数学事实翻成人话：
 * 点一下就看到"能排除 / 排除不了"，不必先点完成再碰运气。
 */
const decisive = computed<boolean | null>(() => {
  const w = warrant.value;
  const c = cells.value;
  const b = black.value;
  const wt = white.value;
  if (!w || c === null || b === null || wt === null) return null;
  if (w === 'coloring') return b !== wt;
  if (w === 'parity' || w === 'area') return c % 2 === 1;
  return null;
});

const explanation = computed<string | null>(() => {
  const w = warrant.value;
  const b = black.value;
  const wt = white.value;
  const c = cells.value;
  if (!w || b === null || wt === null || c === null) return null;
  const label = WARRANT_LABELS[w] ?? w;
  if (w === 'coloring') {
    return b !== wt
      ? '黑 ' + b + ' ≠ 白 ' + wt + '：每块 1×2 骨牌都盖住一黑一白，所以永远铺不满。'
      : '黑 ' + b + ' = 白 ' + wt + '：染色法排除不了铺满，换一条依据。';
  }
  return c % 2 === 1
    ? label + '：总格 ' + c + ' 是奇数，每块骨牌盖 2 格，最后一定剩一格。'
    : label + '：总格 ' + c + ' 是偶数，每块骨牌盖 2 格，排除不了铺满，换一条依据。';
});

const evidenceText = computed<string>(() => {
  const value = evidence.value;
  if (!value) return '';
  if (value.black !== undefined && value.white !== undefined) {
    const total = value.cells === undefined ? '' : ' / ' + value.cells + ' 格';
    return value.black + ' 黑 / ' + value.white + ' 白' + total;
  }
  return value.cells === undefined ? '' : '总格 ' + value.cells;
});

async function pick(next: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    // 一次点击 = 一次输入：先把黑白格真的数出来（观察证据），再写一条依据。
    // 沿用旧实现里把统计与论证拆成两个按钮，会逼玩家先点 probe 再回来点依据。
    const sampled = await props.runtime.dispatch({ type: 'probe/sample', payload: {} });
    if (!sampled.ok) {
      error.value = sampled.message ? props.t.t(sampled.message) : null;
      return;
    }
    const result = await props.runtime.dispatch({ type: 'argue/setWarrant', payload: { warrant: next } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="argument-board" class="mt-3 rounded-3xl border border-grid bg-card p-3">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-base font-black text-blueprint">论证板</h2>
      <p class="text-[11px] font-semibold text-ink-soft">选一条依据，其余自动补齐；再点下面的「完成」</p>
    </div>

    <!-- 一行组装：依据是唯一的输入，其余三格是运行时时推出来的结论 -->
    <div
      data-testid="argue-row"
      aria-live="polite"
      class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold"
    >
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="依据">
        <button
          v-for="item in script.warrants ?? []"
          :key="item"
          type="button"
          :data-testid="'argue-warrant-' + item"
          :aria-pressed="warrant === item"
          :disabled="busy"
          class="min-h-11 rounded-full border px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="warrant === item
            ? 'border-blueprint bg-blueprint text-white'
            : 'border-grid bg-paper text-ink'"
          @click="pick(item)"
        >
          {{ WARRANT_LABELS[item] ?? item }}
        </button>
      </div>

      <span aria-hidden="true" class="text-ink-soft">→</span>
      <span
        data-testid="argue-counts"
        class="rounded-xl border border-grid bg-paper px-2 py-1"
        :class="counts ? 'text-ink' : 'text-ink-soft'"
      >
        {{ counts ? '黑 ' + black + ' / 白 ' + white : '黑白各几格？' }}
      </span>

      <span aria-hidden="true" class="text-ink-soft">→</span>
      <span
        data-testid="argue-claim"
        class="rounded-xl px-2 py-1"
        :class="claim ? 'bg-mint text-teal' : 'border border-grid bg-paper text-ink-soft'"
      >
        {{ claim ? CLAIM_LABELS[claim] ?? claim : '结论？' }}
      </span>

      <span aria-hidden="true" class="text-ink-soft">→</span>
      <span
        data-testid="argue-scope"
        class="rounded-xl px-2 py-1"
        :class="scope ? 'bg-mint text-teal' : 'border border-grid bg-paper text-ink-soft'"
      >
        {{ scope ? SCOPE_LABELS[scope] ?? scope : '适用范围？' }}
      </span>
    </div>

    <!-- 点完立刻有反馈：这条依据能不能排除铺满，以及为什么 -->
    <p
      v-if="explanation"
      data-testid="argue-reason"
      class="mt-2 rounded-xl px-2 py-1.5 text-xs font-bold"
      :class="decisive ? 'bg-mint text-teal' : 'bg-red/10 text-red'"
    >
      {{ explanation }}
    </p>
    <p v-else class="mt-2 px-2 text-[11px] leading-5 text-ink-soft">
      每块 1×2 骨牌盖住「一黑一白」或者「两格」——选一条能排掉这张棋盘的依据。
    </p>

    <p v-if="evidenceText" data-testid="argue-evidence" class="mt-1 px-2 text-[11px] text-ink-soft">
      证书上的证据：{{ evidenceText }}
    </p>
    <p v-if="error" class="mt-1 px-2 text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
