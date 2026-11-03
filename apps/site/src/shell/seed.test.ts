import { describe, expect, it } from 'vitest';
import { seedFor } from './seed';

describe('seedFor', () => {
  it('同一关卡 + 同一档案得到同一种子（重进关卡内容不漂移）', () => {
    expect(seedFor('k-structure-pattern-path', 'local-default')).toBe(
      seedFor('k-structure-pattern-path', 'local-default'),
    );
  });

  it('不同关卡或不同档案得到不同种子', () => {
    const base = seedFor('k-structure-pattern-path', 'local-default');
    expect(seedFor('k-data-tally', 'local-default')).not.toBe(base);
    expect(seedFor('k-structure-pattern-path', 'another-profile')).not.toBe(base);
  });

  it('种子始终是非负安全整数，可直接注入运行时', () => {
    for (const [level, profile] of [
      ['k-structure-pattern-path', 'local-default'],
      ['g1012-algorithm-frontier', 'p-42'],
      ['', ''],
      ['x'.repeat(200), 'y'.repeat(200)],
    ] as const) {
      const seed = seedFor(level, profile);
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1_000_000_000);
    }
  });
});
