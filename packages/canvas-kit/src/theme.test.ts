import { describe, expect, it } from 'vitest';
import { FONT_FAMILY, FONT_SIZES, PALETTE, textStyle, toColor } from './theme';

describe('toColor', () => {
  it('把 #rrggbb 转成 0xrrggbb', () => {
    expect(toColor('#f7f1e6')).toBe(0xf7f1e6);
    expect(toColor('#1F4E6B')).toBe(0x1f4e6b);
    expect(toColor('#22303c')).toBe(0x22303c);
  });

  it('三位简写会展开成六位', () => {
    expect(toColor('#fff')).toBe(0xffffff);
    expect(toColor('#0a0')).toBe(0x00aa00);
  });

  it('数字原样返回，方便直接传 Phaser 常量', () => {
    expect(toColor(0x123456)).toBe(0x123456);
  });

  it('非法输入退成黑色而不是 NaN', () => {
    expect(toColor('#zzzzzz')).toBe(0);
    expect(toColor('')).toBe(0);
    expect(toColor('not-a-color')).toBe(0);
  });

  it('主题色都能转成数值', () => {
    for (const value of Object.values(PALETTE)) {
      const parsed = toColor(value);
      expect(Number.isInteger(parsed)).toBe(true);
      expect(parsed).toBeGreaterThanOrEqual(0);
      expect(parsed).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('textStyle', () => {
  it('默认用主题墨色、正文字号、非粗体', () => {
    expect(textStyle(16)).toEqual({
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      color: PALETTE.ink,
      fontStyle: 'normal',
    });
  });

  it('可指定颜色与粗体', () => {
    expect(textStyle(FONT_SIZES.lg, PALETTE.red, true)).toMatchObject({
      fontSize: '20px',
      color: PALETTE.red,
      fontStyle: 'bold',
    });
  });
});
