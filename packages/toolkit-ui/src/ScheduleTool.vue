<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface ScheduleSlotView {
  id: string;
  label: string;
}
interface ScheduleLessonView {
  id: string;
  label: string;
  teacher: string;
  className: string;
  room: string;
  preferredSlot?: string;
}
interface ScheduleScriptView {
  slots?: ScheduleSlotView[];
  lessons?: ScheduleLessonView[];
  maxPerSlot?: number;
  softBonus?: number;
  targetBonus?: number;
}

const props = defineProps<{
  spec: ConstructSpec;
  runtime: LevelRuntime;
  snapshot: RunSnapshot;
  detail: LevelDetailLike;
  t: Translator;
}>();

const script = computed<ScheduleScriptView>(() => (props.detail.levelScript ?? {}) as ScheduleScriptView);
const slots = computed(() => script.value.slots ?? []);
const lessons = computed(() => script.value.lessons ?? []);
const maxPerSlot = computed(() => script.value.maxPerSlot ?? slots.value.length);
const targetBonus = computed(() => script.value.targetBonus ?? 0);
const busy = ref(false);
const error = ref<string | null>(null);

const placement = computed(() => {
  const map = new Map<string, string>();
  for (const piece of props.snapshot.toolState.construct?.pieces ?? []) {
    const slot = slots.value[piece.x];
    if (slot) map.set(piece.shape, slot.id);
  }
  return map;
});

const lessonById = computed(() => new Map(lessons.value.map((lesson) => [lesson.id, lesson])));

function slotOf(lessonId: string): string {
  return placement.value.get(lessonId) ?? '';
}

function slotLabel(slotId: string): string {
  return slots.value.find((slot) => slot.id === slotId)?.label ?? slotId;
}

const placedPerSlot = computed(() => {
  const map = new Map<string, number>();
  for (const slot of slots.value) {
    map.set(slot.id, 0);
  }
  for (const lesson of lessons.value) {
    const slotId = slotOf(lesson.id);
    if (slotId.length > 0) map.set(slotId, (map.get(slotId) ?? 0) + 1);
  }
  return map;
});

/** 同一时段里的老师/班级/教室冲突：实时红框，不用等提交。 */
const conflicts = computed(() => {
  const out: { slotId: string; kinds: string[]; lessons: string[] }[] = [];
  for (const slot of slots.value) {
    const ids = lessons.value.filter((lesson) => slotOf(lesson.id) === slot.id).map((lesson) => lesson.id);
    if (ids.length === 0) continue;
    const kinds: string[] = [];
    if (ids.length > maxPerSlot.value) kinds.push('同一时段超过 ' + maxPerSlot.value + ' 门课');
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = lessonById.value.get(ids[i] as string);
        const b = lessonById.value.get(ids[j] as string);
        if (!a || !b) continue;
        if (a.teacher === b.teacher) kinds.push('老师 ' + a.teacher);
        if (a.className === b.className) kinds.push('班级 ' + a.className);
        if (a.room === b.room) kinds.push('教室 ' + a.room);
      }
    }
    if (kinds.length > 0) out.push({ slotId: slot.id, kinds: [...new Set(kinds)], lessons: ids });
  }
  return out;
});

const conflictedCells = computed(() => {
  const cells = new Set<string>();
  for (const conflict of conflicts.value) {
    for (const lessonId of conflict.lessons) cells.add(lessonId + '|' + conflict.slotId);
  }
  return cells;
});

/** 偏好计数：带 ★ 的课次排进它偏好的时段就得 1 分。 */
const bonus = computed(() => {
  let value = 0;
  for (const lesson of lessons.value) {
    if (lesson.preferredSlot && slotOf(lesson.id) === lesson.preferredSlot) value += script.value.softBonus ?? 1;
  }
  return value;
});

const conflictCount = computed(() => conflicts.value.length);

function isPlaced(lessonId: string, slotId: string): boolean {
  return slotOf(lessonId) === slotId;
}

function cellClass(lesson: ScheduleLessonView, slot: ScheduleSlotView): string {
  if (conflictedCells.value.has(lesson.id + '|' + slot.id)) return 'border-red bg-red/10 text-red';
  if (isPlaced(lesson.id, slot.id)) return 'border-teal bg-mint text-teal';
  if (lesson.preferredSlot === slot.id) return 'border-dashed border-brass bg-paper text-brass';
  return 'border-grid bg-paper text-ink-soft';
}

