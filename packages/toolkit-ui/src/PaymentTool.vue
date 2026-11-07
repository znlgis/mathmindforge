<script setup lang="ts">
import type { LevelRuntime, PiecePlacementInput, RunSnapshot } from '@mmf/game-kit';
import type { MessageParams, Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
/** 与 @mmf/content 的 ToolSpec 中的 construct 成员结构一致；toolkit-ui 不直接依赖 content。 */
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;
type PaletteEntry = ConstructSpec['config']['palette'][number];

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  t: Translator;
}>();

/** 始终读取当前的 t，避免语言切换后拿到旧翻译器。 */
function translate(key: string, params?: MessageParams): string {
  return props.t.t(key, params);
}

const palette = computed(() => props.spec.config.palette);
const coins = computed<PiecePlacementInput[]>(() => props.snapshot.toolState.construct?.pieces ?? []);
const target = computed(() => props.spec.config.target ?? 0);
const maxCoins = computed(() => props.spec.config.maxCoins ?? props.spec.config.maxPieces);
const total = computed(() => coins.value.reduce((sum, piece) => sum + (Number(piece.shape) || 0), 0));
const busy = ref(false);
const error = ref<string | null>(null);

function coinValue(entry: PaletteEntry): number {
  return entry.value ?? Number(entry.shape);
}

function labelOfShape(shape: string): string {
  return palette.value.find((entry) => entry.shape === shape || entry.id === shape)?.label ?? shape;
}

async function addCoin(entry: PaletteEntry): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: {
        piece: {
          id: 'coin-auto',
          shape: String(coinValue(entry)),
          x: coins.value.length,
          y: 0,
        },
      },
    });
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function removeCoin(piece: PiecePlacementInput): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/remove',
      payload: { pieceId: piece.id },
    });
    if (!result.ok) error.value = result.message ? translate(result.message) : null;
  } finally {
    busy.value = false;
  }
}

</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="payment-tool">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-sm font-bold text-ink">柜台要收 {{ target }} 元</p>
      <p class="text-xs font-semibold text-ink-soft">最多 {{ maxCoins }} 枚</p>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">选硬币</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="entry in palette"
          :key="entry.id"
          type="button"
          :data-testid="'payment-add-' + coinValue(entry)"
          :disabled="busy || coins.length >= maxCoins"
          :aria-label="'放一枚 ' + entry.label"
          class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-grid bg-card text-base font-black text-ink active:scale-95 disabled:opacity-40"
          @click="addCoin(entry)"
        >
          {{ entry.label }}
        </button>
      </div>
    </div>

    <div class="rounded-2xl border border-grid bg-paper p-3">
      <p class="text-sm font-bold text-ink" data-testid="payment-total">
        合计 {{ total }} 元 · {{ coins.length }} 枚
      </p>
      <ul v-if="coins.length > 0" class="mt-2 flex flex-wrap gap-2">
        <li v-for="piece in coins" :key="piece.id">
          <button
            type="button"
            :data-testid="'payment-remove-' + piece.id"
            :disabled="busy"
            :aria-label="translate('construct.remove') + ' ' + labelOfShape(piece.shape)"
            class="rounded-full border border-grid bg-card px-3 py-1 text-xs font-semibold text-ink active:scale-95 disabled:opacity-40"
            @click="removeCoin(piece)"
          >
            {{ labelOfShape(piece.shape) }} ✕
          </button>
        </li>
      </ul>
      <p v-else class="mt-1 text-xs text-ink-soft">柜台还空着。</p>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
