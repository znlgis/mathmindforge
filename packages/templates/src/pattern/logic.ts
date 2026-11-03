import type { PatternToolState, RunSnapshot, Verdict } from '@mmf/game-kit';
import type { PatternRule, PatternWorld } from '@mmf/toolkit/pattern';
import { patternDigest, tokenAt, validatePattern } from '@mmf/toolkit/pattern';
import { patternScriptSchema } from './schema';
import type { PatternScript } from './schema';
export type { PatternScript };

export interface PatternVariant {
  id: string;
  axis: string;
  patch: Record<string, unknown>;
}

/** 预览里一格预测：token 是规则在该位置的答案，纯视觉提示。 */
export interface PatternPreviewCell {
  index: number;
  token: string;
}

/**
 * 「预览一下」的可见产物：规则跑完整条带子的预测。
 * 只住进快照给场景画 ghost，不参与 verdict，也不改 submit 的判定。
 */
export interface PatternPreview {
  cells: PatternPreviewCell[];
  at: number;
  /** 每次预览 +1：画布 signature 里带上它，连点也能重新跑一遍。 */
  seq: number;
  /** 规则指纹：布置新周期后旧预览立即作废，画布不会画过期的 ghost。 */
  ruleKey: string;
}

/**
 * 画布侧的只读视图：game-kit 的 PatternToolState 是公共运行时类型，模板不擅自扩字段，
 * 但快照里确实多带了一个 preview —— 读取侧用结构化子类型窄化，写入侧按子类型赋值。
 */
export type PatternToolStateView = PatternToolState & { preview?: PatternPreview };

/** 规则指纹：tokens 顺序与变换都要算进去，否则换变换后旧预览会被误认成同一条规则。 */
export function patternRuleKey(rule: Pick<PatternRule, 'tokens' | 'transform'>): string {
  return rule.tokens.join('') + ':' + rule.transform;
}

/** 规则对整条带子的预测；长度取 scenario 与 visible 的较大值，和画布上画出的格数一致。 */
export function previewCells(script: PatternScript, rule: PatternRule): PatternPreviewCell[] {
  const length = Math.max(script.scenario.length, script.scenario.visible.length);
  const cells: PatternPreviewCell[] = [];
  for (let index = 0; index < length; index += 1) {
    cells.push({ index, token: tokenAt(rule, index) });
  }
  return cells;
}

/** seq 由 runtime 数出来；preview 的唯一入口在 pattern/preview 的 dispatch 里。 */
export function buildPreview(
  script: PatternScript,
  rule: PatternRule,
  now: number,
  seq: number,
): PatternPreview {
  return { cells: previewCells(script, rule), at: now, seq, ruleKey: patternRuleKey(rule) };
}

export function patternStateOf(snapshot: RunSnapshot): PatternToolStateView | undefined {
  return snapshot.toolState.pattern as PatternToolStateView | undefined;
}

/**
 * 形状族：construct 传进来的 shape 既可能是 token（A/B），也可能是调色板的形状名（round/square）。
 * 放错提示按「族」比较，避免把 A 与 round 之间换个说法就误报。
 */
function shapeFamily(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'a' || normalized === 'round' || normalized === 'circle') return 'circle';
  if (normalized === 'b' || normalized === 'square') return 'square';
  if (normalized === 'c' || normalized === 'triangle') return 'triangle';
  return normalized;
}

/** 两个 token 是否同一个形状族（A 与 round 等价）；预览一致性判定与放错提示共用。 */
export function sameTokenShape(a: string, b: string): boolean {
  return shapeFamily(a) === shapeFamily(b);
}

/**
 * 已提交规律下放错的块：只给画布做即时提示（裂纹/红圈），
 * 不能写进 verdict —— 玩家先放错再改是允许的学习过程。
 */
export function mismatchedPlacements(
  rule: PatternRule | null,
  pieces: ReadonlyMap<number, string>,
): number[] {
  if (!rule) return [];
  const wrong: number[] = [];
  for (const [index, shape] of pieces) {
    const expected = tokenAt(rule, index);
    if (expected === '') continue;
    if (!sameTokenShape(expected, shape)) wrong.push(index);
  }
  return wrong;
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
