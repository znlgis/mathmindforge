<script setup lang="ts">
import type { LevelRuntime, RunSnapshot } from '@mmf/game-kit';
import type { Translator } from '@mmf/i18n';
import { computed, ref } from 'vue';

type LevelDetailLike = LevelRuntime['detail'];
type ToolSpecLike = LevelDetailLike['tools'][number];
type ConstructSpec = Extract<ToolSpecLike, { kind: 'construct' }>;

interface ScheduleScriptView {
  slots?: { id: string; label: string }[];
  lessons?: { id: string; label: string; teacher: string; className: string; room: string; preferredSlot?: string }[];
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
const placement = computed(() => {
  const map = new Map<string, string>();
  for (const piece of props.snapshot.toolState.construct?.pieces ?? []) {
    const slot = slots.value[piece.x];
    if (slot) map.set(piece.shape, slot.id);
  }
  return map;
});
const busy = ref(false);
const error = ref<string | null>(null);

function slotOf(lessonId: string): string {
  return placement.value.get(lessonId) ?? '';
}

async function assign(lessonId: string, slotId: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const index = slots.value.findIndex((slot) => slot.id === slotId);
    if (index < 0) return;
    const result = await props.runtime.dispatch({
      type: 'construct/place',
      payload: { piece: { id: lessonId, shape: lessonId, x: index, y: 0 } },
    });
    if (!result.ok) error.value = result.message ?? null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section data-testid="schedule-tool" class="mt-3 flex flex-col gap-3">
    <p class="text-xs text-ink-soft">给每个课次选一个时段；同一时段的老师、班级、教室不能撞。</p>
    <div class="flex flex-col gap-2">
      <article
        v-for="lesson in lessons"
        :key="lesson.id"
        class="rounded-2xl border border-grid bg-paper p-3"
        :data-testid="'schedule-lesson-' + lesson.id"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-bold text-ink">{{ lesson.label }}</p>
            <p class="text-[11px] text-ink-soft">{{ lesson.teacher }} · {{ lesson.className }} · {{ lesson.room }}</p>
          </div>
          <select
            :data-testid="'schedule-select-' + lesson.id"
            class="min-h-10 rounded-xl border border-grid bg-card px-2 text-xs font-semibold"
            :value="slotOf(lesson.id)"
            @change="assign(lesson.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">未排</option>
            <option v-for="slot in slots" :key="slot.id" :value="slot.id">{{ slot.label }}</option>
          </select>
        </div>
      </article>
    </div>
    <p class="text-[11px] text-ink-soft">偏好：数学第一节、物理第二节；至少满足 2 条。</p>
    <p v-if="error" class="text-xs font-bold text-red">{{ error }}</p>
  </section>
</template>
