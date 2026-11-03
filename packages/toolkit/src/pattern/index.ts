import { digest } from '../shared/rng';

export type PatternTransform = 'none' | 'mirror' | 'rotate' | 'shift' | 'reflect';

export interface PatternRule {
  tokens: string[];
  period: number;
  transform: PatternTransform;
}

export interface PatternWorld {
  length: number;
  visible: Array<string | null>;
  allowedPeriods: number[];
  allowedTransforms: PatternTransform[];
}

export interface PatternRepair {
  index: number;
  token: string;
}

export interface PatternArtifact {
  patternRule: PatternRule;
  repair: PatternRepair[];
}

export type PatternFailureClass =
  | 'pattern-rule-invalid'
  | 'pattern-cycle-wrong'
  | 'pattern-repair-incomplete'
  | 'pattern-mismatch'
  | 'pattern-transfer-failed';

export interface PatternValidation {
  passed: boolean;
  failureClass?: PatternFailureClass;
  conflictIndex?: number;
  missingIndices?: number[];
  mismatchIndices?: number[];
}

const TRANSFORMS: PatternTransform[] = ['none', 'mirror', 'rotate', 'shift', 'reflect'];

export function isPatternTransform(value: unknown): value is PatternTransform {
  return typeof value === 'string' && (TRANSFORMS as string[]).includes(value);
}

/** 规则在第 index 位应该生成的 token。index 从 0 开始。 */
export function tokenAt(rule: PatternRule, index: number): string {
  const period = rule.period > 0 ? rule.period : rule.tokens.length;
  if (rule.transform === 'reflect') {
    const cycle = period * 2;
    const position = ((index % cycle) + cycle) % cycle;
    return rule.tokens[position < period ? position : cycle - 1 - position] ?? '';
  }
  const i = ((index % period) + period) % period;
  switch (rule.transform) {
    case 'mirror':
      return rule.tokens[(period - 1 - i) % period] ?? '';
    case 'rotate':
      return rule.tokens[(i + 1) % period] ?? '';
    case 'shift':
      return rule.tokens[(i + period - 1) % period] ?? '';
    case 'none':
    default:
      return rule.tokens[i] ?? '';
  }
}

/** 校验规则本身是否落在关卡允许的范围内。 */
export function validateRule(world: PatternWorld, rule: PatternRule): PatternFailureClass | null {
  if (!Array.isArray(rule.tokens) || rule.tokens.length < 2 || rule.tokens.length > 6) {
    return 'pattern-rule-invalid';
  }
  if (rule.period !== rule.tokens.length) return 'pattern-rule-invalid';
  if (!world.allowedPeriods.includes(rule.period)) return 'pattern-rule-invalid';
  if (!isPatternTransform(rule.transform)) return 'pattern-rule-invalid';
  if (!world.allowedTransforms.includes(rule.transform)) return 'pattern-rule-invalid';
  return null;
}

/**
 * 纯校验：不依赖动作回放，审计、编辑器、多解判定共用。
 * 1) 规则是否合法；2) 规则是否与可见格冲突；3) 缺口是否补齐；4) 补的块是否与规则一致。
 */
export function validatePattern(world: PatternWorld, artifact: unknown): PatternValidation {
  if (!artifact || typeof artifact !== 'object') {
    return { passed: false, failureClass: 'pattern-rule-invalid' };
  }
  const candidate = artifact as Partial<PatternArtifact>;
  const rule = candidate.patternRule;
  if (!rule || !Array.isArray(rule.tokens)) {
    return { passed: false, failureClass: 'pattern-rule-invalid' };
  }
  const ruleError = validateRule(world, rule);
  if (ruleError) return { passed: false, failureClass: ruleError };

  // 可见格冲突：规则必须在每一格都成立
  for (let i = 0; i < world.length; i += 1) {
    const visible = world.visible[i];
    if (visible === null || visible === undefined) continue;
    if (tokenAt(rule, i) !== visible) {
      return { passed: false, failureClass: 'pattern-cycle-wrong', conflictIndex: i };
    }
  }

  const repairMap = new Map<number, string>();
  // artifact 来自玩家输入与内容负例，字段可能是任意 JSON：非数组的 repair（如 5 或对象）
  // 必须当成"没填"，直接 for...of 会抛 TypeError，把"没补完"错报成运行时崩溃。
  const repairs = Array.isArray(candidate.repair) ? candidate.repair : [];
  for (const item of repairs) {
    if (!item || typeof item.index !== 'number' || typeof item.token !== 'string') continue;
    if (item.index < 0 || item.index >= world.length) continue;
    repairMap.set(item.index, item.token);
  }

  const missing: number[] = [];
  for (let i = 0; i < world.length; i += 1) {
    if (world.visible[i] === null || world.visible[i] === undefined) {
      if (!repairMap.has(i)) missing.push(i);
    }
  }
  if (missing.length > 0) {
    return { passed: false, failureClass: 'pattern-repair-incomplete', missingIndices: missing };
  }

  const mismatch: number[] = [];
  for (let i = 0; i < world.length; i += 1) {
    if (world.visible[i] !== null && world.visible[i] !== undefined) continue;
    if (repairMap.get(i) !== tokenAt(rule, i)) mismatch.push(i);
  }
  if (mismatch.length > 0) {
    return { passed: false, failureClass: 'pattern-mismatch', mismatchIndices: mismatch };
  }

  return { passed: true };
}

/** 稳定指纹：用于证据去重，不是安全哈希。实现与 shared/digest 一致，避免两处各改一半。 */
export function patternDigest(value: unknown): string {
  return digest(value);
}
