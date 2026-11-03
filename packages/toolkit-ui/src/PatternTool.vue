<script setup lang="ts">
import type {
  LevelAction, LevelRuntime, PatternTransform, RunSnapshot,
} from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed, ref, watch } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中的 pattern 成员结构一致；toolkit-ui 不直接依赖 content。 */
type PatternSpec = Extract<ToolSpecLike, { kind: 'pattern' }>;

const props = defineProps<{
  spec: PatternSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const TRANSFORMS: PatternTransform[] = ['none', 'mirror', 'rotate', 'shift', 'reflect'];
const transformOptions = TRANSFORMS.map((value) => ({
  value,
  labelKey: 'pattern.transform.' + value,
}));

const initialPattern = props.snapshot.toolState.pattern;
const cycle = ref<string[]>(initialPattern?.cycle ? [...initialPattern.cycle] : []);
const transform = ref<PatternTransform>(initialPattern?.transform ?? 'none');
const busy = ref(false);
const error = ref<string | null>(null);

const patternState = computed(() => props.snapshot.toolState.pattern);
const inspectedCount = computed(() => patternState.value?.inspected.length ?? 0);
const committed = computed(() => patternState.value?.committed === true);
const canUseCycle = computed(() => (
  cycle.value.length >= 2 && cycle.value.length <= props.spec.config.maxPeriod
));

const submittedSummary = computed(() => {
  const state = patternState.value;
  if (!state?.committed || !state.cycle || state.cycle.length === 0) return null;
  return state.cycle.join(' ') + ' · ' + translate('pattern.transform.' + (state.transform ?? 'none'));
});

async function inspect(index: number): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'pattern/inspect', payload: { index } });
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}

function pushToken(token: string): void {
  if (busy.value) return;
  if (cycle.value.length >= props.spec.config.maxPeriod) return;
  cycle.value = [...cycle.value, token];
}

function clearCycle(): void {
  if (busy.value) return;
  cycle.value = [];
}

function onTransformChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value;
  if (value === 'none' || value === 'mirror' || value === 'rotate' || value === 'shift' || value === 'reflect') {
    transform.value = value;
  }
}

async function useCycle(mode: 'preview' | 'commit'): Promise<void> {
  if (busy.value || !canUseCycle.value) return;
  busy.value = true;
  error.value = null;
  try {
    const selected = await props.runtime.dispatch({
      type: 'pattern/setCycle',
      payload: { cycle: [...cycle.value], transform: transform.value },
    });
    if (!selected.ok) {
      error.value = selected.message ? translate(selected.message) : null;
      return;
    }
    const action: LevelAction = mode === 'preview'
      ? { type: 'pattern/preview', payload: {} }
      : { type: 'pattern/commit', payload: {} };
    const result = await props.runtime.dispatch(action);
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}

// 关卡重来（runtime.reset）时，把本地草稿同步回运行时的空状态。
watch(
  () => patternState.value?.cycle,
  (next, previous) => {
    if (!next) {
      if (previous) {
        cycle.value = [];
        // 重来后运行时里已经没有规则了；本地变换也要回到初始值，
        // 否则下一次提交会带着上一轮选的镜像/旋转，玩家看不出为什么判定变了。
        transform.value = 'none';
      }
      return;
    }
    cycle.value = [...next];
    if (patternState.value?.transform) transform.value = patternState.value.transform;
  },
);
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="pattern-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">{{ translate('pattern.inspected', { n: inspectedCount }) }}</p>
      <span
        v-if="committed"
        data-testid="pattern-committed"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        {{ translate('pattern.committed') }}
      </span>
    </div>

    <div v-if="spec.config.cells && spec.config.cells.length > 0">
      <p class="text-sm font-bold text-ink">观察带子</p>
      <p class="mt-1 text-xs text-ink-soft">点格子，看看它是第几位、第几个单元。</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="cell in spec.config.cells"
          :key="cell"
          type="button"
          :data-testid="'pattern-inspect-' + cell"
          :aria-label="'观察第 ' + (cell + 1) + ' 格'"
          class="h-9 min-w-9 rounded-lg border border-grid bg-paper px-1 text-xs font-bold text-ink-soft active:scale-95"
          @click="inspect(cell)"
        >
          {{ cell + 1 }}
        </button>
      </div>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">{{ translate('pattern.cycle') }}</p>
      <p class="mt-1 text-xs text-ink-soft">{{ translate('pattern.tokenHint') }}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="token in spec.config.tokens"
          :key="token"
          type="button"
          :data-testid="'pattern-token-' + token"
          :disabled="busy || cycle.length >= spec.config.maxPeriod"
          :aria-label="translate('pattern.cycle') + ' ' + token"
          class="flex h-12 w-12 items-center justify-center rounded-2xl border border-grid bg-paper text-lg font-black text-ink active:scale-95 disabled:opacity-40"
          @click="pushToken(token)"
        >
          {{ token }}
        </button>
      </div>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="pattern-cycle">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-bold text-ink">
          {{ cycle.length > 0 ? cycle.join(' ') : '—' }}
          <span class="ml-1 text-xs font-semibold text-ink-soft">{{ cycle.length }}/{{ spec.config.maxPeriod }}</span>
        </p>
        <button
          type="button"
          data-testid="pattern-clear"
          :disabled="busy || cycle.length === 0"
          class="min-h-11 rounded-xl bg-card px-3 text-xs font-bold text-ink active:scale-95 disabled:opacity-40"
          @click="clearCycle"
        >
          清空
        </button>
      </div>
      <p v-if="submittedSummary" class="mt-2 text-xs font-semibold text-teal">{{ submittedSummary }}</p>
    </div>

    <label class="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
      {{ translate('pattern.transform') }}
      <select
        :value="transform"
        :disabled="busy"
        data-testid="pattern-transform"
        class="min-h-11 rounded-xl border border-grid bg-card px-3 text-sm font-semibold text-ink"
        @change="onTransformChange"
      >
        <option v-for="option in transformOptions" :key="option.value" :value="option.value">
          {{ translate(option.labelKey) }}
        </option>
      </select>
    </label>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="pattern-preview"
        :disabled="!canUseCycle || busy"
        class="min-h-12 flex-1 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="useCycle('preview')"
      >
        {{ translate('pattern.preview') }}
      </button>
      <button
        type="button"
        data-testid="pattern-commit"
        :disabled="!canUseCycle || busy"
        class="min-h-12 flex-1 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
        @click="useCycle('commit')"
      >
        {{ translate('pattern.commit') }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
