/** グリッドにスナップした値を返す */
export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** 点をグリッドスナップ */
export function snapPoint(
  x: number,
  y: number,
  gridSize: number,
): { x: number; y: number } {
  return { x: snap(x, gridSize), y: snap(y, gridSize) };
}
