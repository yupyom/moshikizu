import { describe, it, expect } from 'vitest';
import { buildPath, buildCurvePath, buildLinePath } from '../src/lineRouter';
import { strokeDashArray } from '../src/style';

describe('buildCurvePath', () => {
  it('2点なら直線になる', () => {
    const d = buildCurvePath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toBe('M 0 0 L 100 0');
  });

  it('3点以上は三次ベジェを含み、端点を通る', () => {
    const d = buildCurvePath([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('C');
    expect(d.endsWith('100 0')).toBe(true);
  });

  it('中間ウェイポイントも通過する（セグメント終端に座標が現れる）', () => {
    const d = buildCurvePath([
      { x: 0, y: 0 },
      { x: 40, y: 80 },
      { x: 120, y: 20 },
    ]);
    expect(d).toContain('40 80');
  });

  it('1点以下は空文字', () => {
    expect(buildCurvePath([])).toBe('');
    expect(buildCurvePath([{ x: 1, y: 2 }])).toBe('');
  });
});

describe('buildPath', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('省略時は直交ルーティング（buildLinePathと一致）', () => {
    expect(buildPath(pts)).toBe(buildLinePath(pts));
    expect(buildPath(pts, 'orthogonal')).toBe(buildLinePath(pts));
  });

  it("'curve' なら曲線パス", () => {
    expect(buildPath(pts, 'curve')).toBe(buildCurvePath(pts));
  });
});

describe('strokeDashArray', () => {
  it('solid・省略時は undefined', () => {
    expect(strokeDashArray('solid', 2)).toBeUndefined();
    expect(strokeDashArray(undefined, 2)).toBeUndefined();
  });

  it('線幅に比例したパターンを返す', () => {
    expect(strokeDashArray('dashed', 2)).toBe('8 5');
    expect(strokeDashArray('dotted', 2)).toBe('0.1 5');
    expect(strokeDashArray('dashdot', 2)).toBe('8 5 0.1 5');
  });

  it('線幅1未満でも最低幅1として計算する', () => {
    expect(strokeDashArray('dashed', 0.5)).toBe('4 2.5');
  });
});
