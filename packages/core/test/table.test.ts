import { describe, it, expect } from 'vitest';
import { computeTable, formatNumber, parseCellRef, colLabel } from '../src/table';

describe('参照とラベル', () => {
  it('A1形式の相互変換', () => {
    expect(parseCellRef('A1')).toEqual({ r: 0, c: 0 });
    expect(parseCellRef('B3')).toEqual({ r: 2, c: 1 });
    expect(parseCellRef('AA10')).toEqual({ r: 9, c: 26 });
    expect(parseCellRef('1A')).toBeNull();
    expect(colLabel(0)).toBe('A');
    expect(colLabel(26)).toBe('AA');
  });
});

describe('formatNumber', () => {
  it('小数点桁数・カンマ・パーセント', () => {
    expect(formatNumber(1234567.891, { decimals: 1, comma: true })).toBe('1,234,567.9');
    expect(formatNumber(-1234.5, { comma: true, decimals: 0 })).toBe('-1,235');
    expect(formatNumber(0.256, { percent: true, decimals: 1 })).toBe('25.6%');
    expect(formatNumber(3.14159)).toBe('3.14159');
  });
});

describe('computeTable', () => {
  it('四則演算・カッコ・セル参照・SUM/AVG', () => {
    const { display } = computeTable([
      ['10', '20', '=A1+B1'],
      ['=A1*2', '=(A1+B1)/3', '=SUM(A1:B1)'],
      ['=AVG(A1:B1)', '=C1-5', '=SUM(A1:B2)'],
    ]);
    expect(display[0][2]).toBe('30');
    expect(display[1][0]).toBe('20');
    expect(display[1][1]).toBe('10');
    expect(display[1][2]).toBe('30');
    expect(display[2][0]).toBe('15');
    expect(display[2][1]).toBe('25');
    expect(display[2][2]).toBe('60'); // 10+20+20+10
  });

  it('書式の適用（数式セル・数値セル両方）', () => {
    const { display } = computeTable(
      [['0.5', '=A1']],
      { '0,0': { percent: true, decimals: 0 }, '0,1': { decimals: 2 } },
    );
    expect(display[0][0]).toBe('50%');
    expect(display[0][1]).toBe('0.50');
  });

  it('エラーと循環参照', () => {
    const { display } = computeTable([
      ['=A2', '=1/0以外の不正な式('],
      ['=A1', '=Z99'],
    ]);
    expect(display[0][0]).toBe('#CIRC');
    expect(display[1][0]).toBe('#CIRC');
    expect(display[0][1]).toBe('#ERR');
    expect(display[1][1]).toBe('#ERR'); // 空セル参照
  });

  it('values はグラフ用の数値行列（テキストはNaN、%表記は数値化）', () => {
    const { values } = computeTable([
      ['ラベル', '1,000', '25%'],
      ['x', '=B1*2', ''],
    ]);
    expect(Number.isNaN(values[0][0])).toBe(true);
    expect(values[0][1]).toBe(1000);
    expect(values[0][2]).toBe(0.25);
    expect(values[1][1]).toBe(2000);
  });
});
