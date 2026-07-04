import { describe, it, expect } from 'vitest';
import { alignShapes, distributeShapes, moveShape } from '../src/alignment';
import type { RectShape } from '../src/shapes';

const makeRect = (id: string, x: number, y: number, w = 80, h = 60): RectShape => ({
  id, type: 'rect', x, y, width: w, height: h,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 1,
});

describe('alignShapes', () => {
  it('aligns left edges', () => {
    const shapes = [makeRect('a', 100, 0), makeRect('b', 200, 0)];
    const result = alignShapes(shapes, new Set(['a', 'b']), 'left');
    expect(result.find(s => s.id === 'a')!).toMatchObject({ x: 100 });
    expect(result.find(s => s.id === 'b')!).toMatchObject({ x: 100 });
  });

  it('aligns right edges', () => {
    const shapes = [makeRect('a', 0, 0, 80), makeRect('b', 100, 0, 60)];
    const result = alignShapes(shapes, new Set(['a', 'b']), 'right');
    // max right = 160
    const a = result.find(s => s.id === 'a')!;
    const b = result.find(s => s.id === 'b')!;
    expect((a as RectShape).x + (a as RectShape).width).toBe(160);
    expect((b as RectShape).x + (b as RectShape).width).toBe(160);
  });

  it('aligns top edges', () => {
    const shapes = [makeRect('a', 0, 50), makeRect('b', 100, 200)];
    const result = alignShapes(shapes, new Set(['a', 'b']), 'top');
    expect(result.find(s => s.id === 'a')!).toMatchObject({ y: 50 });
    expect(result.find(s => s.id === 'b')!).toMatchObject({ y: 50 });
  });

  it('does not move unselected shapes', () => {
    const shapes = [makeRect('a', 100, 0), makeRect('b', 200, 0), makeRect('c', 300, 0)];
    const result = alignShapes(shapes, new Set(['a', 'b']), 'left');
    expect(result.find(s => s.id === 'c')!).toMatchObject({ x: 300 });
  });
});

describe('distributeShapes', () => {
  it('distributes horizontally', () => {
    const shapes = [
      makeRect('a', 0, 0, 40),
      makeRect('b', 100, 0, 40),
      makeRect('c', 300, 0, 40),
    ];
    const result = distributeShapes(shapes, new Set(['a', 'b', 'c']), 'horizontal');
    const a = result.find(s => s.id === 'a')! as RectShape;
    const b = result.find(s => s.id === 'b')! as RectShape;
    const c = result.find(s => s.id === 'c')! as RectShape;
    // a stays at 0, c stays at 300; b should be centered
    expect(a.x).toBe(0);
    expect(c.x).toBe(300);
    expect(b.x).toBe(150); // (340 - 120) / 2 = 110 gap; 0+40+110=150
  });
});

describe('moveShape', () => {
  it('moves rect', () => {
    const r = makeRect('r', 10, 20);
    const moved = moveShape(r, 5, -5) as RectShape;
    expect(moved).toMatchObject({ x: 15, y: 15 });
  });
});
