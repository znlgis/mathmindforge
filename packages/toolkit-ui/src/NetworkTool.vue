<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface NetworkScriptView {
  nodes?: { id: string; label: string; x: number; y: number; key?: boolean }[];
  edges?: { id: string; a: string; b: string; cost: number }[];
  budget?: number;
  maxEdges?: number;
  minKeyEdges?: number;
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const script = computed<NetworkScriptView>(() => (props.detail.levelScript ?? {}) as NetworkScriptView);
const nodes = computed(() => script.value.nodes ?? []);
const edges = computed(() => script.value.edges ?? []);
const selected = computed(() => new Set((props.snapshot.toolState.construct?.pieces ?? []).map((piece) => piece.shape)));
const busy = ref(false);
const error = ref<string | null>(null);

const cost = computed(() => edges.value.filter((edge) => selected.value.has(edge.id)).reduce((sum, edge) => sum + edge.cost, 0));
const keyEdges = computed(() => {
  let count = 0;
  for (const edge of edges.value) {
    if (!selected.value.has(edge.id)) continue;
    if (nodes.value.find((node) => node.id === edge.a)?.key) count += 1;
    if (nodes.value.find((node) => node.id === edge.b)?.key) count += 1;
  }
  return count;
});

function edgeLabel(edge: { a: string; b: string }): string {
  const a = nodes.value.find((node) => node.id === edge.a)?.label ?? edge.a;
  const b = nodes.value.find((node) => node.id === edge.b)?.label ?? edge.b;
  return a + ' — ' + b;
}

async function toggle(edgeId: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = selected.value.has(edgeId)
      ? await props.runtime.dispatch({ type: 'construct/remove', payload: { pieceId: edgeId } })
      : await props.runtime.dispatch({ type: 'construct/place', payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: 0 } } });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="network-tool" class="mt-3 flex flex-col gap-3">
    <p class="text-xs text-ink-soft">
      选边把站点连成一张网；至少连到关键站点 {{ script.minKeyEdges ?? 0 }} 次，成本 ≤ {{ script.budget ?? '—' }}。
    </p>
    <div class="grid gap-2 sm:grid-cols-2">
      <article
        v-for="node in nodes"
        :key="node.id"
        class="rounded-2xl border border-grid bg-paper p-3"
        :class="node.key ? 'border-brass' : ''"
        :data-testid="'network-node-' + node.id"
      >
        <p class="text-sm font-bold text-ink">
          {{ node.label }}
          <span v-if="node.key" class="ml-1 rounded-full bg-brass/20 px-2 py-0.5 text-[10px] text-brass">关键</span>
        </p>
      </article>
    </div>
    <div class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-xs font-bold text-ink">候选边</p>
      <div class="mt-2 flex flex-col gap-1.5">
        <button
          v-for="edge in edges"
          :key="edge.id"
          type="button"
          :data-testid="'network-edge-' + edge.id"
          :disabled="busy"
          class="flex min-h-10 items-center justify-between rounded-xl px-3 text-left text-xs font-semibold active:scale-95 disabled:opacity-40"
          :class="selected.has(edge.id) ? 'bg-mint text-teal' : 'bg-card text-ink'"
          @click="toggle(edge.id)"
        >
          <span>{{ edgeLabel(edge) }}</span>
          <span>{{ selected.has(edge.id) ? '已选' : '选' }} · {{ edge.cost }}</span>
        </button>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 text-[11px] font-semibold text-ink-soft">
      <span data-testid="network-cost">成本 {{ cost }} / {{ script.budget ?? '—' }}</span>
      <span>选边 {{ selected.size }} / {{ script.maxEdges ?? '—' }}</span>
      <span>关键连接 {{ keyEdges }} / {{ script.minKeyEdges ?? 0 }}</span>
    </div>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
