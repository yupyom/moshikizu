import { describe, it, expect } from 'vitest';
import { createAssetMaster, resolveAssetInstance } from '../src/assets';
import { parseDocument } from '../src/document';
import type { RectShape, TextShape, AssetInstanceShape } from '../src/shapes';

const rect = (x: number, y: number): RectShape => ({
  id: 'r1', type: 'rect', x, y, width: 200, height: 100,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 2, canvasId: 'c1',
});

const text = (x: number, y: number): TextShape => ({
  id: 't1', type: 'text', x, y, text: 'プレースホルダー',
  fontSize: 16, fontWeight: 'regular', color: '#000',
  strokeColor: '#000', strokeWidth: 1, canvasId: 'c1',
});

describe('createAssetMaster', () => {
  it('原点基準に正規化し、canvasIdを除去、寸法を記録する', () => {
    const m = createAssetMaster('箱', [rect(100, 50), text(120, 80)]);
    expect(m.width).toBe(200);
    expect(m.height).toBe(100);
    const r = m.shapes.find((s) => s.type === 'rect') as RectShape;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.canvasId).toBeUndefined();
    expect(m.shapes.every((s) => s.id !== 'r1')).toBe(true); // 新規id
  });

  it('インスタンスの入れ子は除外、空ならthrow', () => {
    const inst: AssetInstanceShape = {
      id: 'i', type: 'assetInstance', x: 0, y: 0, width: 10, height: 10,
      assetId: 'a', strokeColor: 'transparent', strokeWidth: 0,
    };
    expect(() => createAssetMaster('x', [inst])).toThrow();
  });
});

describe('resolveAssetInstance', () => {
  const master = createAssetMaster('箱', [rect(0, 0), text(20, 30)]);
  const inst: AssetInstanceShape = {
    id: 'i1', type: 'assetInstance', x: 500, y: 300,
    width: 400, height: 200, assetId: master.id,
    strokeColor: 'transparent', strokeWidth: 0,
  };

  it('スケール係数とオーバーライド適用', () => {
    const textId = master.shapes.find((s) => s.type === 'text')!.id;
    const r = resolveAssetInstance(
      { ...inst, overrides: { [textId]: { text: 'サーバーA' } } },
      [master],
    )!;
    expect(r.sx).toBe(2);   // 400 / 200
    expect(r.sy).toBe(2);   // 200 / 100
    const t = r.shapes.find((s) => s.type === 'text') as TextShape;
    expect(t.text).toBe('サーバーA');
    // マスター自体は不変
    expect((master.shapes.find((s) => s.type === 'text') as TextShape).text).toBe('プレースホルダー');
  });

  it('マスターが無ければ null', () => {
    expect(resolveAssetInstance(inst, [])).toBeNull();
  });
});

describe('parseDocument v3', () => {
  it('assets を保持し、v2以前は空配列', () => {
    const master = createAssetMaster('箱', [rect(0, 0)]);
    const v3 = parseDocument({ version: 3, name: 't', shapes: [], canvases: [], assets: [master] });
    expect(v3.assets).toHaveLength(1);
    expect(v3.version).toBe(3);

    const v2 = parseDocument({ version: 2, name: 't', shapes: [] });
    expect(v2.assets).toEqual([]);
  });
});
