import type {
  ArtifactSummary, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import { scheduleScriptSchema, validateScheduleArtifact } from './schedule';
import type { ScheduleScript } from './schedule';

interface ScheduleState {
  placements: Map<string, string>;
}

function createScheduleAdapter(script: ScheduleScript): RuntimeAdapter<ScheduleState> {
  function artifactOf(state: ScheduleState): unknown | null {
    if (state.placements.size === 0) return null;
    return {
      placements: [...state.placements.entries()].map(([lesson, slot]) => ({ lesson, slot })),
    };
  }

  return {
    initialState(): ScheduleState {
      return { placements: new Map() };
    },
    apply(state, action: LevelAction): AdapterResult<ScheduleState> {
      if (action.type === 'construct/place') {
        const piece = action.payload.piece;
        const lesson = script.lessons.find((entry) => entry.id === piece.shape);
        const slot = script.slots[piece.x];
        if (!lesson || !slot) return { state, error: '这个课次或时段不存在。' };
        const next = new Map(state.placements);
        next.set(lesson.id, slot.id);
        return {
          state: { placements: next },
          evidence: {
            phase: 'construct',
            tool: 'construct',
            action: action.type,
            metrics: { placed: next.size },
          },
        };
      }
      if (action.type === 'construct/remove') {
        const lessonId = action.payload.pieceId;
        if (!state.placements.has(lessonId)) return { state, error: '这个课次还没排。' };
        const next = new Map(state.placements);
        next.delete(lessonId);
        return {
          state: { placements: next },
          evidence: { phase: 'construct', tool: 'construct', action: action.type },
        };
      }
      return { state, error: '这个动作不属于课表关。' };
    },
    artifact: artifactOf,
    artifactSummaries(state): ArtifactSummary[] {
      if (state.placements.size === 0) return [];
      return [{
        id: 'schedule',
        kind: 'placement-set',
        digest: digest([...state.placements.entries()].sort()),
        summary: state.placements.size + ' 个课次已排',
      }];
    },
    checkpoints(state) {
      return {
        place: state.placements.size > 0,
        complete: state.placements.size === script.lessons.length,
        conflictFree: state.placements.size === script.lessons.length
          && validateScheduleArtifact(script, artifactOf(state)).conflicts.length === 0,
      };
    },
    toolState(state): Partial<ToolStateMap> {
      return {
        construct: {
          pieces: [...state.placements.entries()].map(([lesson, slot], index) => ({
            id: lesson,
            shape: lesson,
            x: script.slots.findIndex((entry) => entry.id === slot),
            y: index,
          })),
        },
      };
    },
    /** 答案填完整 = 每个课次都排进了某个时段；冲不冲突交给 validate。 */
    answerComplete(state: ScheduleState): boolean {
      return state.placements.size === script.lessons.length;
    },
    validate(_detail, variant, artifact) {
      const result = validateScheduleArtifact(script, artifact);
      if (result.passed) {
        return {
          passed: true,
          stamps: variant.id === 'base' ? ['constraint'] : ['constraint', 'transfer'],
          missingEvidence: [],
          artifacts: [],
          metrics: result.metrics,
        };
      }
      return {
        passed: false,
        stamps: [],
        failure: {
          class: result.failures[0] ?? 'schedule-empty',
          variantId: variant.id,
          causes: [
            ...result.conflicts.slice(0, 2).map((conflict) => ({
              kind: 'constraint' as const,
              ref: conflict.slot,
              messageKey: conflict.kind + ' 冲突：' + conflict.a + ' / ' + conflict.b,
            })),
            ...(result.conflicts.length === 0
              ? [{ kind: 'constraint' as const, ref: 'schedule', messageKey: '课表还没有满足全部约束。' }]
              : []),
          ],
        },
        missingEvidence: [],
        artifacts: [],
        metrics: result.metrics,
      };
    },
    actionsFor(_detail, _variant, artifact) {
      const raw = artifact as { placements?: { lesson: string; slot: string }[] } | null;
      const actions: LevelAction[] = [];
      for (const placement of raw?.placements ?? []) {
        const slotIndex = script.slots.findIndex((slot) => slot.id === placement.slot);
        if (slotIndex < 0) continue;
        actions.push({
          type: 'construct/place',
          payload: { piece: { id: placement.lesson, shape: placement.lesson, x: slotIndex, y: 0 } },
        });
      }
      actions.push({ type: 'submit', payload: {} });
      return actions;
    },
    transferVariants() {
      return [];
    },
  };
}

export function createScheduleRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = scheduleScriptSchema.parse(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createScheduleAdapter(script));
}
