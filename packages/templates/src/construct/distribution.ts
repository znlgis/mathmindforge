import { z } from 'zod';
import type {
  ArtifactSummary, FailureCause, LevelAction, LevelDetail, LevelRuntime, RuntimeOptions, ToolStateMap, Verdict,
} from '@mmf/game-kit';
import { digest } from '@mmf/toolkit/shared';
import { distributionScriptSchema } from './schema';
import type { DistributionScript } from './schema';
import { createRuntimeWithAdapter } from '../shared/runtime';
import type { AdapterResult, RuntimeAdapter } from '../shared/runtime';
import type { RuntimeVariant } from '../shared/types';

export const distributionArtifactSchema = z.object({
  distribution: z.object({
    containers: z.array(z.object({
      id: z.string(),
      counts: z.record(z.string(), z.number().int().min(0)),
      total: z.number().int().min(0),
    })),
    totals: z.record(z.string(), z.number().int().min(0)),
  }),
});
export type DistributionArtifact = z.infer<typeof distributionArtifactSchema>;

export const FAILURE_CLASSES = [
  'distribution-shortage',
  'distribution-overflow',
  'distribution-unequal',
  'distribution-missing-kind',
  'distribution-empty',
] as const;

const MESSAGE: Record<string, string> = {
  'distribution-shortage': '还有东西没分完，看看哪一类少了。',
  'distribution-overflow': '有盘子/盒子装得太多了。',
  'distribution-unequal': '每个容器分到的数量要一样。',
  'distribution-missing-kind': '每个容器至少要有两种不同的东西。',
  'distribution-empty': '至少先放一件东西。',
};

export function parseScript(input: unknown): DistributionScript {
  return distributionScriptSchema.parse(input);
}

export function applyVariant(script: DistributionScript, variant: RuntimeVariant): DistributionScript {
  return distributionScriptSchema.parse({ ...script, ...(variant.patch ?? {}) });
}

function failure(classId: string, message: string, ref = 'distribution'): Verdict {
  const causes: FailureCause[] = [{ kind: 'constraint', ref, messageKey: message }];
  return { passed: false, stamps: [], failure: { class: classId, causes }, missingEvidence: [], artifacts: [] };
}

export function summarizeArtifact(artifact: unknown): ArtifactSummary[] {
  const raw = artifact as DistributionArtifact | null;
  if (!raw?.distribution) return [];
  const containers = raw.distribution.containers;
  return [{
    id: 'distribution',
    kind: 'placement-set',
    digest: digest(raw.distribution),
    summary: containers.map((container) => container.total).join(' / '),
  }];
}

export function validateArtifact(
  detail: LevelDetail,
  variant: RuntimeVariant,
  artifact: unknown,
): Verdict {
  const script = applyVariant(parseScript(detail.levelScript), variant);
  const raw = artifact as DistributionArtifact | null;
  if (!raw?.distribution) return failure('distribution-empty', MESSAGE['distribution-empty']);
  const containers = raw.distribution.containers;
  const totals: Record<string, number> = {};
  for (const item of script.items) totals[item.id] = 0;
  // 容器里的件数按"本关登记的物品"重新数，不信任产物自报的 total：
  // 否则多写一个未登记物品就能把 minKinds 凑够，或把 total 写小绕过容量上限。
  const countedTotals: number[] = [];
  let any = false;
  for (const container of containers) {
    let counted = 0;
    for (const item of script.items) {
      const count = container.counts[item.id] ?? 0;
      totals[item.id] = (totals[item.id] ?? 0) + count;
      counted += count;
    }
    countedTotals.push(counted);
    any = any || counted > 0;
    if (counted > script.constraints.maxPerContainer) {
      return failure('distribution-overflow', MESSAGE['distribution-overflow'], container.id);
    }
    if (script.constraints.minKinds > 0) {
      const kinds = script.items.filter((item) => (container.counts[item.id] ?? 0) > 0).length;
      if (kinds < script.constraints.minKinds) {
        return failure('distribution-missing-kind', MESSAGE['distribution-missing-kind'], container.id);
      }
    }
  }
  if (!any) return failure('distribution-empty', MESSAGE['distribution-empty']);
  for (const item of script.items) {
    if ((totals[item.id] ?? 0) !== item.count) {
      return failure('distribution-shortage', MESSAGE['distribution-shortage'], item.id);
    }
  }
  if (script.constraints.equalCounts) {
    const target = countedTotals[0] ?? 0;
    if (countedTotals.some((total) => total !== target)) {
      return failure('distribution-unequal', MESSAGE['distribution-unequal']);
    }
  }
  const stamps: Verdict['stamps'] = ['constraint'];
  if (variant.id !== 'base') stamps.push('transfer');
  return { passed: true, stamps, missingEvidence: [], artifacts: summarizeArtifact(artifact) };
}

