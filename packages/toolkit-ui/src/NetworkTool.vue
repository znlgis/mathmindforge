<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface NetworkNodeView {
  id: string;
  label: string;
  x: number;
  y: number;
  key?: boolean;
}
interface NetworkEdgeView {
  id: string;
  a: string;
  b: string;
  cost: number;
}
interface NetworkScriptView {
  nodes?: NetworkNodeView[];
  edges?: NetworkEdgeView[];
  budget?: number;
  maxEdges?: number;
  /** 至少有几条候选边的一端是关键站点（同一条边只算 1 次）。 */
  minKeyEdges?: number;
}

interface LayoutNode extends NetworkNodeView {
  sx: number;
  sy: number;
}
interface LayoutEdge {
  id: string;
  cost: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 成本数字热区（图上可点的那一个点）。 */
  bx: number;
  by: number;
  selected: boolean;
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

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 56;
const PAD_X = 10;
const NODE_MIN_Y = 8;
const NODE_SPAN_Y = 32;

function pickBadgeSpot(
  a: LayoutNode,
  b: LayoutNode,
  index: number,
  taken: { x: number; y: number }[],
): { x: number; y: number } {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const sides = index % 2 === 0 ? [1, -1] : [-1, 1];
  for (const t of [0.5, 0.62, 0.38, 0.74, 0.26]) {
    for (const side of sides) {
      const cx = a.sx + dx * t + px * 5 * side;
      const cy = a.sy + dy * t + py * 5 * side;
      if (cx < 6 || cx > 94 || cy < 5 || cy > VIEW_HEIGHT - 5) continue;
      if (taken.some((point) => Math.hypot(point.x - cx, point.y - cy) < 9.5)) continue;
      return { x: cx, y: cy };
    }
  }
  return { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
}

const layout = computed(() => {
  const list = nodes.value;
  if (list.length === 0) return { nodes: [] as LayoutNode[], edges: [] as LayoutEdge[] };
  const xs = list.map((node) => node.x);
  const ys = list.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const sxOf = (x: number): number => PAD_X + ((x - minX) / spanX) * (VIEW_WIDTH - PAD_X * 2);
  const syOf = (y: number): number => NODE_MIN_Y + ((y - minY) / spanY) * NODE_SPAN_Y;
  const byId = new Map<string, LayoutNode>();
  const layoutNodes = list.map((node) => {
    const mapped: LayoutNode = { ...node, sx: sxOf(node.x), sy: syOf(node.y) };
    byId.set(node.id, mapped);
    return mapped;
  });
  const taken: { x: number; y: number }[] = [];
  const layoutEdges: LayoutEdge[] = [];
  edges.value.forEach((edge, index) => {
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b) return;
    const spot = pickBadgeSpot(a, b, index, taken);
    taken.push(spot);
    layoutEdges.push({
      id: edge.id,
      cost: edge.cost,
      x1: a.sx,
      y1: a.sy,
      x2: b.sx,
      y2: b.sy,
      bx: spot.x,
      by: spot.y,
      selected: selected.value.has(edge.id),
    });
  });
  return { nodes: layoutNodes, edges: layoutEdges };
});

/** 实时约束灯：连通块 / 成本 / 关键站点 / 边数。 */
const stats = computed(() => {
  const ids = nodes.value.map((node) => node.id);
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) as string;
    return current;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const nodeById = new Map(nodes.value.map((node) => [node.id, node]));
  let cost = 0;
  let keyEdges = 0;
  const keyStations = new Set<string>();
  for (const edge of edges.value) {
    if (!selected.value.has(edge.id)) continue;
    cost += edge.cost;
    union(edge.a, edge.b);
    const aKey = Boolean(nodeById.get(edge.a)?.key);
    const bKey = Boolean(nodeById.get(edge.b)?.key);
    if (aKey || bKey) keyEdges += 1;
    if (aKey) keyStations.add(edge.a);
    if (bKey) keyStations.add(edge.b);
  }
  const components = new Set(ids.map((id) => find(id))).size;
  const totalKeyStations = nodes.value.filter((node) => node.key).length;
  return { components, cost, keyEdges, keyStations: keyStations.size, totalKeyStations, count: selected.value.size };
});

