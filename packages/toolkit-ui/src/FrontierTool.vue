<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface FrontierScriptView {
  nodes?: { id: string; label: string }[];
  edges?: { id: string; from: string; to: string; min: number; max: number; default: number }[];
  start?: string;
  goal?: string;
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const script = computed<FrontierScriptView>(() => (props.detail.levelScript ?? {}) as FrontierScriptView);
const nodes = computed(() => script.value.nodes ?? []);
const edges = computed(() => script.value.edges ?? []);
const costs = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  for (const piece of props.snapshot.toolState.construct?.pieces ?? []) map[piece.shape] = piece.y;
  return map;
});
const busy = ref(false);
const error = ref<string | null>(null);

function labelOf(id: string | undefined): string {
  if (!id) return '—';
  return nodes.value.find((node) => node.id === id)?.label ?? id;
}

function edgeLabel(edge: { from: string; to: string }): string {
  return labelOf(edge.from) + ' → ' + labelOf(edge.to);
}

async function setCost(edgeId: string, value: number): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: value } },
    });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="frontier-tool" class="mt-3 flex flex-col gap-3">
    <p class="text-xs text-ink-soft">给每条边设一个代价；点“验证”后引擎会跑贪心与最优两条路径。</p>
    <div v-for="edge in edges" :key="edge.id" class="flex items-center justify-between gap-2 rounded-2xl border border-grid bg-paper p-3">
      <p class="text-sm font-bold text-ink">{{ labelOf(edge.from) }} → {{ labelOf(edge.to) }}</p>
      <select
        :data-testid="'frontier-cost-' + edge.id"
        :aria-label="edgeLabel(edge) + ' 的代价'"
        class="min-h-10 rounded-xl border border-grid bg-card px-2 text-xs font-semibold"
        :value="String(costs[edge.id] ?? edge.default)"
        @change="setCost(edge.id, Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="value in (edge.max - edge.min + 1)" :key="value" :value="String(edge.min + value - 1)">{{ edge.min + value - 1 }}</option>
      </select>
    </div>
    <p class="text-[11px] text-ink-soft">起点：{{ labelOf(script.start) }} · 终点：{{ labelOf(script.goal) }}</p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
