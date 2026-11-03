import type { Verdict } from '@mmf/game-kit';
import type { PatternWorld, PatternRule } from '@mmf/toolkit/pattern';
import { patternDigest, validatePattern } from '@mmf/toolkit/pattern';
import { patternScriptSchema } from './schema';
import type { PatternScript } from './schema';
export type { PatternScript };

export interface PatternVariant {
  id: string;
  axis: string;
  patch: Record<string, unknown>;
}

export const FAILURE_CLASSES = [
  'pattern-no-observation',
  'pattern-rule-invalid',
  'pattern-cycle-wrong',
  'pattern-repair-incomplete',
  'pattern-mismatch',
  'pattern-transfer-failed',
] as const;

export function parseScript(input: unknown): PatternScript {
  return patternScriptSchema.parse(input);
}

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (current && value && typeof current === 'object' && typeof value === 'object'
      && !Array.isArray(current) && !Array.isArray(value)) {
      out[key] = mergeRecord(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function applyVariant(script: PatternScript, variant: PatternVariant): PatternScript {
  if (!variant.patch || Object.keys(variant.patch).length === 0) return script;
  const merged = mergeRecord(
    script as unknown as Record<string, unknown>,
    variant.patch,
  );
  return patternScriptSchema.parse(merged);
}

export function toWorld(script: PatternScript): PatternWorld {
  return {
    length: script.scenario.length,
    visible: script.scenario.visible,
    allowedPeriods: script.pattern.allowedPeriods,
    allowedTransforms: script.pattern.allowedTransforms,
  };
}

function summarizeArtifact(artifact: unknown): Verdict['artifacts'] {
  const candidate = artifact as { patternRule?: PatternRule; repair?: unknown[] } | undefined;
  const artifacts: Verdict['artifacts'] = [];
  if (candidate?.patternRule) {
    artifacts.push({
      id: 'pattern-rule',
      kind: 'pattern-rule',
      digest: patternDigest(candidate.patternRule),
      summary: candidate.patternRule.tokens.join('') + ' / ' + candidate.patternRule.transform,
    });
  }
  if (Array.isArray(candidate?.repair) && candidate.repair.length > 0) {
    artifacts.push({
      id: 'repair-set',
      kind: 'repair-set',
      digest: patternDigest(candidate.repair),
      summary: candidate.repair.length + ' 块',
    });
  }
  return artifacts;
}

export function validateArtifact(
  script: PatternScript,
  variant: PatternVariant,
  artifact: unknown,
): Verdict {
  const applied = applyVariant(script, variant);
  const world = toWorld(applied);
  const result = validatePattern(world, artifact);
  const artifacts = summarizeArtifact(artifact);
  if (result.passed) {
    const stamps: Verdict['stamps'] = ['constraint'];
    if (variant.id !== 'base') stamps.push('transfer');
    return { passed: true, stamps, missingEvidence: [], artifacts };
  }

  const failureClass = result.failureClass ?? 'pattern-rule-invalid';
  const causes = [];
  if (result.conflictIndex !== undefined) {
    causes.push({
      kind: 'cell' as const,
      ref: String(result.conflictIndex),
      messageKey: 'level.pattern.cycleWrong.message',
    });
  }
  if (result.missingIndices && result.missingIndices.length > 0) {
    causes.push({
      kind: 'cell' as const,
      ref: result.missingIndices.join(','),
      messageKey: 'level.pattern.incomplete.message',
    });
  }
  if (result.mismatchIndices && result.mismatchIndices.length > 0) {
    causes.push({
      kind: 'cell' as const,
      ref: result.mismatchIndices.join(','),
      messageKey: 'level.pattern.mismatch.message',
    });
  }
  return {
    passed: false,
    stamps: [],
    failure: { class: failureClass, variantId: variant.id, causes },
    missingEvidence: [],
    artifacts,
  };
}

export function actionsFor(
  _script: PatternScript,
  _variant: PatternVariant,
  artifact: unknown,
): import('@mmf/game-kit').LevelAction[] {
  const candidate = artifact as {
    patternRule?: { tokens?: unknown; period?: number; transform?: 'none' | 'mirror' | 'rotate' | 'shift' };
    repair?: { index: number; token: string }[];
  } | null;
  // 产物缺失时给空动作表，交给 autoplay 统一报“还没有黄金解”，而不是在这里抛异常。
  if (!candidate?.patternRule || !Array.isArray(candidate.patternRule.tokens)) return [];
  const rule = candidate.patternRule as { tokens: string[]; period: number; transform: 'none' | 'mirror' | 'rotate' | 'shift' };
  const repair = Array.isArray(candidate.repair) ? candidate.repair : [];
  const actions: import('@mmf/game-kit').LevelAction[] = [
    { type: 'pattern/inspect', payload: { index: 0 } },
    { type: 'pattern/inspect', payload: { index: 1 } },
    { type: 'pattern/inspect', payload: { index: 2 } },
    { type: 'pattern/setCycle', payload: { cycle: rule.tokens, transform: rule.transform } },
    { type: 'pattern/commit', payload: {} },
  ];
  for (const item of repair) {
    actions.push({
      type: 'construct/place',
      payload: {
        piece: {
          id: 'repair-' + item.index,
          shape: item.token,
          x: item.index,
          y: 0,
        },
      },
    });
  }
  actions.push({ type: 'run', payload: {} });
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_script: PatternScript): string[] {
  return [...FAILURE_CLASSES];
}
