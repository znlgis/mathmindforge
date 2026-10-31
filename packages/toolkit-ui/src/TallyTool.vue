<script setup lang="ts">
import type { ClaimInput, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
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

const categories = computed(() => props.spec.config.categories ?? []);
const probe = computed(() => props.snapshot.toolState.probe);
const collected = computed<string[]>(() => probe.value?.items ?? []);
const recorded = computed<Record<string, number>>(() => probe.value?.tally ?? {});
const direction = ref<'most' | 'least'>('most');
const category = ref<string | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const submitted = computed(() => probe.value?.claim !== undefined);

const tokenOf = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const item of categories.value) map[item.id] = item.token;
  return map;
});

const labelOf = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const item of categories.value) map[item.id] = item.label;
  return map;
});

const chips = computed(() => collected.value.map((id) => tokenOf.value[id] ?? id));

/** 结论里的并列项按玩家自己记下的统计条算：这正是“用数据说话”的一部分。 */
const tiedWith = computed<string[]>(() => {
  const chosen = category.value;
  if (!chosen) return [];
  const value = recorded.value[chosen] ?? 0;
  return categories.value
    .filter((item) => item.id !== chosen && (recorded.value[item.id] ?? 0) === value)
    .map((item) => item.id);
});

const canSubmit = computed(() => category.value !== null && !busy.value);

async function dispatchSample(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'probe/sample', payload: {} });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

async function step(id: string, delta: number): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const counts: Record<string, number> = {};
    for (const item of categories.value) counts[item.id] = recorded.value[item.id] ?? 0;
    const next = Math.max(0, (counts[id] ?? 0) + delta);
    counts[id] = next;
    const result = await props.runtime.dispatch({ type: 'probe/tally', payload: { counts } });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

function chooseDirection(next: 'most' | 'least'): void {
  direction.value = next;
}

function chooseCategory(id: string): void {
  category.value = id;
}

async function submitClaim(): Promise<void> {
  if (!canSubmit.value || !category.value) return;
  busy.value = true;
  error.value = null;
  try {
    const claim: ClaimInput = {
      kind: 'count-compare',
      category: category.value,
      direction: direction.value,
      tiedWith: tiedWith.value,
      n: collected.value.length,
    };
    const result = await props.runtime.dispatch({ type: 'probe/claim', payload: { claim } });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="tally-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">
        {{ translate('tally.collected') }} <span data-testid="tally-count">{{ collected.length }}</span>
      </p>
      <span
        v-if="submitted"
        data-testid="tally-claim-ready"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        结论已记录
      </span>
    </div>

    <button
      type="button"
      data-testid="tally-sample"
      :disabled="busy"
      class="min-h-14 rounded-2xl bg-blueprint px-4 text-base font-black text-white active:scale-95 disabled:opacity-40"
      @click="dispatchSample"
    >
      采集一把
    </button>

    <div class="flex min-h-10 flex-wrap gap-1.5" data-testid="tally-chips">
      <span
        v-for="(token, index) in chips"
        :key="index"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-grid bg-paper text-sm font-black text-ink"
      >
        {{ token }}
      </span>
      <span v-if="chips.length === 0" class="text-xs text-ink-soft">还没有采集，先点上面的按钮。</span>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-sm font-bold text-ink">统计条</p>
      <p class="mt-1 text-xs text-ink-soft">每采完一把，就在这里给对应类别加一格。</p>
      <ul class="mt-2 flex flex-col gap-2">
        <li
          v-for="item in categories"
          :key="item.id"
          class="flex items-center justify-between gap-2"
        >
          <span class="text-sm font-bold text-ink">
            {{ item.token }} {{ item.label }}
            <span class="ml-1 text-xs font-semibold text-ink-soft" :data-testid="'tally-value-' + item.id">
              {{ recorded[item.id] ?? 0 }}
            </span>
          </span>
          <span class="flex gap-2">
            <button
              type="button"
              :data-testid="'tally-minus-' + item.id"
              :disabled="busy"
              :aria-label="item.label + ' 减一'"
              class="h-11 w-11 rounded-xl bg-card text-lg font-black text-ink active:scale-95 disabled:opacity-40"
              @click="step(item.id, -1)"
            >
              −
            </button>
            <button
              type="button"
              :data-testid="'tally-plus-' + item.id"
              :disabled="busy"
              :aria-label="item.label + ' 加一'"
              class="h-11 w-11 rounded-xl bg-card text-lg font-black text-ink active:scale-95 disabled:opacity-40"
              @click="step(item.id, 1)"
            >
              +
            </button>
          </span>
        </li>
      </ul>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-sm font-bold text-ink">写下结论</p>
      <div class="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="tally-claim-most"
          :disabled="busy"
          class="min-h-11 flex-1 rounded-xl px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="direction === 'most' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="chooseDirection('most')"
        >
          最多
        </button>
        <button
          type="button"
          data-testid="tally-claim-least"
          :disabled="busy"
          class="min-h-11 flex-1 rounded-xl px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="direction === 'least' ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="chooseDirection('least')"
        >
          最少
        </button>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="item in categories"
          :key="item.id"
          type="button"
          :data-testid="'tally-category-' + item.id"
          :disabled="busy"
          class="min-h-11 rounded-xl px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="category === item.id ? 'bg-teal text-white' : 'bg-card text-ink'"
          @click="chooseCategory(item.id)"
        >
          {{ item.token }} {{ item.label }}
        </button>
      </div>
      <p class="mt-2 text-xs text-ink-soft">
        {{ direction === 'most' ? '最多' : '最少' }}：
        <template v-if="category">{{ labelOf[category] }}</template>
        <template v-else>还没选类别</template>
        <template v-if="tiedWith.length > 0">（并列：{{ tiedWith.map((id) => labelOf[id]).join('、') }}）</template>
      </p>
      <button
        type="button"
        data-testid="tally-claim-submit"
        :disabled="!canSubmit"
        class="mt-2 min-h-12 w-full rounded-2xl bg-teal px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
        @click="submitClaim"
      >
        提交结论
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
