<script setup lang="ts">
import type { ClaimInput, LevelAction, LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 probe 成员结构一致；toolkit-ui 不直接依赖 content。 */
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

/** probe.config 是 passthrough：tally 关额外读整筐总数与每把的数量。 */
interface TallyConfigView {
  categories?: { id: string; label: string; token: string }[];
  batchSize?: number;
  /** 整筐一共几个：决定「全部倒出来」一次拿到多少（关卡的 items.length）。 */
  total?: number;
}

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const config = computed(() => props.spec.config as unknown as TallyConfigView);
const categories = computed(() => config.value.categories ?? []);
const probe = computed(() => props.snapshot.toolState.probe);
const collected = computed<string[]>(() => probe.value?.items ?? []);
const recorded = computed<Record<string, number>>(() => probe.value?.tally ?? {});
const busy = ref(false);
const error = ref<string | null>(null);
const submitted = computed(() => probe.value?.claim !== undefined);
/** 数字框草稿：只保存玩家正在输入的那几格；dispatch 成功后清空，回落到快照值。 */
const drafts = ref<Record<string, string>>({});

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

/** 整筐总数：配置优先；没配就按「已采 + 未知」处理（运行时按剩余量切片）。 */
const total = computed(() => config.value.total ?? 0);
const remaining = computed(() => (total.value > 0 ? Math.max(0, total.value - collected.value.length) : 1));
// 配置缺失时退到「至少有一把」，避免工具面板被永久禁用（配置由 content 测试钉住）。
const collectionComplete = computed(() => (
  total.value > 0 ? collected.value.length >= total.value : collected.value.length > 0
));

/** 结论里的并列项按玩家自己记下的统计条算：这正是「用数据说话」的一部分。 */
function tiedWithFor(categoryId: string): string[] {
  const value = recorded.value[categoryId] ?? 0;
  return categories.value
    .filter((item) => item.id !== categoryId && (recorded.value[item.id] ?? 0) === value)
    .map((item) => item.id);
}

async function dispatch(action: LevelAction): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch(action);
    if (!result.ok) {
      error.value = result.message ? translate(result.message) : null;
      return false;
    }
    return true;
  } finally {
    busy.value = false;
  }
}

