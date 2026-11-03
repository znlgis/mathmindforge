<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface DistributionScript {
  containers?: { id: string; label: string }[];
  items?: { id: string; label: string; token: string; count: number }[];
  constraints?: { equalCounts?: boolean; minKinds?: number; maxPerContainer?: number };
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const script = computed<DistributionScript>(() => (props.detail.levelScript ?? {}) as DistributionScript);
const containers = computed(() => script.value.containers ?? []);
const items = computed(() => script.value.items ?? []);
const maxPer = computed(() => script.value.constraints?.maxPerContainer ?? 4);
const pieces = computed(() => props.snapshot.toolState.construct?.pieces ?? []);
const busy = ref(false);
const error = ref<string | null>(null);

const placed = computed(() => {
  const map = new Map<string, number>();
  for (const piece of pieces.value) {
    map.set(piece.x + ':' + piece.shape, (map.get(piece.x + ':' + piece.shape) ?? 0) + 1);
  }
  return map;
});
const totals = computed(() => {
  const map = new Map<string, number>();
  for (const piece of pieces.value) map.set(piece.shape, (map.get(piece.shape) ?? 0) + 1);
  return map;
});
const containerTotal = (index: number): number => pieces.value.filter((piece) => piece.x === index).length;

function count(container: number, item: string): number {
  return placed.value.get(container + ':' + item) ?? 0;
}

function remaining(itemId: string): number {
  const item = items.value.find((entry) => entry.id === itemId);
  return (item?.count ?? 0) - (totals.value.get(itemId) ?? 0);
}

/** 第一个容器当前的搭配（种类 → 件数）。 */
const firstCounts = computed(() => {
  const map = new Map<string, number>();
  for (const item of items.value) {
    const value = count(0, item.id);
    if (value > 0) map.set(item.id, value);
  }
  return map;
});

/** 复制按钮旁边要显示的"一份搭配"。 */
const copyPlan = computed(() => {
  if (firstCounts.value.size === 0) return null;
  const parts: string[] = [];
  for (const item of items.value) {
    const value = firstCounts.value.get(item.id) ?? 0;
    if (value > 0) parts.push(item.token + '×' + value);
  }
  return parts.join(' + ');
});

/** 为什么现在不能复制：给玩家看人话，而不是禁用按钮后一片沉默。 */
const copyBlockedReason = computed<string | null>(() => {
  if (containers.value.length < 2) return '只有一个容器，不用复制。';
  if (firstCounts.value.size === 0) return '先在第一个容器里摆好一份。';
  if (containerTotal(0) > maxPer.value) return '第一个容器超过上限了，先减到 ' + maxPer.value + ' 件以内。';
  for (const item of items.value) {
    const need = (firstCounts.value.get(item.id) ?? 0) * containers.value.length;
    if (need > item.count) {
      return item.token + ' ' + item.label + '不够：每个容器都放的话，一共要用 ' + need + ' 件。';
    }
  }
  return null;
});

async function add(containerIndex: number, itemId: string): Promise<void> {
  if (busy.value) return;
  if (remaining(itemId) <= 0) {
    error.value = '这种物品已经分完了。';
    return;
  }
  if (containerTotal(containerIndex) >= maxPer.value) {
    error.value = '这个容器已经装满了。';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'dist-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6), shape: itemId, x: containerIndex, y: 0 } },
    });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function remove(containerIndex: number, itemId: string): Promise<void> {
  if (busy.value) return;
  const piece = [...pieces.value].reverse().find((entry) => entry.x === containerIndex && entry.shape === itemId);
  if (!piece) return;
  busy.value = true;
  try {
    await props.runtime.dispatch({ type: 'construct/remove', payload: { pieceId: piece.id } });
  } finally {
    busy.value = false;
  }
}

/**
 * 其余容器照第一个容器分：UI 侧循环 dispatch（不改 runtime/schema）。
 * 先把其余容器清空，再按第一容器的搭配逐件放进去，保证不会触发"这种物品已经分完了"。
 */
async function copyFirstToRest(): Promise<void> {
  if (busy.value) return;
  if (copyBlockedReason.value) {
    error.value = copyBlockedReason.value;
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    for (let index = 1; index < containers.value.length; index += 1) {
      const own = pieces.value.filter((piece) => piece.x === index).map((piece) => piece.id).reverse();
      for (const pieceId of own) {
        const result = await props.runtime.dispatch({ type: 'construct/remove', payload: { pieceId } });
        if (!result.ok) {
          error.value = result.message ? props.t.t(result.message) : null;
          return;
        }
      }
    }
    for (let index = 1; index < containers.value.length; index += 1) {
      for (const item of items.value) {
        const value = firstCounts.value.get(item.id) ?? 0;
        for (let n = 0; n < value; n += 1) {
          const result = await props.runtime.dispatch({
            type: 'construct/place',
            payload: { piece: { id: 'dist-copy-' + index + '-' + item.id + '-' + n, shape: item.id, x: index, y: 0 } },
          });
          if (!result.ok) {
            error.value = result.message ? props.t.t(result.message) : null;
            return;
          }
        }
      }
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="distribute-tool">
    <p class="text-xs text-ink-soft">把物品分进容器：每个容器数量相同，且按关卡要求搭配种类。</p>
    <div class="grid gap-2" :class="containers.length >= 4 ? 'sm:grid-cols-2' : 'grid-cols-1'">
      <article
        v-for="(container, index) in containers"
        :key="container.id"
        class="rounded-2xl border border-grid bg-paper p-3"
        :data-testid="'dist-container-' + index"
      >
        <div class="flex items-baseline justify-between">
          <p class="text-sm font-bold text-ink">{{ container.label }}</p>
          <span class="text-[11px] text-ink-soft">{{ containerTotal(index) }} / {{ maxPer }}</span>
        </div>
        <div class="mt-2 flex flex-col gap-1.5">
          <div v-for="item in items" :key="item.id" class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-ink-soft">{{ item.token }} {{ item.label }}</span>
            <span class="flex items-center gap-1">
              <button
                type="button"
                :data-testid="'dist-minus-' + index + '-' + item.id"
                :aria-label="'从' + container.label + '拿掉一个' + item.label"
                :disabled="busy || count(index, item.id) === 0"
                class="h-8 w-8 rounded-lg bg-card text-sm font-black disabled:opacity-30"
                @click="remove(index, item.id)"
              >
                −
              </button>
              <span :data-testid="'dist-count-' + index + '-' + item.id" class="w-6 text-center text-sm font-black">{{ count(index, item.id) }}</span>
              <button
                type="button"
                :data-testid="'dist-plus-' + index + '-' + item.id"
                :aria-label="'往' + container.label + '放一个' + item.label"
                :disabled="busy"
                class="h-8 w-8 rounded-lg bg-card text-sm font-black disabled:opacity-30"
                @click="add(index, item.id)"
              >
                +
              </button>
            </span>
          </div>
        </div>
      </article>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="dist-copy-first"
          :disabled="busy || copyBlockedReason !== null"
          class="min-h-11 rounded-xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
          @click="copyFirstToRest"
        >
          其余容器照这样分
        </button>
        <span v-if="copyPlan" class="text-[11px] font-semibold text-ink-soft">
          每个容器各放：{{ copyPlan }}
        </span>
        <span v-else class="text-[11px] font-semibold text-ink-soft">{{ copyBlockedReason }}</span>
      </div>
      <p v-if="copyPlan && copyBlockedReason" class="mt-1 text-[11px] font-semibold text-red">{{ copyBlockedReason }}</p>
    </div>

    <div class="flex flex-wrap gap-2 text-[11px] text-ink-soft">
      <span v-for="item in items" :key="item.id" :data-testid="'dist-remaining-' + item.id">
        剩余 {{ item.token }}：{{ remaining(item.id) }}
      </span>
    </div>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
