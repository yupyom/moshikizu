import { describe, it, expect } from 'vitest';
import { cropDrag, cropPan, effectiveCrop } from '../src/imageCrop';
import type { ImageShape } from '../src/shapes';

// 元画像 800x600 を等倍で (100,100) に全体表示している状態
const base: ImageShape = {
  id: 'i1', type: 'image',
  x: 100, y: 100, width: 800, height: 600,
  href: 'data:image/png;base64,AAAA',
  originalWidth: 800, originalHeight: 600,
  strokeColor: 'transparent', strokeWidth: 0,
};

describe('effectiveCrop', () => {
  it('crop未設定は全体', () => {
    expect(effectiveCrop(base)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('cropDrag', () => {
  it('右端を左へドラッグ→窓とcrop.widthが縮む（位置は不動）', () => {
    const r = cropDrag(base, 'e', 700, 0);
    expect(r.x).toBe(100);
    expect(r.width).toBe(600);
    expect(r.crop).toEqual({ x: 0, y: 0, width: 600, height: 600 });
  });

  it('左端を右へドラッグ→x/crop.xが進む', () => {
    const r = cropDrag(base, 'w', 300, 0);
    expect(r.x).toBe(300);
    expect(r.width).toBe(600);
    expect(r.crop!.x).toBe(200);
    expect(r.crop!.width).toBe(600);
  });

  it('コーナー(se)は両方向を同時に調整', () => {
    const r = cropDrag(base, 'se', 500, 400);
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
    expect(r.crop).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('画像の外側へは広げられない（クランプ）', () => {
    const cropped: ImageShape = {
      ...base, x: 300, width: 400, crop: { x: 200, y: 0, width: 400, height: 600 },
    };
    // 画像全体の左端はキャンバス100 → それ以上左には動かない
    const r = cropDrag(cropped, 'w', 0, 0);
    expect(r.x).toBe(100);
    expect(r.crop!.x).toBe(0);
  });

  it('全体まで戻すと crop は undefined に正規化される', () => {
    const cropped: ImageShape = {
      ...base, x: 300, width: 400, crop: { x: 200, y: 0, width: 400, height: 600 },
    };
    const r1 = cropDrag(cropped, 'w', 100, 0);  // 左端を画像左端まで
    expect(r1.crop!.x).toBe(0);
    const r2 = cropDrag({ ...cropped, ...r1 } as ImageShape, 'e', 900, 0); // 右端を画像右端まで
    expect(r2.crop).toBeUndefined();
  });
});

describe('cropPan', () => {
  const windowed: ImageShape = {
    ...base, x: 300, y: 200, width: 400, height: 300,
    crop: { x: 200, y: 150, width: 400, height: 300 },
  };

  it('窓内ドラッグで見える範囲がずれる（窓は不動）', () => {
    const r = cropPan(windowed, 50, -30);
    expect(r.crop!.x).toBe(150);  // 右へ動かす = crop.x が減る
    expect(r.crop!.y).toBe(180);
    expect(r.crop!.width).toBe(400);
  });

  it('画像の端でクランプされる', () => {
    const r = cropPan(windowed, 10000, 10000);
    expect(r.crop!.x).toBe(0);
    expect(r.crop!.y).toBe(0);
    const r2 = cropPan(windowed, -10000, -10000);
    expect(r2.crop!.x).toBe(400);  // originalWidth 800 - width 400
    expect(r2.crop!.y).toBe(300);
  });
});