export function actionsFor(
  _detail: LevelDetail,
  _variant: RuntimeVariant,
  artifact: unknown,
): LevelAction[] {
  const raw = artifact as DistributionArtifact | null;
  const actions: LevelAction[] = [];
  if (raw?.distribution) {
    let n = 0;
    raw.distribution.containers.forEach((container, containerIndex) => {
      for (const [itemId, count] of Object.entries(container.counts)) {
        for (let i = 0; i < count; i += 1) {
          actions.push({
            type: 'construct/place',
            payload: { piece: { id: 'dist-' + n, shape: itemId, x: containerIndex, y: 0 } },
          });
          n += 1;
        }
      }
    });
  }
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_detail: LevelDetail): string[] {
  return [...FAILURE_CLASSES];
}

interface DistState {
  placements: { id: string; containerIndex: number; itemId: string }[];
}

function createDistributionAdapter(script: DistributionScript): RuntimeAdapter<DistState> {
  function countsOf(state: DistState): { containers: { id: string; counts: Record<string, number>; total: number }[]; totals: Record<string, number> } {
    const containers = script.containers.map((container) => ({ id: container.id, counts: {} as Record<string, number>, total: 0 }));
    const totals: Record<string, number> = {};
    for (const item of script.items) totals[item.id] = 0;
    for (const placement of state.placements) {
      const target = containers[placement.containerIndex];
      if (!target) continue;
      target.counts[placement.itemId] = (target.counts[placement.itemId] ?? 0) + 1;
      target.total += 1;
      totals[placement.itemId] = (totals[placement.itemId] ?? 0) + 1;
    }
    return { containers, totals };
  }

  return {
    initialState(): DistState {
      return { placements: [] };
    },
    apply(state, action: LevelAction): AdapterResult<DistState> {
      switch (action.type) {
        case 'construct/place': {
          const piece = action.payload.piece;
          const containerIndex = piece.x;
          const itemId = piece.shape;
          const container = script.containers[containerIndex];
          const item = script.items.find((entry) => entry.id === itemId);
          if (!container || !item) return { state, error: '这个位置或物品不存在。' };
          const current = state.placements.filter((entry) => entry.itemId === itemId).length;
          if (current >= item.count) return { state, error: '这种物品已经分完了。' };
          const containerTotal = state.placements.filter((entry) => entry.containerIndex === containerIndex).length;
          if (containerTotal >= script.constraints.maxPerContainer) {
            return { state, error: '这个容器已经装满了。' };
          }
          return {
            state: {
              placements: [...state.placements, {
                id: piece.id || ('dist-' + state.placements.length),
                containerIndex,
                itemId,
              }],
            },
            evidence: { phase: 'construct', tool: 'construct', action: action.type, metrics: { containerIndex } },
          };
        }
        case 'construct/remove': {
          const id = action.payload.pieceId;
          return {
            state: { placements: state.placements.filter((entry) => entry.id !== id) },
            evidence: { phase: 'construct', tool: 'construct', action: action.type },
          };
        }
        default:
          return { state, error: '这个动作不属于分配关。' };
      }
    },
    artifact(state) {
      if (state.placements.length === 0) return null;
      return { distribution: countsOf(state) };
    },
    artifactSummaries(state) {
      const artifact = { distribution: countsOf(state) };
      return state.placements.length > 0 ? summarizeArtifact(artifact) : [];
    },
    checkpoints(state) {
      const counts = countsOf(state);
      return {
        place: state.placements.length > 0,
        fill: script.items.every((item) => (counts.totals[item.id] ?? 0) === item.count),
      };
    },
    toolState(state): Partial<ToolStateMap> {
      const counts = countsOf(state);
      return {
        construct: {
          pieces: state.placements.map((entry, index) => ({
            id: entry.id,
            shape: entry.itemId,
            x: entry.containerIndex,
            y: index,
          })),
        },
        probe: {
          dataset: {
            id: 'distribution-counts',
            n: state.placements.length,
            values: Object.values(counts.totals),
            counts: counts.totals,
            digest: digest(counts),
          },
        },
      };
    },
    /**
     * 答案填完整 = 每一类物品都分完了（各容器算术之和 == 物品总数）。
     * 是否等量、每盒种类是否够，交给 validate；这里只回答「还有没有剩下的」。
     */
    answerComplete(state) {
      const counts = countsOf(state);
      return script.items.every((item) => (counts.totals[item.id] ?? 0) === item.count);
    },
    validate(detail, variant, artifact) {
      return validateArtifact(detail, variant, artifact);
    },
    actionsFor(detail, variant, artifact) {
      return actionsFor(detail, variant, artifact);
    },
    transferVariants() {
      return [];
    },
  };
}

export function createDistributionRuntime(detail: LevelDetail, opts: RuntimeOptions): LevelRuntime {
  const script = parseScript(detail.levelScript);
  return createRuntimeWithAdapter(detail, opts, createDistributionAdapter(script));
}
