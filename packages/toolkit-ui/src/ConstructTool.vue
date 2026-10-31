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

const slots = computed(() => props.spec.config.slots ?? []);
const palette = computed(() => props.spec.config.palette);
const pieces = computed(() => props.snapshot.toolState.construct?.pieces ?? []);
const selectedSlot = ref<number | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const placedByIndex = computed(() => {
  const map = new Map<number, PiecePlacementInput>();
  for (const piece of pieces.value) map.set(piece.x, piece);
  return map;
});

const selectedPiece = computed(() => (
  selectedSlot.value === null ? null : placedByIndex.value.get(selectedSlot.value) ?? null
));

function selectSlot(slot: number): void {
  selectedSlot.value = slot;
}

function labelOfShape(shape: string): string {
  return palette.value.find((entry) => entry.id === shape)?.label ?? shape;
}

function placedLabel(slot: number): string | null {
  const piece = placedByIndex.value.get(slot);
  return piece ? labelOfShape(piece.shape) : null;
}

function pieceLabel(piece: PiecePlacementInput): string {
  return '第 ' + piece.x + ' 格 · ' + labelOfShape(piece.shape);
}

async function place(entry: PaletteEntry): Promise<void> {
  const slot = selectedSlot.value;
  if (busy.value || slot === null) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: 'repair-' + slot, shape: entry.id, x: slot, y: 0 } },
    });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}

async function remove(): Promise<void> {
  const piece = selectedPiece.value;
  if (busy.value || !piece) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/remove',
      payload: { pieceId: piece.id },
    });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mt-3 flex flex-col gap-3" data-testid="construct-tool">
    <div>
      <p class="text-sm font-bold text-ink">{{ translate('construct.slots') }}</p>
      <div v-if="slots.length > 0" class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="slot in slots"
          :key="slot"
          type="button"
          :data-testid="'construct-slot-' + slot"
          :aria-pressed="selectedSlot === slot"
          :aria-label="translate('construct.slots') + ' ' + slot"
          class="flex h-14 min-w-14 flex-col items-center justify-center rounded-2xl border-2 px-2 text-sm font-black active:scale-95"
          :class="selectedSlot === slot
            ? 'border-blueprint bg-blueprint text-white'
            : placedLabel(slot) ? 'border-teal bg-mint text-teal' : 'border-grid bg-paper text-ink-soft'"
          @click="selectSlot(slot)"
        >
          <span>{{ slot }}</span>
          <span class="text-[11px] font-bold">{{ placedLabel(slot) ?? '·' }}</span>
        </button>
      </div>
      <p v-else class="mt-1 text-xs text-ink-soft">{{ translate('construct.empty') }}</p>
    </div>

    <div>
      <p class="text-sm font-bold text-ink">{{ translate('construct.palette') }}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="entry in palette"
          :key="entry.id"
          type="button"
          :data-testid="'construct-place-' + entry.id"
          :disabled="busy || selectedSlot === null"
          class="min-h-12 min-w-16 rounded-2xl border border-grid bg-card px-4 text-sm font-black text-ink active:scale-95 disabled:opacity-40"
          @click="place(entry)"
        >
          {{ entry.label }}
        </button>
      </div>
      <p v-if="slots.length > 0 && selectedSlot === null" class="mt-1 text-xs text-ink-soft">
        {{ translate('construct.empty') }}
      </p>
    </div>

    <ul v-if="pieces.length > 0" class="flex flex-wrap gap-2">
      <li
        v-for="piece in pieces"
        :key="piece.id"
        class="rounded-full border border-grid bg-paper px-3 py-1 text-xs font-semibold text-ink"
      >
        {{ pieceLabel(piece) }}
      </li>
    </ul>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="construct-remove"
        :disabled="busy || !selectedPiece"
        class="min-h-12 rounded-2xl bg-card px-4 text-sm font-bold text-ink active:scale-95 disabled:opacity-40"
        @click="remove"
      >
        {{ translate('construct.remove') }}
      </button>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
