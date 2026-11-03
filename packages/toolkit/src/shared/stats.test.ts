import { describe, expect, it } from 'vitest';
import { clamp, round2, wilsonInterval } from './stats';

describe('wilsonInterval', () => {
  it('n <= 0 时退到全区间 [0, 1]', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(wilsonInterval(3, -1)).toEqual({ low: 0, high: 1 });
  });

  it('0/10 的下界收在 0，上界小于 1', () => {
    const interval = wilsonInterval(0, 10);
    expect(interval.low).toBeCloseTo(0, 6);
    expect(interval.high).toBeGreaterThan(0);
    expect(interval.high).toBeLessThan(1);
  });

  it('10/10 的上界夹到 1，但仍给出大于 0 的下界', () => {
    const interval = wilsonInterval(10, 10);
    expect(interval.low).toBeGreaterThan(0);
    expect(interval.high).toBeLessThanOrEqual(1);
    expect(interval.high).toBeGreaterThan(0.9);
  });

  it('成功数超过 n 时按 100% 收口，不越界', () => {
    const interval = wilsonInterval(20, 10);
    expect(interval.low).toBeGreaterThan(0);
    expect(interval.high).toBeLessThanOrEqual(1);
  });

  it('成功比例越高，区间中心越高', () => {
    const low = wilsonInterval(2, 10);
    const high = wilsonInterval(8, 10);
    expect((high.low + high.high) / 2).toBeGreaterThan((low.low + low.high) / 2);
  });

  it('样本量变大时区间收窄', () => {
    const small = wilsonInterval(30, 100);
    const large = wilsonInterval(300, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('置信水平越高区间越宽', () => {
    const narrow = wilsonInterval(5, 20);
    const wide = wilsonInterval(5, 20, 2.58);
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });
});

describe('clamp', () => {
  it('夹在上下界之间', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('round2', () => {
  it('保留两位小数', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.999)).toBe(2);
  });

  it('负数同样处理', () => {
    expect(round2(-1.234)).toBe(-1.23);
  });
});