/** 整筐由运行时按剩余量切片：进入工具卡就一次倒出来，玩家只需要照着图形填数字。 */
async function ensureDumped(): Promise<void> {
  if (busy.value || collectionComplete.value) return;
  await dispatch({ type: 'probe/sample', payload: { n: remaining.value } });
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 自动倒筐放在宏任务里：autoplay 调试路径整段在微任务里跑完，
 * 不能让它和自动倒筐抢同一个运行时（否则自动播放的第一次采集会被判「已采完」）。
 * 正常游玩时这一拍只有一帧，玩家看不到空筐。
 */
function scheduleDump(): void {
  if (autoTimer !== null) return;
  autoTimer = setTimeout(() => {
    autoTimer = null;
    void ensureDumped();
  }, 0);
}

onMounted(scheduleDump);
// 「重来」会把采集清空（collected 回到 0）：再自动倒一次，玩家不用重新找按钮。
watch(collected, (items) => {
  if (items.length === 0) scheduleDump();
});
onBeforeUnmount(() => {
  if (autoTimer !== null) clearTimeout(autoTimer);
  autoTimer = null;
});

function draftValue(id: string): string {
  return drafts.value[id] ?? String(recorded.value[id] ?? 0);
}

function onNumberInput(id: string, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  drafts.value = { ...drafts.value, [id]: target?.value ?? '' };
}

function clampCount(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/** 数字框：blur / Enter 时把整份统计条一次 dispatch（运行时只认整份 counts）。 */
async function commitTally(): Promise<void> {
  if (busy.value || !collectionComplete.value) return;
  if (Object.keys(drafts.value).length === 0) return;
  const counts: Record<string, number> = {};
  for (const item of categories.value) {
    counts[item.id] = clampCount(drafts.value[item.id], recorded.value[item.id] ?? 0);
  }
  const ok = await dispatch({ type: 'probe/tally', payload: { counts } });
  if (ok) drafts.value = {};
}

/** 合并答案：一个 chip 同时给出「最多/最少 + 类别」，点一次就写结论。 */
async function answer(direction: 'most' | 'least', categoryId: string): Promise<void> {
  if (!categoryId) return;
  const claim: ClaimInput = {
    kind: 'count-compare',
    category: categoryId,
    direction,
    tiedWith: tiedWithFor(categoryId),
    n: collected.value.length,
  };
  await dispatch({ type: 'probe/claim', payload: { claim } });
}

const currentClaim = computed(() => probe.value?.claim);
function claimChipActive(direction: 'most' | 'least', categoryId: string): boolean {
  const claim = currentClaim.value;
  return Boolean(claim && claim.kind === 'count-compare'
    && claim.direction === direction && claim.category === categoryId);
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="tally-tool">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-ink-soft">
        {{ translate('tally.collected') }} <span data-testid="tally-count">{{ collected.length }}</span>
        <template v-if="total > 0"> / {{ total }}</template>
      </p>
      <span
        v-if="submitted"
        data-testid="tally-claim-ready"
        class="rounded-full bg-mint px-3 py-1 text-xs font-bold text-teal"
      >
        结论已记录
      </span>
    </div>

    <div class="flex min-h-10 flex-wrap gap-1.5" data-testid="tally-chips">
      <span
        v-for="(token, index) in chips"
        :key="index"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-grid bg-paper text-sm font-black text-ink"
      >
        {{ token }}
      </span>
      <span v-if="chips.length === 0" class="text-xs text-ink-soft">正在把整筐倒出来……</span>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="tally-board">
      <p class="text-sm font-bold text-ink">统计条</p>
      <p class="mt-1 text-xs text-ink-soft">
        {{ collectionComplete ? '照着上面的图形，把每一类的数量填进去（按回车或点别处生效）。' : '整筐正在自动倒出来，倒完就能填数字。' }}
      </p>
      <ul class="mt-2 flex flex-col gap-2">
        <li
          v-for="item in categories"
          :key="item.id"
          class="flex items-center justify-between gap-2"
        >
          <span class="text-sm font-bold text-ink">{{ item.token }} {{ item.label }}</span>
          <input
            :value="draftValue(item.id)"
            :data-testid="'tally-input-' + item.id"
            :aria-label="item.label + ' 的数量'"
            :disabled="busy || !collectionComplete"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            class="min-h-11 w-20 rounded-xl border border-grid bg-card px-3 text-center text-base font-black text-ink disabled:opacity-40"
            @input="onNumberInput(item.id, $event)"
            @change="commitTally"
            @blur="commitTally"
            @keydown.enter="commitTally"
          >
        </li>
      </ul>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3" data-testid="tally-answer">
      <p class="text-sm font-bold text-ink">写下结论</p>
      <p class="mt-1 text-xs text-ink-soft">一个答案 = 一次点击：选「最多」或「最少」，再点一个类别。</p>
      <p class="mt-2 text-xs font-bold text-ink-soft">最多的是</p>
      <div class="mt-1 flex flex-wrap gap-2">
        <button
          v-for="item in categories"
          :key="'most-' + item.id"
          type="button"
          :data-testid="'tally-claim-most-' + item.id"
          :disabled="busy || !collectionComplete"
          class="min-h-11 rounded-xl px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="claimChipActive('most', item.id) ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="answer('most', item.id)"
        >
          {{ item.token }} {{ item.label }}
        </button>
      </div>
      <p class="mt-3 text-xs font-bold text-ink-soft">最少的是</p>
      <div class="mt-1 flex flex-wrap gap-2">
        <button
          v-for="item in categories"
          :key="'least-' + item.id"
          type="button"
          :data-testid="'tally-claim-least-' + item.id"
          :disabled="busy || !collectionComplete"
          class="min-h-11 rounded-xl px-3 text-sm font-bold active:scale-95 disabled:opacity-40"
          :class="claimChipActive('least', item.id) ? 'bg-blueprint text-white' : 'bg-card text-ink'"
          @click="answer('least', item.id)"
        >
          {{ item.token }} {{ item.label }}
        </button>
      </div>
      <p v-if="currentClaim" class="mt-2 text-xs text-ink-soft">
        当前结论：{{ currentClaim.kind === 'count-compare' ? (currentClaim.direction === 'most' ? '最多' : '最少') + ' ' + labelOf[currentClaim.category] : '' }}
        <template v-if="currentClaim.kind === 'count-compare' && (currentClaim.tiedWith?.length ?? 0) > 0">
          （并列：{{ (currentClaim.tiedWith ?? []).map((id) => labelOf[id]).join('、') }}）
        </template>
      </p>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
