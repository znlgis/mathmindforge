import type { LevelDetail, PatternToolState, RunSnapshot, Verdict } from '@mmf/game-kit';
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

/** 候选规律：只由带子上可见的格子推出，供工具面板「一键候选」与 repair-only 校验共用。 */
export function candidateRules(
  script: PatternScript,
  transforms: ReadonlyArray<PatternRule['transform']> = script.pattern.allowedTransforms,
): PatternRule[] {
  const visible = script.scenario.visible;
  const length = Math.max(script.scenario.length, visible.length);
  const candidates: PatternRule[] = [];
  for (const period of script.pattern.allowedPeriods) {
    if (period < 2 || period > length) continue;
    const tokens: string[] = [];
    let complete = true;
    for (let index = 0; index < period; index += 1) {
      const token = visible[index];
      if (token === null || token === undefined) {
        complete = false;
        break;
      }
      tokens.push(token);
    }
    // 周期里本身有空格时，这条规则不是从观察推出来的：不参与候选，也不参与只填判定。
    if (!complete) continue;
    for (const transform of transforms) {
      const rule: PatternRule = { tokens: [...tokens], period, transform };
      if (!explainsVisible(rule, visible, length)) continue;
      if (!candidates.some((item) => patternRuleKey(item) === patternRuleKey(rule))) {
        candidates.push(rule);
      }
    }
  }
  return candidates;
}

function explainsVisible(rule: PatternRule, visible: readonly (string | null)[], length: number): boolean {
  for (let index = 0; index < length; index += 1) {
    const token = visible[index];
    if (token === null || token === undefined) continue;
    if (tokenAt(rule, index) !== token) return false;
  }
  return true;
}

/** 从任意 JSON 里读出维修格（越界/非整数/空 token 一律忽略），repair-only 校验读它。 */
function readRepairMap(repair: unknown, length: number): Map<number, string> {
  const map = new Map<number, string>();
  if (!Array.isArray(repair)) return map;
  for (const item of repair) {
    if (!item || typeof item !== 'object') continue;
    const { index, token } = item as { index?: unknown; token?: unknown };
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= length) continue;
    if (typeof token !== 'string' || token.length === 0) continue;
    map.set(index, token);
  }
  return map;
}

/**
 * 「只填不声明」：没有 patternRule 时，用可见格推出的候选规律检验补的块。
 * 判据和带规律的判法同源：填法必须能被本关允许的某条规律完整解释，
 * 所以它不是放宽判定，而是允许玩家把「声明」省掉。
 */
