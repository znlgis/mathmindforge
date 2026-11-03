<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

/** 同一毫秒内连点两格时 Date.now() 会重复，两块骨牌共用一个 id，删一块会连坐另一块。 */
let dominoSerial = 0;
function nextDominoId(): string {
  dominoSerial += 1;
  return 'domino-' + dominoSerial;
}

interface BoardConfig {
  width: number;
  height: number;
  removed: { x: number; y: number }[];
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const board = computed<BoardConfig>(() => {
  const script = props.detail.levelScript as { board?: BoardConfig };
  return script.board ?? { width: 5, height: 5, removed: [] };
});
const dominoes = computed(() => props.snapshot.toolState.construct?.pieces ?? []);
const selected = ref<{ x: number; y: number } | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const removedKeys = computed(() => new Set(board.value.removed.map((cell) => cell.x + ',' + cell.y)));
const occupied = computed(() => {
  const map = new Map<string, string>();
  for (const piece of dominoes.value) {
    const cells = piece.shape === 'v'
      ? [[piece.x, piece.y], [piece.x, piece.y + 1]]
      : [[piece.x, piece.y], [piece.x + 1, piece.y]];
    for (const [x, y] of cells) map.set(x + ',' + y, piece.id);
  }
  return map;
});

const rows = computed(() => {
  const out: {
    x: number; y: number; removed: boolean; occupied: string | null; selected: boolean; black: boolean;
  }[][] = [];
  for (let y = 0; y < board.value.height; y += 1) {
    const row = [];
    for (let x = 0; x < board.value.width; x += 1) {
      const key = x + ',' + y;
      row.push({
        x, y,
        removed: removedKeys.value.has(key),
        occupied: occupied.value.get(key) ?? null,
        selected: selected.value?.x === x && selected.value?.y === y,
        black: (x + y) % 2 === 0,
      });
    }
    out.push(row);
  }
  return out;
});

function cellTestId(x: number, y: number): string {
  return 'domino-cell-' + x + '-' + y;
}

/** 8×8 的棋盘用小一档的格子，整个工具区在 1280×800 里不用滚动就能看到论证板。 */
const cellSizeClass = computed(() => (board.value.width >= 8 ? 'h-8 w-8' : 'h-10 w-10'));

/** 格子按钮的内容只有空 / ▭ / ×，屏幕阅读器读不出坐标与状态，这里补可访问名。 */
function cellLabel(cell: { x: number; y: number; removed: boolean; occupied: string | null }): string {
  const position = '第 ' + (cell.y + 1) + ' 行第 ' + (cell.x + 1) + ' 列';
  if (cell.removed) return position + '：缺口';
  if (cell.occupied) return position + '：已有骨牌';
  return position;
}

async function placeBetween(a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    error.value = '多米诺要盖住相邻的两格。';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const shape = dx !== 0 ? 'h' : 'v';
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: nextDominoId(), shape, x, y } },
    });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
    else selected.value = null;
  } finally {
    busy.value = false;
  }
}

async function clickCell(x: number, y: number): Promise<void> {
  if (busy.value) return;
  if (selected.value === null) {
    selected.value = { x, y };
    return;
  }
  if (selected.value.x === x && selected.value.y === y) {
    selected.value = null;
    return;
  }
  await placeBetween(selected.value, { x, y });
}

async function remove(id: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'construct/remove', payload: { pieceId: id } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="domino-tool">
    <p class="text-xs text-ink-soft">
      随便铺几块试试——这里不设检查点，铺不满很正常。深色格是黑格，浅色格是白格。
    </p>
    <div class="flex flex-col gap-1" data-testid="domino-board">
      <div v-for="(row, y) in rows" :key="y" class="flex gap-1">
        <button
          v-for="cell in row"
          :key="cell.x + '-' + cell.y"
          type="button"
          :data-testid="cellTestId(cell.x, cell.y)"
          :aria-label="cellLabel(cell)"
          :aria-pressed="cell.selected"
          :disabled="cell.removed || busy"
          class="rounded-lg border text-xs font-bold active:scale-95 disabled:opacity-30"
          :class="[cellSizeClass, cell.removed
            ? 'border-grid bg-paper text-ink-soft'
            : cell.occupied
              ? 'border-teal bg-mint text-teal'
              : cell.selected
                ? 'border-blueprint bg-blueprint text-white'
                : cell.black
                  ? 'border-grid bg-ink/15 text-ink'
                  : 'border-grid bg-card text-ink']"
          @click="clickCell(cell.x, cell.y)"
        >
          {{ cell.removed ? '×' : cell.occupied ? '▭' : '' }}
        </button>
      </div>
    </div>
    <div v-if="dominoes.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="piece in dominoes"
        :key="piece.id"
        type="button"
        :data-testid="'domino-remove-' + piece.id"
        class="rounded-full border border-grid bg-card px-3 py-1 text-xs font-semibold"
        @click="remove(piece.id)"
      >
        拿走 第{{ piece.y + 1 }} 行第{{ piece.x + 1 }} 列
      </button>
    </div>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
