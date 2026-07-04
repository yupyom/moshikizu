import type { Shape } from './shapes';
import { getBoundingBox } from './geometry';

type AlignDir = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type DistributeDir = 'horizontal' | 'vertical';

/** 選択シェイプを整列する（新しいシェイプ配列を返す） */
export function alignShapes(
  shapes: Shape[],
  selected: Set<string>,
  dir: AlignDir,
): Shape[] {
  const targets = shapes.filter((s) => selected.has(s.id));
  if (targets.length < 2) return shapes;

  const boxes = targets.map((s) => ({ id: s.id, bb: getBoundingBox(s) }));

  let ref: number;
  if (dir === 'left') ref = Math.min(...boxes.map((b) => b.bb.x));
  else if (dir === 'right') ref = Math.max(...boxes.map((b) => b.bb.x + b.bb.width));
  else if (dir === 'center') {
    const minX = Math.min(...boxes.map((b) => b.bb.x));
    const maxX = Math.max(...boxes.map((b) => b.bb.x + b.bb.width));
    ref = (minX + maxX) / 2;
  } else if (dir === 'top') ref = Math.min(...boxes.map((b) => b.bb.y));
  else if (dir === 'bottom') ref = Math.max(...boxes.map((b) => b.bb.y + b.bb.height));
  else {
    // middle
    const minY = Math.min(...boxes.map((b) => b.bb.y));
    const maxY = Math.max(...boxes.map((b) => b.bb.y + b.bb.height));
    ref = (minY + maxY) / 2;
  }

  return shapes.map((s) => {
    if (!selected.has(s.id)) return s;
    const bb = getBoundingBox(s);
    if (dir === 'left') return moveShape(s, ref - bb.x, 0);
    if (dir === 'right') return moveShape(s, ref - (bb.x + bb.width), 0);
    if (dir === 'center') return moveShape(s, ref - (bb.x + bb.width / 2), 0);
    if (dir === 'top') return moveShape(s, 0, ref - bb.y);
    if (dir === 'bottom') return moveShape(s, 0, ref - (bb.y + bb.height));
    // middle
    return moveShape(s, 0, ref - (bb.y + bb.height / 2));
  });
}

/** 均等配置 */
export function distributeShapes(
  shapes: Shape[],
  selected: Set<string>,
  dir: DistributeDir,
): Shape[] {
  const targets = shapes.filter((s) => selected.has(s.id));
  if (targets.length < 3) return shapes;

  const withBox = targets.map((s) => ({ s, bb: getBoundingBox(s) }));

  if (dir === 'horizontal') {
    withBox.sort((a, b) => a.bb.x - b.bb.x);
    const totalWidth = withBox.reduce((sum, { bb }) => sum + bb.width, 0);
    const span = withBox[withBox.length - 1].bb.x + withBox[withBox.length - 1].bb.width - withBox[0].bb.x;
    const gap = (span - totalWidth) / (withBox.length - 1);
    let cursor = withBox[0].bb.x;
    const moves = new Map<string, number>();
    for (const { s, bb } of withBox) {
      moves.set(s.id, cursor - bb.x);
      cursor += bb.width + gap;
    }
    return shapes.map((s) => {
      const dx = moves.get(s.id);
      return dx !== undefined ? moveShape(s, dx, 0) : s;
    });
  } else {
    withBox.sort((a, b) => a.bb.y - b.bb.y);
    const totalHeight = withBox.reduce((sum, { bb }) => sum + bb.height, 0);
    const span = withBox[withBox.length - 1].bb.y + withBox[withBox.length - 1].bb.height - withBox[0].bb.y;
    const gap = (span - totalHeight) / (withBox.length - 1);
    let cursor = withBox[0].bb.y;
    const moves = new Map<string, number>();
    for (const { s, bb } of withBox) {
      moves.set(s.id, cursor - bb.y);
      cursor += bb.height + gap;
    }
    return shapes.map((s) => {
      const dy = moves.get(s.id);
      return dy !== undefined ? moveShape(s, 0, dy) : s;
    });
  }
}

/** シェイプをdx, dy移動した新しいシェイプを返す */
export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === 'line') {
    return {
      ...shape,
      points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  // line 以外はすべて x/y を持つ
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}
