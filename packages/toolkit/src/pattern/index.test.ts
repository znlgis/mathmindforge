import { describe, expect, it } from 'vitest';
import { digest } from '../shared/rng';
import {
  isPatternTransform, patternDigest, tokenAt, validatePattern, validateRule,
} from './index';
import type { PatternRule, PatternWorld } from './index';

const BASE_RULE: PatternRule = { tokens: ['A', 'B', 'C'], period: 3, transform: 'none' };

function rule(overrides: Partial<PatternRule> = {}): PatternRule {
  return { ...BASE_RULE, ...overrides };
}

function world(overrides: Partial<PatternWorld> = {}): PatternWorld {
  return {
    length: 6,
    visible: ['A', 'B', 'C', 'A', 'B', 'C'],
    allowedPeriods: [2, 3, 4, 6],
    allowedTransforms: ['none', 'mirror', 'rotate', 'shift', 'reflect'],
    ...overrides,
  };
}

function blankWorld(length: number, overrides: Partial<PatternWorld> = {}): PatternWorld {
  return world({ length, visible: new Array<string | null>(length).fill(null), ...overrides });
}

describe('tokenAt', () => {
  it('原样变换按周期循环', () => {
    expect(tokenAt(rule(), 0)).toBe('A');
    expect(tokenAt(rule(), 2)).toBe('C');
    expect(tokenAt(rule(), 3)).toBe('A');
    expect(tokenAt(rule(), 4)).toBe('B');
  });

  it('负索引按周期回绕，而不是返回空串', () => {
    expect(tokenAt(rule(), -1)).toBe('C');
    expect(tokenAt(rule(), -4)).toBe('C');
  });

  it('镜像变换把单元倒过来', () => {
    expect([0, 1, 2, 3].map((index) => tokenAt(rule({ transform: 'mirror' }), index)))
      .toEqual(['C', 'B', 'A', 'C']);
  });

  it('旋转变换整体左移一位', () => {
    expect([0, 1, 2, 3].map((index) => tokenAt(rule({ transform: 'rotate' }), index)))
      .toEqual(['B', 'C', 'A', 'B']);
  });

  it('错一位变换整体右移一位', () => {
    expect([0, 1, 2, 3].map((index) => tokenAt(rule({ transform: 'shift' }), index)))
      .toEqual(['C', 'A', 'B', 'C']);
  });

  it('reflect 是镜像展开：后半段倒着走', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((index) => tokenAt(rule({ transform: 'reflect' }), index)))
      .toEqual(['A', 'B', 'C', 'C', 'B', 'A', 'A']);
  });

  it('period 为 0 时退回 tokens.length，不出现除以 0', () => {
    const zero: PatternRule = { tokens: ['X', 'Y'], period: 0, transform: 'none' };
    expect(tokenAt(zero, 0)).toBe('X');
    expect(tokenAt(zero, 1)).toBe('Y');
    expect(tokenAt(zero, 2)).toBe('X');
  });
});

describe('validateRule', () => {
  it('合法规则返回 null', () => {
    expect(validateRule(world(), rule())).toBeNull();
  });

  it('token 少于 2 个或超过 6 个都算不合法', () => {
    expect(validateRule(world(), { tokens: ['A'], period: 1, transform: 'none' }))
      .toBe('pattern-rule-invalid');
    expect(validateRule(world(), { tokens: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], period: 7, transform: 'none' }))
      .toBe('pattern-rule-invalid');
  });

  it('period 与 tokens 长度不一致算不合法', () => {
    expect(validateRule(world(), rule({ period: 2 }))).toBe('pattern-rule-invalid');
  });

  it('周期或变换不在关卡允许范围内算不合法', () => {
    expect(validateRule(world({ allowedPeriods: [2] }), rule())).toBe('pattern-rule-invalid');
    expect(validateRule(world({ allowedTransforms: ['none'] }), rule({ transform: 'mirror' })))
      .toBe('pattern-rule-invalid');
  });

  it('未知变换不算合法变换', () => {
    expect(isPatternTransform('mirror')).toBe(true);
    expect(isPatternTransform('flip')).toBe(false);
    expect(isPatternTransform(3)).toBe(false);
    expect(validateRule(world(), rule({ transform: 'flip' as unknown as PatternRule['transform'] })))
      .toBe('pattern-rule-invalid');
  });
});

