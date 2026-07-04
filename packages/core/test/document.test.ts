import { describe, it, expect } from 'vitest';
import { parseDocument, DOCUMENT_VERSION, createCanvas } from '../src/document';
import type { RectShape } from '../src/shapes';

const rect = (id: string, canvasId?: string): RectShape => ({
  id, type: 'rect', x: 0, y: 0, width: 10, height: 10,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 1,
  ...(canvasId ? { canvasId } : {}),
});

describe('parseDocument', () => {
  it('オブジェクト以外はエラー', () => {
    expect(() => parseDocument('x')).toThrow();
    expect(() => parseDocument(null)).toThrow();
  });

  it('v1（version・canvases無し）→ デフォルトキャンバスを生成し全shapeを割り当てる', () => {
    const doc = parseDocument({ id: 'p1', name: 'test', shapes: [rect('a'), rect('b')] });
    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(doc.canvases).toHaveLength(1);
    expect(doc.canvases[0].width).toBe(1600);
    expect(doc.canvases[0].height).toBe(900);
    const cid = doc.canvases[0].id;
    expect(doc.shapes.every((s) => s.canvasId === cid)).toBe(true);
  });

  it('v1: 旧バックエンドの canvasWidth/canvasHeight を引き継ぐ', () => {
    const doc = parseDocument({ name: 'test', shapes: [], canvasWidth: 1280, canvasHeight: 720 });
    expect(doc.canvases[0].width).toBe(1280);
    expect(doc.canvases[0].height).toBe(720);
  });

  it('v2: canvases と canvasId を保持する', () => {
    const c1 = createCanvas('A');
    const c2 = createCanvas('B', 800, 600);
    const doc = parseDocument({
      version: 2, id: 'p1', name: 't', updatedAt: '',
      canvases: [c1, c2],
      shapes: [rect('a', c1.id), rect('b', c2.id)],
    });
    expect(doc.canvases).toHaveLength(2);
    expect(doc.canvases[1].width).toBe(800);
    expect(doc.shapes[0].canvasId).toBe(c1.id);
    expect(doc.shapes[1].canvasId).toBe(c2.id);
  });

  it('存在しないキャンバスを指す shape は先頭キャンバスへ再割り当てされる', () => {
    const c1 = createCanvas('A');
    const doc = parseDocument({
      version: 2, name: 't', canvases: [c1],
      shapes: [rect('a', 'missing-canvas')],
    });
    expect(doc.shapes[0].canvasId).toBe(c1.id);
  });

  it('id 無しは null（未保存扱い）', () => {
    const doc = parseDocument({ name: 't', shapes: [] });
    expect(doc.id).toBeNull();
  });
});

describe('syncAttachedPoints（コネクタ）', () => {
  it('連結先図形の移動に線端が追従し、消えたら解除される', async () => {
    const { syncAttachedPoints } = await import('../src/connectors');
    const box: import('../src/shapes').RectShape = {
      id: 'box', type: 'rect', x: 100, y: 100, width: 200, height: 100,
      fillColor: '#fff', strokeColor: '#000', strokeWidth: 1,
    };
    const line: import('../src/shapes').LineShape = {
      id: 'ln', type: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 150, attach: { shapeId: 'box', dx: 0, dy: 50 } },
      ],
      strokeColor: '#000', strokeWidth: 2, startMarker: 'none', endMarker: 'arrow',
    };
    // 図形を移動 → 端点が追従
    const moved = syncAttachedPoints([{ ...box, x: 300 }, line]);
    const ml = moved.find((s) => s.id === 'ln') as import('../src/shapes').LineShape;
    expect(ml.points[1].x).toBe(300);
    expect(ml.points[1].y).toBe(150);
    // 連結先が消えた → attach解除・座標維持
    const orphan = syncAttachedPoints([ml]);
    const ol = orphan.find((s) => s.id === 'ln') as import('../src/shapes').LineShape;
    expect(ol.points[1].attach).toBeUndefined();
    expect(ol.points[1].x).toBe(300);
  });
});
