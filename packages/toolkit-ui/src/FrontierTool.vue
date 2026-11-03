<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface FrontierNodeView {
  id: string;
  label: string;
  x: number;
  y: number;
}
interface FrontierEdgeView {
  id: string;
  from: string;
  to: string;
  min: number;
  max: number;
  default: number;
}
interface FrontierScriptView {
  nodes?: FrontierNodeView[];
  edges?: FrontierEdgeView[];
  start?: string;
  goal?: string;
}

interface LayoutNode extends FrontierNodeView {
  sx: number;
  sy: number;
}
interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  min: number;
  max: number;
  default: number;
  cost: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bx: number;
  by: number;
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 58;
const busy = ref(false);
const error = ref<string | null>(null);

const script = computed<FrontierScriptView>(() => (props.detail.levelScript ?? {}) as FrontierScriptView);
const nodes = computed(() => script.value.nodes ?? []);
const edges = computed(() => script.value.edges ?? []);
const costs = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  for (const piece of props.snapshot.toolState.construct?.pieces ?? []) map[piece.shape] = piece.y;
  return map;
});

function costOf(edge: FrontierEdgeView): number {
  return costs.value[edge.id] ?? edge.default;
}

function labelOf(id: string | undefined): string {
  if (!id) return '—';
  return nodes.value.find((node) => node.id === id)?.label ?? id;
}

/** 贪心：每到一站选当前最便宜的出边（与运行时 frontier.ts 同口径）。 */
const greedy = computed(() => {
  const start = script.value.start;
  const goal = script.value.goal;
  if (!start || !goal) return { path: [] as string[], cost: 0, reached: false };
  const currentCosts: Record<string, number> = {};
  for (const edge of edges.value) currentCosts[edge.id] = costOf(edge);
  const path = [start];
  const guard = new Set<string>();
  let current = start;
  let cost = 0;
  while (current !== goal) {
    if (guard.has(current)) return { path, cost, reached: false };
    guard.add(current);
    const options = edges.value.filter((edge) => edge.from === current);
    if (options.length === 0) return { path, cost, reached: false };
    let best = options[0] as FrontierEdgeView;
    for (const edge of options) {
      if ((currentCosts[edge.id] ?? edge.default) < (currentCosts[best.id] ?? best.default)) best = edge;
    }
    cost += currentCosts[best.id] ?? best.default;
    current = best.to;
    path.push(current);
  }
  return { path, cost, reached: true };
});

/** 最优：固定小图，枚举全部简单路径取最小（与运行时同口径）。 */
const optimal = computed(() => {
  const start = script.value.start;
  const goal = script.value.goal;
  if (!start || !goal) return { path: [] as string[], cost: Number.POSITIVE_INFINITY };
  const currentCosts: Record<string, number> = {};
  for (const edge of edges.value) currentCosts[edge.id] = costOf(edge);
  let best: { path: string[]; cost: number } = { path: [], cost: Number.POSITIVE_INFINITY };
  const visit = (node: string, path: string[], cost: number): void => {
    if (cost >= best.cost) return;
    if (node === goal) {
      best = { path: [...path, node], cost };
      return;
    }
    for (const edge of edges.value.filter((item) => item.from === node)) {
      if (path.includes(edge.to)) continue;
      visit(edge.to, [...path, node], cost + (currentCosts[edge.id] ?? edge.default));
    }
  };
  visit(start, [], 0);
  return best;
});

const isCounterexample = computed(() => (
  greedy.value.reached
  && Number.isFinite(optimal.value.cost)
  && greedy.value.cost > optimal.value.cost
));
const greedyText = computed(() => (greedy.value.reached ? String(greedy.value.cost) : '走不到终点'));
const optimalText = computed(() => (Number.isFinite(optimal.value.cost) ? String(optimal.value.cost) : '—'));
const diffText = computed(() => {
  if (!greedy.value.reached || !Number.isFinite(optimal.value.cost)) return '—';
  const diff = greedy.value.cost - optimal.value.cost;
  return diff > 0 ? '+' + diff : String(diff);
});

function pickBadge(
  a: LayoutNode,
  b: LayoutNode,
  index: number,
  taken: { x: number; y: number }[],
): { x: number; y: number } {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const sides = index % 2 === 0 ? [1, -1] : [-1, 1];
  for (const t of [0.5, 0.6, 0.4, 0.7, 0.3]) {
    for (const side of sides) {
      const cx = a.sx + dx * t + px * 6.5 * side;
      const cy = a.sy + dy * t + py * 6.5 * side;
      if (cx < 8 || cx > 92 || cy < 6 || cy > VIEW_HEIGHT - 6) continue;
      if (taken.some((point) => Math.hypot(point.x - cx, point.y - cy) < 15)) continue;
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
  const byId = new Map<string, LayoutNode>();
  const layoutNodes = list.map((node) => {
    const mapped: LayoutNode = {
      ...node,
      sx: 10 + ((node.x - minX) / spanX) * 80,
      sy: 8 + ((node.y - minY) / spanY) * 34,
    };
    byId.set(node.id, mapped);
    return mapped;
  });
  const taken: { x: number; y: number }[] = [];
  const layoutEdges: LayoutEdge[] = [];
  edges.value.forEach((edge, index) => {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) return;
    const spot = pickBadge(a, b, index, taken);
    taken.push(spot);
    layoutEdges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      min: edge.min,
      max: edge.max,
      default: edge.default,
      cost: costOf(edge),
      x1: a.sx,
      y1: a.sy,
      x2: b.sx,
      y2: b.sy,
      bx: spot.x,
      by: spot.y,
    });
  });
  return { nodes: layoutNodes, edges: layoutEdges };
});