describe('validatePattern', () => {
  it('artifact 不是对象时按规则不合法处理', () => {
    expect(validatePattern(world(), null)).toEqual({ passed: false, failureClass: 'pattern-rule-invalid' });
    expect(validatePattern(world(), 5)).toEqual({ passed: false, failureClass: 'pattern-rule-invalid' });
  });

  it('缺少 patternRule 或 tokens 不是数组时按规则不合法处理', () => {
    expect(validatePattern(world(), { repair: [] })).toEqual({ passed: false, failureClass: 'pattern-rule-invalid' });
    expect(validatePattern(world(), { patternRule: { tokens: 'ABC' } }))
      .toEqual({ passed: false, failureClass: 'pattern-rule-invalid' });
  });

  it('规则与可见格冲突时指出第一处冲突', () => {
    const result = validatePattern(world({ visible: ['A', 'X', 'C', 'A', 'B', 'C'] }), { patternRule: rule() });
    expect(result.passed).toBe(false);
    expect(result.failureClass).toBe('pattern-cycle-wrong');
    expect(result.conflictIndex).toBe(1);
  });

  it('缺口没补齐时列出缺的位置', () => {
    const result = validatePattern(world({ visible: ['A', 'B', null, null, 'B', 'C'] }), {
      patternRule: rule(),
      repair: [{ index: 2, token: 'C' }],
    });
    expect(result.passed).toBe(false);
    expect(result.failureClass).toBe('pattern-repair-incomplete');
    expect(result.missingIndices).toEqual([3]);
  });

  it('补的块与规则不一致时列出位置', () => {
    const result = validatePattern(blankWorld(3), {
      patternRule: rule(),
      repair: [{ index: 0, token: 'A' }, { index: 1, token: 'B' }, { index: 2, token: 'X' }],
    });
    expect(result.passed).toBe(false);
    expect(result.failureClass).toBe('pattern-mismatch');
    expect(result.mismatchIndices).toEqual([2]);
  });

  it('全部补齐且与规则一致时通过', () => {
    expect(validatePattern(blankWorld(4), {
      patternRule: rule(),
      repair: [
        { index: 0, token: 'A' },
        { index: 1, token: 'B' },
        { index: 2, token: 'C' },
        { index: 3, token: 'A' },
      ],
    })).toEqual({ passed: true });
  });

  it('repair 不是数组时当成没填，而不是抛 TypeError', () => {
    for (const repair of [5, 'x', {}, true]) {
      const result = validatePattern(blankWorld(2), { patternRule: rule(), repair });
      expect(result.passed).toBe(false);
      expect(result.failureClass).toBe('pattern-repair-incomplete');
      expect(result.missingIndices).toEqual([0, 1]);
    }
  });

  it('repair 里的脏条目被跳过：非对象、非数字下标、非字符串 token、越界下标', () => {
    const result = validatePattern(blankWorld(2), {
      patternRule: rule(),
      repair: [
        null,
        'oops',
        { index: '0', token: 'A' },
        { index: 0, token: 7 },
        { index: 9, token: 'A' },
        { index: 0, token: 'A' },
        { index: 1, token: 'B' },
      ],
    });
    expect(result).toEqual({ passed: true });
  });

  it('空世界没有缺口也没有冲突，按通过处理', () => {
    expect(validatePattern(world({ length: 0, visible: [] }), { patternRule: rule() }))
      .toEqual({ passed: true });
  });

  it('单格世界也能判定', () => {
    expect(validatePattern(blankWorld(1), {
      patternRule: rule(),
      repair: [{ index: 0, token: 'A' }],
    })).toEqual({ passed: true });
  });
});

describe('patternDigest', () => {
  it('与 shared/digest 同一实现，稳定且为 8 位十六进制', () => {
    const value = { tokens: ['A', 'B', 'C'], period: 3, transform: 'none' };
    expect(patternDigest(value)).toBe(digest(value));
    expect(patternDigest(value)).toBe(patternDigest({ tokens: ['A', 'B', 'C'], period: 3, transform: 'none' }));
    expect(patternDigest(value)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('不同规则得到不同指纹', () => {
    expect(patternDigest({ period: 2 })).not.toBe(patternDigest({ period: 3 }));
  });
});
