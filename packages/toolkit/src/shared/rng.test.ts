import { describe, expect, it } from 'vitest';
import { digest, hashString, mulberry32 } from './rng';

describe('mulberry32', () => {
  it('同一 seed 生成同一序列', () => {
    const left = mulberry32(42);
    const right = mulberry32(42);
    expect([left(), left(), left(), left()]).toEqual([right(), right(), right(), right()]);
  });

  it('不同 seed 的序列不同', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('输出落在 [0, 1)', () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('种子按 32 位无符号处理：-1 与 0xffffffff 等价', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
  });
});

describe('hashString', () => {
  it('稳定且落在 32 位无符号范围', () => {
    expect(hashString('pattern')).toBe(hashString('pattern'));
    expect(hashString('pattern')).toBeGreaterThanOrEqual(0);
    expect(hashString('pattern')).toBeLessThanOrEqual(0xffffffff);
  });

  it('大小写敏感：证据指纹不能把 AB 和 ab 当成同一份产物', () => {
    expect(hashString('AB')).not.toBe(hashString('ab'));
  });
});

describe('digest', () => {
  it('同内容同指纹，且是 8 位十六进制', () => {
    const left = digest({ tokens: ['A', 'B'], period: 2 });
    const right = digest({ tokens: ['A', 'B'], period: 2 });
    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{8}$/);
  });

  it('内容不同则指纹不同', () => {
    expect(digest({ period: 2 })).not.toBe(digest({ period: 3 }));
  });

  it('JSON.stringify 会返回 undefined 的输入不抛错', () => {
    expect(() => digest(undefined)).not.toThrow();
    expect(digest(undefined)).toMatch(/^[0-9a-f]{8}$/);
  });
});