export function validateRepairOnly(script: PatternScript, repair: unknown): {
  passed: boolean;
  rule?: PatternRule;
  failureClass?: string;
  missingIndices?: number[];
  mismatchIndices?: number[];
} {
  const world = toWorld(script);
  const length = world.length;
  const repairs = readRepairMap(repair, length);
  const missing: number[] = [];
  for (let index = 0; index < length; index += 1) {
    if (world.visible[index] !== null && world.visible[index] !== undefined) continue;
    if (!repairs.has(index)) missing.push(index);
  }
  if (missing.length > 0) {
    return { passed: false, failureClass: 'pattern-repair-incomplete', missingIndices: missing };
  }

  let best: { mismatch: number[] } | null = null;
  for (const rule of candidateRules(script)) {
    const mismatch: number[] = [];
    for (const [index, token] of repairs) {
      if (tokenAt(rule, index) !== token) mismatch.push(index);
    }
    if (mismatch.length === 0) return { passed: true, rule };
    if (!best || mismatch.length < best.mismatch.length) best = { mismatch };
  }
  if (best) {
    return {
      passed: false,
      failureClass: 'pattern-mismatch',
      mismatchIndices: [...best.mismatch].sort((a, b) => a - b),
    };
  }
  // 带子的可见部分推不出任何合法规律：按「规则和带子对不上」报，别退化成空判定。
  return { passed: false, failureClass: 'pattern-cycle-wrong' };
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
 * 画布点击一个空格时的落子字母（一次点击 = 一次输入）：
 * - 还没填过：在规律预测的字母上开始（没有规律就从循环表的第一个字母起，即「照这样做」）；
 * - 已经填过：换循环表里的下一个字母，点几次换几次。
 */
export function nextFillToken(
  order: readonly string[],
  current: string | undefined,
  predicted: string,
): string {
  if (current === undefined) {
    if (predicted.length > 0 && order.includes(predicted)) return predicted;
    return order[0] ?? predicted;
  }
  const index = order.indexOf(current);
  if (index < 0) return order[0] ?? current;
  return order[(index + 1) % order.length] ?? current;
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

/** 换表征映射：token(原字母) → 新符号（形状名/颜色名等）。 */
export type PatternSymbolMap = Record<string, string>;

/**
 * 从变体 patch 里读换表征映射（`{ scenario: { symbols: { A: 'round', ... } } }`）。
 * 这是 pattern 唯一的真迁移门：同一抽象规律换个表示（颜色→形状、字母→颜色）之后仍要成立。
 */
export function symbolsOf(variant: PatternVariant): PatternSymbolMap {
  const patch = variant?.patch as { scenario?: { symbols?: Record<string, unknown> } } | null | undefined;
  const raw = patch?.scenario?.symbols;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const symbols: PatternSymbolMap = {};
  for (const [from, to] of Object.entries(raw)) {
    if (typeof to === 'string' && to.length > 0) symbols[from] = to;
  }
  return symbols;
}

/** 把带子上的 token 按映射改名；映射里没有的 token 原样保留，不静默丢信息。 */
export function relabelVisible(
  visible: readonly (string | null)[],
  symbols: PatternSymbolMap,
): (string | null)[] {
  if (Object.keys(symbols).length === 0) return [...visible];
  return visible.map((token) => (
    token === null || token === undefined ? null : (symbols[token] ?? token)
  ));
}

/**
 * 世界视图。传 symbols 时返回换表征后的可见格——迁移门和 repair-only 校验共用同一份换算。
 */
export function toWorld(script: PatternScript, symbols: PatternSymbolMap = {}): PatternWorld {
  return {
    length: script.scenario.length,
    visible: relabelVisible(script.scenario.visible, symbols),
    allowedPeriods: script.pattern.allowedPeriods,
    allowedTransforms: script.pattern.allowedTransforms,
  };
}

/** 把产物里的 token（规律与补块）换到新表征：玩家提交时用原始字母，迁移门里再换算比对。 */
export function relabelArtifact(artifact: unknown, symbols: PatternSymbolMap): unknown {
  if (Object.keys(symbols).length === 0) return artifact;
  if (!artifact || typeof artifact !== 'object') return artifact;
  const raw = artifact as {
    patternRule?: { tokens?: unknown };
    repair?: unknown;
  };
  const relabelToken = (token: unknown): unknown => (
    typeof token === 'string' ? (symbols[token] ?? token) : token
  );
  const next: { patternRule?: unknown; repair?: unknown } = { ...raw };
  if (raw.patternRule && typeof raw.patternRule === 'object') {
    const rule = raw.patternRule as { tokens?: unknown };
    if (Array.isArray(rule.tokens)) {
      next.patternRule = { ...rule, tokens: rule.tokens.map(relabelToken) };
    }
  }
  if (Array.isArray(raw.repair)) {
    next.repair = raw.repair.map((item) => (
      item && typeof item === 'object'
        ? { ...item, token: relabelToken((item as { token?: unknown }).token) }
        : item
    ));
  }
  return next;
}

/**
 * 迁移门：内容里所有带 `scenario.symbols` 的变体都是换表征变体，逐条要过。
 * 返回空数组表示这一关没有迁移门（template verifier 的可选约定）。
 */
export function transferVariants(detail: LevelDetail): PatternVariant[] {
  const variants = Array.isArray(detail.variants) ? detail.variants : [];
  return variants
    .filter((variant) => Object.keys(symbolsOf(variant)).length > 0)
    .map((variant) => ({ id: variant.id, axis: variant.axis, patch: { ...variant.patch } }));
}

export function transferFailureClass(_detail?: LevelDetail): string {
  return 'pattern-transfer-failed';
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
  const symbols = symbolsOf(variant);
  const relabeled = Object.keys(symbols).length > 0;
  const world = toWorld(applied, symbols);
  const artifacts = summarizeArtifact(artifact);
  const candidate = artifact as { patternRule?: { tokens?: unknown }; repair?: unknown } | null | undefined;
  const hasRule = Boolean(candidate?.patternRule && Array.isArray(candidate.patternRule.tokens));
  const hasRepair = Array.isArray(candidate?.repair);
  // 既没声明规律、也没补块：这是"空产物"，要报明确的结构失败类（A1b），不能走缺证据分支。
  if (!hasRule && !hasRepair) {
    return {
      passed: false,
      stamps: [],
      failure: { class: 'pattern-rule-invalid', variantId: variant.id, causes: [] },
      missingEvidence: [],
      artifacts,
    };
  }
  // 迁移门只认「随映射走」的产物：只填不声明的 repair-only 是把答案抄在旧表征上（空壳），
  // 换个表示以后没有规律可翻译，必须报 pattern-transfer-failed，而不是悄悄当成通过。
  if (relabeled && !hasRule) {
    return {
      passed: false,
      stamps: [],
      failure: {
        class: 'pattern-transfer-failed',
        variantId: variant.id,
        causes: [{ kind: 'variant', ref: variant.id, messageKey: 'level.pattern.transfer.message' }],
      },
      missingEvidence: [],
      artifacts,
    };
  }
  // 有 patternRule 走原判定；只有 repair 时按「只填不声明」用可见格推出来的候选规律校验，
  // 绝不返回「既无 failure 也无 missingEvidence」的空判决（docs/12 §T1-pattern 的坑）。
  const translated = relabeled ? relabelArtifact(artifact, symbols) : artifact;
  const result: {
    passed: boolean;
    failureClass?: string;
    conflictIndex?: number;
    missingIndices?: number[];
    mismatchIndices?: number[];
  } = hasRule
    ? validatePattern(world, translated)
    : validateRepairOnly(applied, candidate?.repair);
  if (result.passed) {
    const stamps: Verdict['stamps'] = ['constraint'];
    if (variant.id !== 'base') stamps.push('transfer');
    return { passed: true, stamps, missingEvidence: [], artifacts };
  }

  const failureClass = relabeled ? 'pattern-transfer-failed' : (result.failureClass ?? 'pattern-rule-invalid');
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
  script: PatternScript,
  _variant: PatternVariant,
  artifact: unknown,
): import('@mmf/game-kit').LevelAction[] {
  const candidate = artifact as {
    patternRule?: { tokens?: unknown; period?: number; transform?: PatternRule['transform'] };
    repair?: { index: number; token: string }[];
  } | null;
  const repair = Array.isArray(candidate?.repair) ? candidate.repair : [];
  const tokens = Array.isArray(candidate?.patternRule?.tokens) ? candidate.patternRule.tokens : null;
  const actions: import('@mmf/game-kit').LevelAction[] = [];
  if (tokens && tokens.every((token): token is string => typeof token === 'string')) {
    actions.push({
      type: 'pattern/setCycle',
      payload: { cycle: [...tokens], transform: candidate?.patternRule?.transform ?? 'none' },
    });
    actions.push({ type: 'pattern/commit', payload: {} });
  } else {
    // 产物缺失时给空动作表，交给 autoplay 统一报“还没有黄金解”，而不是在这里抛异常。
    if (repair.length === 0) return [];
    // 只填不声明：先点一下面板上的「候选规律」条（和玩家点候选 chip 是同一个动作），再逐格补。
    const derived = candidateRules(script).find((rule) => (
      repair.every((item) => tokenAt(rule, item.index) === item.token)
    ));
    if (derived) {
      actions.push({
        type: 'pattern/setCycle',
        payload: { cycle: [...derived.tokens], transform: derived.transform },
      });
    }
  }
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
  actions.push({ type: 'submit', payload: {} });
  return actions;
}

export function reachableFailureClasses(_script: PatternScript): string[] {
  return [...FAILURE_CLASSES];
}
