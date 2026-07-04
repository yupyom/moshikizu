import { describe, it, expect } from 'vitest';
import { getBoundingBox, getUnionBoundingBox, pointInBox, boxesOverlap } from '../src/geometry';
import type { RectShape, LineShape } from '../src/shapes';

const makeRect = (x: number, y: number, w: number, h: number): RectShape => ({
  id: 'r1', type: 'rect', x, y, width: w, height: h,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 1,
});

describe('getBoundingBox', () => {
  it('returns correct box for rect', () => {
    const bb = getBoundingBox(makeRect(10, 20, 100, 50));
    expect(bb).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('returns correct box for line', () => {
    const line: LineShape = {
      id: 'l1', type: 'line',
      points: [{ x: 0, y: 0 }, { x: 100, y: 200 }],
      startMarker: 'none', endMarker: 'arrow',
      strokeColor: '#000', strokeWidth: 1,
    };
    const bb = getBoundingBox(line);
    expect(bb).toEqual({ x: 0, y: 0, width: 100, height: 200 });
  });
});

describe('getUnionBoundingBox', () => {
  it('returns null for empty', () => {
    expect(getUnionBoundingBox([])).toBeNull();
  });

  it('returns union of multiple rects', () => {
    const shapes = [makeRect(0, 0, 50, 50), makeRect(100, 100, 50, 50)];
    const bb = getUnionBoundingBox(shapes);
    expect(bb).toEqual({ x: 0, y: 0, width: 150, height: 150 });
  });
});

describe('pointInBox', () => {
  it('detects point inside', () => {
    expect(pointInBox(50, 50, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });
  it('detects point outside', () => {
    expect(pointInBox(150, 50, { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
  });
});

describe('boxesOverlap', () => {
  it('detects overlapping boxes', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    expect(boxesOverlap(a, b)).toBe(true);
  });

  it('detects non-overlapping boxes', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 200, y: 200, width: 100, height: 100 };
    expect(boxesOverlap(a, b)).toBe(false);
  });
});
