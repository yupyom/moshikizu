import { describe, it, expect } from 'vitest';
import { buildLinePath, lineMidpoint } from '../src/lineRouter';

describe('buildLinePath', () => {
  it('returns empty string for < 2 points', () => {
    expect(buildLinePath([])).toBe('');
    expect(buildLinePath([{ x: 0, y: 0 }])).toBe('');
  });

  it('builds a straight horizontal path', () => {
    const d = buildLinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toContain('M 0 0');
    expect(d).toContain('L 100 0');
  });

  it('inserts intermediate point for diagonal input', () => {
    // 対角線入力は L字に展開される
    const d = buildLinePath([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    expect(d).toContain('M 0 0');
    // 中間点 (100, 0) が挿入される
    expect(d).toContain('100');
    expect(d).toContain('50');
  });

  it('applies bezier curves at corners', () => {
    const d = buildLinePath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    // 角丸のためQコマンドが含まれる
    expect(d).toContain('Q');
  });
});

describe('lineMidpoint', () => {
  it('returns midpoint of two-point line', () => {
    const mid = lineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(mid).toEqual({ x: 50, y: 0 });
  });

  it('handles single point', () => {
    expect(lineMidpoint([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
  });

  it('handles empty array', () => {
    expect(lineMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});
