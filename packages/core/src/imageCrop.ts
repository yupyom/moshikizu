import type { ImageShape, HandlePosition } from './shapes';

/**
 * 画像の非破壊トリミング（クロップ）操作の計算。
 * - クロップ枠のハンドルドラッグ: 表示窓（shapeの矩形）を動かし、
 *   画像はキャンバス上で不動（PowerPointのトリミングと同じ挙動）
 * - 窓内ドラッグ（パン）: 窓は不動で、窓に見える画像の範囲をずらす
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** クロップの最小窓サイズ（キャンバス座標） */
const MIN_CROP_CANVAS = 10;

/** crop 未設定は「全体表示」として扱う */
export function effectiveCrop(s: ImageShape): CropRect {
  return s.crop ?? { x: 0, y: 0, width: s.originalWidth, height: s.originalHeight };
}

/** ほぼ全体を表示しているなら undefined（crop無し）に正規化 */
function normalizeCrop(crop: CropRect, s: ImageShape): CropRect | undefined {
  const eps = 0.5;
  if (
    crop.x <= eps && crop.y <= eps &&
    crop.width >= s.originalWidth - eps &&
    crop.height >= s.originalHeight - eps
  ) {
    return undefined;
  }
  return {
    x: round2(crop.x),
    y: round2(crop.y),
    width: round2(crop.width),
    height: round2(crop.height),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * クロップ枠のハンドル (handle) をキャンバス座標 (ptX, ptY) までドラッグした結果。
 * shape の位置・サイズと crop を返す。
 */
export function cropDrag(
  orig: ImageShape,
  handle: HandlePosition,
  ptX: number,
  ptY: number,
): Partial<ImageShape> {
  const crop = effectiveCrop(orig);
  const sx = orig.width / crop.width;
  const sy = orig.height / crop.height;
  // 元画像全体が占めるキャンバス上の矩形（不動）
  const imgX = orig.x - crop.x * sx;
  const imgY = orig.y - crop.y * sy;
  const imgW = orig.originalWidth * sx;
  const imgH = orig.originalHeight * sy;

  let x = orig.x;
  let y = orig.y;
  let w = orig.width;
  let h = orig.height;

  if (handle.includes('e')) {
    const right = clamp(ptX, x + MIN_CROP_CANVAS, imgX + imgW);
    w = right - x;
  }
  if (handle.includes('s')) {
    const bottom = clamp(ptY, y + MIN_CROP_CANVAS, imgY + imgH);
    h = bottom - y;
  }
  if (handle.includes('w')) {
    const left = clamp(ptX, imgX, orig.x + orig.width - MIN_CROP_CANVAS);
    w = orig.x + orig.width - left;
    x = left;
  }
  if (handle.includes('n')) {
    const top = clamp(ptY, imgY, orig.y + orig.height - MIN_CROP_CANVAS);
    h = orig.y + orig.height - top;
    y = top;
  }

  const newCrop: CropRect = {
    x: crop.x + (x - orig.x) / sx,
    y: crop.y + (y - orig.y) / sy,
    width: w / sx,
    height: h / sy,
  };

  return {
    x: round2(x),
    y: round2(y),
    width: round2(w),
    height: round2(h),
    crop: normalizeCrop(newCrop, orig),
  };
}

/**
 * クロップ窓内ドラッグ: 窓は不動のまま、画像の見える範囲をずらす。
 * (dxCanvas, dyCanvas) はドラッグ開始位置からのキャンバス座標の移動量。
 * orig はドラッグ開始時点の shape。
 */
export function cropPan(
  orig: ImageShape,
  dxCanvas: number,
  dyCanvas: number,
): Partial<ImageShape> {
  const crop = effectiveCrop(orig);
  const sx = orig.width / crop.width;
  const sy = orig.height / crop.height;
  // 画像を右に動かす = 見える範囲(crop.x)を左に
  const newCrop: CropRect = {
    x: clamp(crop.x - dxCanvas / sx, 0, orig.originalWidth - crop.width),
    y: clamp(crop.y - dyCanvas / sy, 0, orig.originalHeight - crop.height),
    width: crop.width,
    height: crop.height,
  };
  return { crop: normalizeCrop(newCrop, orig) };
}
