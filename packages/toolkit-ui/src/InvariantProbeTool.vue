<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ProbeSpec = Extract<ToolSpecLike, { kind: 'probe' }>;

const props = defineProps<{
  spec: ProbeSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

interface BoardView {
  width: number;
  height: number;
  removed: { x: number; y: number }[];
}

/** 棋盘几何与 DominoTool 同一份来源：都读 levelScript.board，不另存一份数据。 */
const board = computed<BoardView | null>(() => {
  const script = props.runtime.detail.levelScript as { board?: BoardView };
  return script.board ?? null;
});

/**
 * 模块里声明的格子数必须和棋盘对得上（content 门禁与单测钉住它）。
 * 以前 sampleSizes 是死配置：面板不读，写上 63 也照样显示 47 格。
 */
const declaredCells = computed<number | null>(() => props.spec.config.sampleSizes?.[0] ?? null);
const boardCells = computed<number | null>(() => {
  const view = board.value;
  if (!view) return null;
  return view.width * view.height - view.removed.length;
});
const cellCount = computed<number | null>(() => boardCells.value ?? declaredCells.value);
const declaredMismatch = computed(
  () => declaredCells.value !== null && boardCells.value !== null && declaredCells.value !== boardCells.value,
);

const dataset = computed(() => props.snapshot.toolState.probe?.dataset);
const counts = computed(() => dataset.value?.counts ?? null);
const busy = ref(false);
const error = ref<string | null>(null);

/** 棋盘染色预览：黑格 = 坐标和偶数，白格 = 奇数，缺口画暗。 */
const preview = computed(() => {
  const view = board.value;
  if (!view) return [];
  const removed = new Set(view.removed.map((cell) => cell.x + ',' + cell.y));
  const out: { key: string; black: boolean; removed: boolean }[] = [];
  for (let y = 0; y < view.height; y += 1) {
    for (let x = 0; x < view.width; x += 1) {
      out.push({ key: x + ',' + y, black: (x + y) % 2 === 0, removed: removed.has(x + ',' + y) });
    }
  }
  return out;
});

function cellStyle(cell: { black: boolean }): string {
  return cell.black ? 'background-color: rgb(31 41 55 / 0.75)' : 'background-color: white';
}

async function sample(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'probe/sample', payload: {} });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="invariant-tool">
    <p class="text-xs text-ink-soft">
      这张棋盘共 {{ cellCount ?? '?' }} 格。像国际象棋盘那样隔一格涂黑：每块 1×2 骨牌都会盖住一黑一白。
    </p>

    <div
      v-if="preview.length > 0"
      data-testid="invariant-board"
      class="grid w-full max-w-[280px] gap-[2px]"
      :style="{ gridTemplateColumns: 'repeat(' + (board?.width ?? 1) + ', minmax(0, 1fr))' }"
    >
      <span
        v-for="cell in preview"
        :key="cell.key"
        aria-hidden="true"
        class="aspect-square rounded-[3px] border border-grid"
        :class="cell.removed ? 'bg-grid' : ''"
        :style="cell.removed ? '' : cellStyle(cell)"
      />
    </div>

    <!-- 数过之后就只显示数字：没有「点了屏幕不变」的死按钮 -->
    <button
      v-if="!counts"
      type="button"
      data-testid="invariant-sample"
      :disabled="busy"
      class="min-h-11 rounded-2xl bg-blueprint px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
      @click="sample"
    >
      统计黑白格
    </button>

    <div v-if="counts" data-testid="invariant-counts" class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">黑格</p>
        <p class="text-lg font-black text-ink">{{ counts.black }}</p>
      </div>
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">白格</p>
        <p class="text-lg font-black text-ink">{{ counts.white }}</p>
      </div>
      <div class="rounded-xl border border-grid bg-paper p-2">
        <p class="text-[11px] text-ink-soft">总格</p>
        <p class="text-lg font-black text-ink">{{ counts.cells }}</p>
      </div>
    </div>
    <p v-else class="text-[11px] text-ink-soft">还没数：在论证板上点一条依据，也会顺手把黑白格数出来。</p>

    <p v-if="declaredMismatch" class="text-[11px] font-bold text-red">
      模块声明的格子数（{{ declaredCells }}）和棋盘（{{ boardCells }} 格）对不上。
    </p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
