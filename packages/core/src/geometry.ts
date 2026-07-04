import type { BoundingBox, Shape, LineShape } from './shapes';

/** CJK文字を考慮したテキスト幅の概算 */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // U+3000以上: CJK・全角文字は約1em
    if (code >= 0x3000) {
      width += fontSize;
    } else {
      width += fontSize * 0.6;
    }
  }
  return width;
}

/** シェイプのバウンディングボックスを返す */
export function getBoundingBox(shape: Shape): BoundingBox {
  if (shape.type === 'line') {
    return getLineBoundingBox(shape);
  }
  if (shape.type === 'table') {
    return {
      x: shape.x,
      y: shape.y,
      width: shape.colWidths.reduce((a, b) => a + b, 0),
      height: shape.rowHeights.reduce((a, b) => a + b, 0),
    };
  }
  if (shape.type === 'text') {
    const lines = shape.text.split('\n');
    const lineHeight = shape.fontSize * (shape.lineHeight ?? 1.4);
    const maxWidth = Math.max(...lines.map((l) => estimateTextWidth(l, shape.fontSize)), 20);
    return { x: shape.x, y: shape.y - shape.fontSize, width: maxWidth, height: lines.length * lineHeight };
  }
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

function getLineBoundingBox(line: LineShape): BoundingBox {
  if (line.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of line.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 複数シェイプを包むバウンディングボックス */
export function getUnionBoundingBox(shapes: Shape[]): BoundingBox | null {
  if (shapes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const bb = getBoundingBox(s);
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.width);
    maxY = Math.max(maxY, bb.y + bb.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 点がバウンディングボックス内にあるか */
export function pointInBox(
  px: number,
  py: number,
  box: BoundingBox,
): boolean {
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

/** 2つのバウンディングボックスが重なるか */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
