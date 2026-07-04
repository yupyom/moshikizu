import { describe, it, expect } from 'vitest';
import {
  createDocument,
  docAddShapes,
  docUpdateShape,
  docDeleteShapes,
  docAddCanvas,
  docUpdateCanvas,
} from '../src/commands';
import type { RectShape } from '../src/shapes';

const rect = (): Omit<RectShape, 'id'> => ({
  type: 'rect', x: 0, y: 0, width: 100, height: 60,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 2,
});

describe('commands', () => {
  it('createDocument はキャンバス1枚の空ドキュメントを作る', () => {
    const doc = createDocument('テスト', 1280, 720);
    expect(doc.version).toBe(3);
    expect(doc.canvases).toHaveLength(1);
    expect(doc.canvases[0].width).toBe(1280);
    expect(doc.shapes).toHaveLength(0);
  });

  it('docAddShapes は id と canvasId を補完し、元docを変更しない', () => {
    const doc = createDocument();
    const { doc: next, ids } = docAddShapes(doc, [rect(), rect()]);
    expect(next.shapes).toHaveLength(2);
    expect(doc.shapes).toHaveLength(0); // イミュータブル
    expect(ids).toHaveLength(2);
    expect(next.shapes[0].id).toBe(ids[0]);
    expect(next.shapes.every((s) => s.canvasId === doc.canvases[0].id)).toBe(true);
  });

  it('存在しないキャンバスへの追加は throw', () => {
    expect(() => docAddShapes(createDocument(), [rect()], 'nope')).toThrow();
  });

  it('docUpdateShape は部分更新し、id は書き換え不可', () => {
    const { doc, ids } = docAddShapes(createDocument(), [rect()]);
    const next = docUpdateShape(doc, ids[0], { x: 50, id: 'hack' } as never);
    expect((next.shapes[0] as RectShape).x).toBe(50);
    expect(next.shapes[0].id).toBe(ids[0]);
    expect(() => docUpdateShape(doc, 'missing', { x: 1 })).toThrow();
  });

  it('docDeleteShapes は削除数を返す', () => {
    const { doc, ids } = docAddShapes(createDocument(), [rect(), rect()]);
    const { doc: next, deleted } = docDeleteShapes(doc, [ids[0], 'missing']);
    expect(deleted).toBe(1);
    expect(next.shapes).toHaveLength(1);
  });

  it('docAddCanvas / docUpdateCanvas', () => {
    const doc = createDocument();
    const { doc: d2, canvas } = docAddCanvas(doc, '2枚目', 800, 600);
    expect(d2.canvases).toHaveLength(2);
    const d3 = docUpdateCanvas(d2, canvas.id, { name: '改名' });
    expect(d3.canvases[1].name).toBe('改名');
    expect(() => docUpdateCanvas(d2, 'missing', {})).toThrow();
  });
});