async function place(lessonId: string, slotId: string): Promise<void> {
  if (busy.value) return;
  const index = slots.value.findIndex((slot) => slot.id === slotId);
  if (index < 0) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: lessonId, shape: lessonId, x: index, y: 0 } },
    });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function remove(lessonId: string): Promise<void> {
  if (busy.value) return;
  if (!placement.value.has(lessonId)) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await props.runtime.dispatch({ type: 'construct/remove', payload: { pieceId: lessonId } });
    if (!result.ok) error.value = result.message ? props.t.t(result.message) : null;
  } finally {
    busy.value = false;
  }
}

async function toggleCell(lesson: ScheduleLessonView, slot: ScheduleSlotView): Promise<void> {
  if (isPlaced(lesson.id, slot.id)) {
    await remove(lesson.id);
    return;
  }
  await place(lesson.id, slot.id);
}

/** 隐藏原生下拉（旧 e2e 的 selectOption 兼容路径）：玩家看不到，也不影响点击计数。 */
async function onSelect(lessonId: string, event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement | null)?.value ?? '';
  if (value.length === 0) {
    await remove(lessonId);
    return;
  }
  await place(lessonId, value);
}
</script>

<template>
  <section data-testid="schedule-tool" class="mt-3 flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold">
      <span data-testid="schedule-bonus" :class="bonus >= targetBonus ? 'text-teal' : 'text-ink-soft'">
        偏好 {{ bonus }}/{{ targetBonus }}
      </span>
      <span data-testid="schedule-conflicts" :class="conflictCount === 0 ? 'text-teal' : 'text-red'">
        冲突 {{ conflictCount }}
      </span>
      <span class="text-ink-soft">点格子放课，再点同一格拿回；★ 是这间课室偏好的时段</span>
    </div>

    <div class="overflow-x-auto">
      <div
        class="grid min-w-[28rem] gap-1"
        :style="{ gridTemplateColumns: 'minmax(6.5rem, 1.4fr) repeat(' + slots.length + ', minmax(4.2rem, 1fr))' }"
      >
        <div />
        <div
          v-for="slot in slots"
          :key="'head-' + slot.id"
          class="flex flex-col items-center justify-center rounded-xl bg-paper px-1 py-1 text-center"
        >
          <span class="text-[11px] font-bold text-ink">{{ slot.label }}</span>
          <span class="text-[10px] text-ink-soft">{{ placedPerSlot.get(slot.id) ?? 0 }}/{{ maxPerSlot }}</span>
        </div>

        <template v-for="lesson in lessons" :key="'row-' + lesson.id">
          <div class="flex flex-col justify-center rounded-xl bg-paper px-2 py-1">
            <span class="text-xs font-bold text-ink">
              {{ lesson.label }}
              <span v-if="lesson.preferredSlot" class="text-brass">★</span>
            </span>
            <span class="text-[10px] text-ink-soft">{{ lesson.teacher }} · {{ lesson.className }} · {{ lesson.room }}</span>
          </div>
          <button
            v-for="slot in slots"
            :key="'cell-' + lesson.id + '-' + slot.id"
            type="button"
            :data-testid="'schedule-cell-' + lesson.id + '-' + slot.id"
            :aria-pressed="isPlaced(lesson.id, slot.id)"
            :aria-label="'把' + lesson.label + '放到' + slot.label"
            :disabled="busy"
            class="min-h-11 rounded-xl border-2 text-xs font-bold active:scale-95 disabled:opacity-50"
            :class="cellClass(lesson, slot)"
            @click="toggleCell(lesson, slot)"
          >
            <span v-if="isPlaced(lesson.id, slot.id)">{{ lesson.label }}</span>
            <span v-else-if="lesson.preferredSlot === slot.id" class="text-brass">★</span>
            <span v-else class="text-ink-soft">·</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="conflicts.length > 0" class="rounded-2xl border border-red/40 bg-red/10 p-2 text-[11px] font-semibold text-red">
      <p v-for="conflict in conflicts" :key="'conflict-' + conflict.slotId">
        {{ slotLabel(conflict.slotId) }}：{{ conflict.kinds.join('、') }}
      </p>
    </div>

    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>

    <!-- 旧 e2e 的 schedule-select-* 兼容路径：sr-only 的原生下拉，selectOption 仍可用。 -->
    <select
      v-for="lesson in lessons"
      :key="'select-' + lesson.id"
      class="sr-only"
      :data-testid="'schedule-select-' + lesson.id"
      :value="slotOf(lesson.id)"
      :aria-label="'给' + lesson.label + '选时段'"
      @change="onSelect(lesson.id, $event)"
    >
      <option value="">未排</option>
      <option v-for="slot in slots" :key="slot.id" :value="slot.id">{{ slot.label }}</option>
    </select>
  </section>
</template>