const budget = computed(() => script.value.budget ?? 0);
const maxEdges = computed(() => script.value.maxEdges ?? edges.value.length);
const minKey = computed(() => script.value.minKeyEdges ?? 0);
const connected = computed(() => stats.value.components === 1);

async function toggle(edgeId: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch(selected.value.has(edgeId)
      ? { type: 'construct/remove', payload: { pieceId: edgeId } }
      : { type: 'construct/place', payload: { piece: { id: edgeId, shape: edgeId, x: 0, y: 0 } } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="network-tool" class="mt-3 flex flex-col gap-3">
    <p class="text-xs text-ink-soft">
      点一条候选道路选中或取消。把站点连成一整块，成本不超过 {{ budget }}；学校和医院合计至少接 {{ minKey }} 条路。
    </p>

    <div class="rounded-2xl border border-grid bg-paper p-2">
      <svg
        :viewBox="'0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT"
        class="w-full"
        role="img"
        aria-label="候选道路与站点的示意图"
      >
        <line
          v-for="edge in layout.edges"
          :key="'line-' + edge.id"
          :x1="edge.x1"
          :y1="edge.y1"
          :x2="edge.x2"
          :y2="edge.y2"
          :stroke="edge.selected ? '#2f7d78' : '#c3cfd8'"
          :stroke-width="edge.selected ? 1.4 : 0.7"
          stroke-linecap="round"
          class="cursor-pointer"
          @click="toggle(edge.id)"
        />
        <g
          v-for="edge in layout.edges"
          :key="edge.id"
          :data-testid="'network-edge-' + edge.id"
          role="button"
          tabindex="0"
          :aria-label="'切换道路 ' + edge.id + '，成本 ' + edge.cost"
          class="cursor-pointer"
          @click="toggle(edge.id)"
        >
          <circle
            :cx="edge.bx"
            :cy="edge.by"
            r="3.4"
            :fill="edge.selected ? '#cfe6d4' : '#fffdf8'"
            :stroke="edge.selected ? '#2f7d78' : '#d8e2e8'"
            stroke-width="0.5"
          />
          <text
            :x="edge.bx"
            :y="edge.by + 1.1"
            text-anchor="middle"
            font-size="3.1"
            font-weight="700"
            :fill="edge.selected ? '#2f7d78' : '#55636f'"
          >
            {{ edge.cost }}
          </text>
        </g>
        <g v-for="node in layout.nodes" :key="node.id" :data-testid="'network-node-' + node.id">
          <circle
            :cx="node.sx"
            :cy="node.sy"
            r="3.6"
            fill="#fffdf8"
            :stroke="node.key ? '#b07d2b' : '#55636f'"
            :stroke-width="node.key ? 1.3 : 0.8"
          />
          <text
            :x="node.sx"
            :y="node.sy + 1"
            text-anchor="middle"
            font-size="2.4"
            font-weight="700"
            :fill="node.key ? '#b07d2b' : '#22303c'"
          >
            {{ node.label }}
          </text>
          <text
            v-if="node.key"
            :x="node.sx"
            :y="node.sy - 4.6"
            text-anchor="middle"
            font-size="2.4"
            font-weight="700"
            fill="#b07d2b"
          >
            ★
          </text>
        </g>
      </svg>
    </div>

    <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
      <span data-testid="network-components" :class="connected ? 'text-teal' : 'text-ink-soft'">
        连通块 {{ stats.components }}/1
      </span>
      <span data-testid="network-cost" :class="stats.cost > budget ? 'text-red' : 'text-ink-soft'">
        成本 {{ stats.cost }} / {{ budget }}
      </span>
      <span data-testid="network-keys" :class="stats.keyEdges >= minKey ? 'text-teal' : 'text-red'">
        关键站点接入 {{ stats.keyEdges }}/{{ minKey }} 条 · 已接 {{ stats.keyStations }}/{{ stats.totalKeyStations }} 站
      </span>
      <span data-testid="network-edges" :class="stats.count > maxEdges ? 'text-red' : 'text-ink-soft'">
        边 {{ stats.count }}/{{ maxEdges }}
      </span>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
