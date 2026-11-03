import { z } from 'zod';

/** 课表关：给每个课次选一个时段，检查老师/班级/教室冲突与偏好。 */
export const scheduleScriptSchema = z.object({
  mode: z.literal('schedule'),
  slots: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2).max(8),
  lessons: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    teacher: z.string().min(1),
    className: z.string().min(1),
    room: z.string().min(1),
    preferredSlot: z.string().min(1).optional(),
  })).min(2).max(12),
  maxPerSlot: z.number().int().min(1).max(6),
  softBonus: z.number().int().min(1).max(5).default(1),
  targetBonus: z.number().int().min(1).max(20),
});
export type ScheduleScript = z.infer<typeof scheduleScriptSchema>;

export interface ScheduleArtifact {
  placements: { lesson: string; slot: string }[];
}

export interface ScheduleConflict {
  kind: 'teacher' | 'class' | 'room' | 'slot' | 'unknown';
  slot: string;
  a: string;
  b: string;
}

export interface ScheduleValidation {
  passed: boolean;
  failures: string[];
  conflicts: ScheduleConflict[];
  bonus: number;
  metrics: Record<string, number>;
}

export function placementMap(artifact: unknown): Map<string, string> {
  const raw = artifact as ScheduleArtifact | null;
  const map = new Map<string, string>();
  for (const item of raw?.placements ?? []) {
    if (typeof item?.lesson === 'string' && typeof item?.slot === 'string') {
      map.set(item.lesson, item.slot);
    }
  }
  return map;
}

export function validateScheduleArtifact(script: ScheduleScript, artifact: unknown): ScheduleValidation {
  const map = placementMap(artifact);
  const conflicts: ScheduleConflict[] = [];
  const metrics: Record<string, number> = { placed: map.size };
  if (map.size === 0) {
    return { passed: false, failures: ['schedule-empty'], conflicts, bonus: 0, metrics };
  }
  if (map.size !== script.lessons.length) {
    return { passed: false, failures: ['schedule-incomplete'], conflicts, bonus: 0, metrics };
  }

  const lessons = new Map(script.lessons.map((lesson) => [lesson.id, lesson]));
  const bySlot = new Map<string, string[]>();
  for (const [lessonId, slot] of map) {
    if (!lessons.has(lessonId)) {
      conflicts.push({ kind: 'unknown', slot, a: lessonId, b: lessonId });
      continue;
    }
    const list = bySlot.get(slot) ?? [];
    list.push(lessonId);
    bySlot.set(slot, list);
  }
  if (conflicts.length > 0) {
    return { passed: false, failures: ['schedule-unknown'], conflicts, bonus: 0, metrics };
  }

  for (const [slot, ids] of bySlot) {
    if (ids.length > script.maxPerSlot) {
      conflicts.push({ kind: 'slot', slot, a: ids[0] ?? '', b: ids[1] ?? '' });
      continue;
    }
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = lessons.get(ids[i] as string);
        const b = lessons.get(ids[j] as string);
        if (!a || !b) continue;
        if (a.teacher === b.teacher) conflicts.push({ kind: 'teacher', slot, a: a.id, b: b.id });
        if (a.className === b.className) conflicts.push({ kind: 'class', slot, a: a.id, b: b.id });
        if (a.room === b.room) conflicts.push({ kind: 'room', slot, a: a.id, b: b.id });
      }
    }
  }

  let bonus = 0;
  for (const lesson of script.lessons) {
    if (lesson.preferredSlot && map.get(lesson.id) === lesson.preferredSlot) bonus += script.softBonus;
  }
  metrics.bonus = bonus;
  if (conflicts.length > 0) {
    return { passed: false, failures: ['schedule-conflict'], conflicts, bonus, metrics };
  }
  if (bonus < script.targetBonus) {
    return { passed: false, failures: ['schedule-bonus'], conflicts, bonus, metrics };
  }
  return { passed: true, failures: [], conflicts, bonus, metrics };
}
