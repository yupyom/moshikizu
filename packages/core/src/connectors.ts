import type { Shape } from './shapes';
import { getBoundingBox } from './geometry';

/**
 * コネクタの同期: attach を持つ線の端点を、連結先図形の現在位置から再計算する。
 * 図形を動かした後に呼ぶ（変更が無ければ同じ配列を返す）。
 * 連結先が消えていた場合は attach を外して現在座標を保持する。
 */
export function syncAttachedPoints(shapes: Shape[]): Shape[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  let changed = false;
  const next = shapes.map((s) => {
    if (s.type !== 'line') return s;
    let lineChanged = false;
    const points = s.points.map((p) => {
      if (!p.attach) return p;
      const target = byId.get(p.attach.shapeId);
      if (!target || target.type === 'line') {
        lineChanged = true;
        return { x: p.x, y: p.y };
      }
      const bb = getBoundingBox(target);
      const nx = bb.x + p.attach.dx;
      const ny = bb.y + p.attach.dy;
      if (nx === p.x && ny === p.y) return p;
      lineChanged = true;
      return { ...p, x: nx, y: ny };
    });
    if (!lineChanged) return s;
    changed = true;
    return { ...s, points };
  });
  return changed ? next : shapes;
}
