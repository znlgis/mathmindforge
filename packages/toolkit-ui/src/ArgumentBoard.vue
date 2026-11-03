<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ArgueScriptView = {
  claims?: string[];
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
const claim = ref('');
const warrant = ref('');
const scope = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const CLAIM_LABELS: Record<string, string> = {
  impossible: '不可能铺满',
  possible: '可以铺满',
};
const WARRANT_LABELS: Record<string, string> = {
  coloring: '黑白染色',
  parity: '奇偶',
  area: '面积',
};
const SCOPE_LABELS: Record<string, string> = {
  'domino-tiling': '1×2 多米诺铺满',
};

function labelOf(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

async function dispatch(type: 'argue/setClaim' | 'argue/setWarrant' | 'argue/setScope', value: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (type === 'argue/setClaim') {
      claim.value = value;
      await props.runtime.dispatch({ type, payload: { claim: value } });
    } else if (type === 'argue/setWarrant') {
      warrant.value = value;
      await props.runtime.dispatch({ type, payload: { warrant: value } });
    } else {
      scope.value = value;
      await props.runtime.dispatch({ type, payload: { scope: value } });
    }
  } finally {
    busy.value = false;
  }
}

async function attach(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'argue/attachEvidence', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

async function commit(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'argue/commit', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="argument-board" class="mt-3 rounded-3xl border border-grid bg-card p-4">
    <h2 class="text-base font-black text-blueprint">论证板</h2>
    <p class="mt-1 text-xs text-ink-soft">主张、依据、证据、适用范围都齐了，才能提交。</p>

    <div class="mt-4 grid gap-3">
      <label class="flex flex-col gap-1 text-sm font-bold text-ink">
        主张
        <select
          data-testid="argue-claim"
          class="min-h-11 rounded-xl border border-grid bg-paper px-3 text-sm font-semibold"
          :value="claim || argument?.claim || ''"
          @change="dispatch('argue/setClaim', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">选一个主张</option>
          <option v-for="item in script.claims ?? []" :key="item" :value="item">{{ labelOf(CLAIM_LABELS, item) }}</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-sm font-bold text-ink">
        依据
        <select
          data-testid="argue-warrant"
          class="min-h-11 rounded-xl border border-grid bg-paper px-3 text-sm font-semibold"
          :value="warrant || argument?.warrant || ''"
          @change="dispatch('argue/setWarrant', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">选一条可检验的依据</option>
          <option v-for="item in script.warrants ?? []" :key="item" :value="item">{{ labelOf(WARRANT_LABELS, item) }}</option>
        </select>
      </label>

      <div class="rounded-2xl border border-grid bg-paper p-3">
        <p class="text-sm font-bold text-ink">证据</p>
        <p v-if="counts" data-testid="argue-counts" class="mt-1 text-xs text-ink-soft">
          黑 {{ counts.black }} / 白 {{ counts.white }} / 总 {{ counts.cells }} 格
        </p>
        <p v-else class="mt-1 text-xs text-ink-soft">还没有统计数据，先到数据采集器里数一数。</p>
        <button
          type="button"
          data-testid="argue-attach"
          :disabled="busy || !counts"
          class="mt-2 min-h-11 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
          @click="attach"
        >
          把统计数据挂到论证上
        </button>
        <p v-if="argument?.evidence" class="mt-1 text-[11px] text-teal">
          已挂证据：{{ argument.evidence.black ?? '—' }} 黑 / {{ argument.evidence.white ?? '—' }} 白 / {{ argument.evidence.cells ?? '—' }} 格
        </p>
      </div>

      <label class="flex flex-col gap-1 text-sm font-bold text-ink">
        适用范围
        <select
          data-testid="argue-scope"
          class="min-h-11 rounded-xl border border-grid bg-paper px-3 text-sm font-semibold"
          :value="scope || argument?.scope || ''"
          @change="dispatch('argue/setScope', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">写明它在什么范围内成立</option>
          <option v-for="item in script.scopes ?? []" :key="item" :value="item">{{ labelOf(SCOPE_LABELS, item) }}</option>
        </select>
      </label>
    </div>

    <button
      type="button"
      data-testid="argue-commit"
      :disabled="busy"
      class="mt-4 min-h-12 w-full rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
      @click="commit"
    >
      {{ argument?.committed ? '论证已提交（可再改）' : '提交论证' }}
    </button>
    <p v-if="error" class="mt-2 text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
