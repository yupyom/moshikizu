import { describe, it, expect } from 'vitest';
import { snap, snapPoint } from '../src/grid';

describe('grid snap', () => {
  it('should snap to nearest grid', () => {
    expect(snap(23, 20)).toBe(20);
    expect(snap(30, 20)).toBe(40);
    expect(snap(0, 20)).toBe(0);
    expect(snap(20, 20)).toBe(20);
    expect(snap(10, 20)).toBe(20);
    expect(snap(9, 20)).toBe(0);
  });

  it('should snap negative values', () => {
    expect(snap(-10, 20)).toBeCloseTo(0);
    expect(snap(-11, 20)).toBe(-20);
  });

  it('snapPoint should snap both axes', () => {
    expect(snapPoint(23, 37, 20)).toEqual({ x: 20, y: 40 });
  });
});
