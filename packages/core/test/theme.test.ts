import { describe, it, expect } from 'vitest';
import { parseTheme, THEME_VERSION } from '../src/theme';

const valid = {
  name: 'ブランドA',
  colorPalette: ['#111111', '#2563eb'],
  font: 'Noto Sans JP',
  strokeWidths: [2, 4, 6],
};

describe('parseTheme', () => {
  it('必須フィールドを検証して正規化する', () => {
    const t = parseTheme(valid);
    expect(t.version).toBe(THEME_VERSION);
    expect(t.name).toBe('ブランドA');
    expect(t.colorPalette).toHaveLength(2);
  });

  it('任意フィールド（fontSizes・角丸）を保持する', () => {
    const t = parseTheme({ ...valid, fontSizes: [12, 14], defaultCornerRadius: 8 });
    expect(t.fontSizes).toEqual([12, 14]);
    expect(t.defaultCornerRadius).toBe(8);
  });

  it('不正データはthrow', () => {
    expect(() => parseTheme(null)).toThrow();
    expect(() => parseTheme({ ...valid, name: '' })).toThrow();
    expect(() => parseTheme({ ...valid, colorPalette: 'red' })).toThrow();
    expect(() => parseTheme({ ...valid, strokeWidths: ['a'] })).toThrow();
    expect(() => parseTheme({ ...valid, font: 42 })).toThrow();
  });
});