async function setCost(edge: FrontierEdgeView, value: number): Promise<void> {
  if (busy.value) return;
  const next = Math.max(edge.min, Math.min(edge.max, Math.trunc(value)));
  if (next === costOf(edge)) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: edge.id, shape: edge.id, x: 0, y: next } },
    });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function step(edge: FrontierEdgeView, delta: number): Promise<void> {
  await setCost(edge, costOf(edge) + delta);
}

/** 旧 e2e 的 frontier-cost-* 兼容路径：sr-only 原生下拉。 */
async function onSelect(edgeId: string, event: Event): Promise<void> {
  const value = Number((event.target as HTMLSelectElement | null)?.value ?? '');
  const edge = edges.value.find((item) => item.id === edgeId);
  if (!edge || !Number.isFinite(value)) return;
  await setCost(edge, value);
}
</script>

<template>
  <section data-testid="frontier-tool" class="mt-3 flex flex-col gap-3">
    <p class="text-xs text-ink-soft">
      给每条边改一个代价（点 + / − 或点数字）。让贪心走出的总代价严格大于最优路径。
    </p>

    <div class="rounded-2xl border border-grid bg-paper p-2">
      <svg
        :viewBox="'0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT"
        class="w-full"
        role="img"
        aria-label="起点、两条岔路与终点的代价示意图"
      >
        <defs>
          <marker
            id="frontier-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#93a3ae" />
          </marker>
        </defs>

        <line
          v-for="edge in layout.edges"
          :key="'line-' + edge.id"
          :x1="edge.x1"
          :y1="edge.y1"
          :x2="edge.x2"
          :y2="edge.y2"
          stroke="#93a3ae"
          stroke-width="0.8"
          stroke-linecap="round"
          marker-end="url(#frontier-arrow)"
        />

        <g
          v-for="edge in layout.edges"
          :key="edge.id"
          :data-testid="'frontier-edge-' + edge.id"
        >
          <text
            :x="edge.x1 + (edge.x2 - edge.x1) * 0.5"
            :y="edge.y1 + (edge.y2 - edge.y1) * 0.5 - 1.2"
            text-anchor="middle"
            font-size="2.3"
            font-weight="600"
            fill="#55636f"
          >
            {{ labelOf(edge.from) }} → {{ labelOf(edge.to) }}
          </text>
          <circle
            :cx="edge.bx - 6"
            :cy="edge.by"
            r="2.9"
            fill="#fffdf8"
            stroke="#2f7d78"
            stroke-width="0.5"
            class="cursor-pointer"
            :data-testid="'frontier-minus-' + edge.id"
            @click="step(edge, -1)"
          />
          <text
            :x="edge.bx - 6"
            :y="edge.by + 1.1"
            text-anchor="middle"
            font-size="3"
            font-weight="700"
            fill="#2f7d78"
            class="pointer-events-none"
          >
            −
          </text>
          <text
            :x="edge.bx"
            :y="edge.by + 1.4"
            text-anchor="middle"
            font-size="4"
            font-weight="900"
            fill="#22303c"
            class="cursor-pointer"
            :data-testid="'frontier-value-' + edge.id"
            @click="step(edge, 1)"
          >
            {{ edge.cost }}
          </text>
          <circle
            :cx="edge.bx + 6"
            :cy="edge.by"
            r="2.9"
            fill="#fffdf8"
            stroke="#2f7d78"
            stroke-width="0.5"
            class="cursor-pointer"
            :data-testid="'frontier-plus-' + edge.id"
            @click="step(edge, 1)"
          />
          <text
            :x="edge.bx + 6"
            :y="edge.by + 1.1"
            text-anchor="middle"
            font-size="3"
            font-weight="700"
            fill="#2f7d78"
            class="pointer-events-none"
          >
            +
          </text>
        </g>

        <g v-for="node in layout.nodes" :key="node.id" :data-testid="'frontier-node-' + node.id">
          <circle :cx="node.sx" :cy="node.sy" r="3.4" fill="#fffdf8" stroke="#22303c" stroke-width="0.8" />
          <text
            :x="node.sx"
            :y="node.sy + 1"
            text-anchor="middle"
            font-size="2.3"
            font-weight="700"
            fill="#22303c"
          >
            {{ node.label }}
          </text>
        </g>
      </svg>
    </div>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
      <span
        data-testid="frontier-live"
        :class="isCounterexample ? 'text-teal' : 'text-ink-soft'"
      >
        贪心 {{ greedyText }} / 最优 {{ optimalText }} / 差 {{ diffText }}
      </span>
      <span class="text-ink-soft">起点：{{ labelOf(script.start) }} · 终点：{{ labelOf(script.goal) }}</span>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>

    <!-- 旧 e2e 的 frontier-cost-* 兼容路径：sr-only 原生下拉。 -->
    <select
      v-for="edge in edges"
      :key="'select-' + edge.id"
      class="sr-only"
      :data-testid="'frontier-cost-' + edge.id"
      :value="String(costOf(edge))"
      :aria-label="labelOf(edge.from) + ' 到 ' + labelOf(edge.to) + ' 的代价'"
      @change="onSelect(edge.id, $event)"
    >
      <option v-for="value in (edge.max - edge.min + 1)" :key="value" :value="String(edge.min + value - 1)">
        {{ edge.min + value - 1 }}
      </option>
    </select>
  </section>
</template>