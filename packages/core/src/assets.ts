import type { Shape, AssetInstanceShape } from './shapes';
import { getUnionBoundingBox } from './geometry';
import { moveShape } from './alignment';

/**
 * アセットライブラリ（マスター/インスタンス）。
 * - マスター: 複数図形の組み合わせをアセットローカル座標（原点基準）で保持
 * - インスタンス: assetId 参照 + 配置矩形 + オーバーライド。
 *   表示・書き出しは「マスター図形にオーバーライドを適用 → 配置矩形へスケール」
 *   で解決するため、マスターを更新すると全インスタンスに反映される
 */

declare const crypto: { randomUUID(): string };

export interface AssetMaster {
  id: string;
  name: string;
  /** アセットローカル座標系（原点基準）の図形。入れ子インスタンスは不可 */
  shapes: Shape[];
  width: number;
  height: number;
}

/**
 * 選択図形からアセットマスターを作成する。
 * 原点基準に正規化し、入れ子を避けるため assetInstance は除外する。
 */
export function createAssetMaster(name: string, shapes: Shape[]): AssetMaster {
  const source = shapes.filter((s) => s.type !== 'assetInstance');
  if (source.length === 0) {
    throw new Error('アセットにできる図形がありません（インスタンスの入れ子は不可）');
  }
  const bb = getUnionBoundingBox(source);
  if (!bb || bb.width <= 0 || bb.height <= 0) {
    throw new Error('図形のサイズを取得できません');
  }
  const normalized = source.map((s) => {
    const moved = moveShape(s, -bb.x, -bb.y);
    // アセット内idは新規採番（元図形と独立させる）。canvasId は持たない
    const { canvasId: _omit, ...rest } = moved;
    void _omit;
    return { ...rest, id: crypto.randomUUID() } as Shape;
  });
  return {
    id: crypto.randomUUID(),
    name,
    shapes: normalized,
    width: Math.round(bb.width * 100) / 100,
    height: Math.round(bb.height * 100) / 100,
  };
}

export interface ResolvedInstance {
  master: AssetMaster;
  /** オーバーライド適用済みのマスター図形（アセットローカル座標） */
  shapes: Shape[];
  sx: number;
  sy: number;
}

/** インスタンスを解決する。マスターが見つからなければ null */
export function resolveAssetInstance(
  instance: AssetInstanceShape,
  assets: AssetMaster[],
): ResolvedInstance | null {
  const master = assets.find((a) => a.id === instance.assetId);
  if (!master || master.width <= 0 || master.height <= 0) return null;
  const shapes = master.shapes.map((s) => {
    const ov = instance.overrides?.[s.id];
    return ov ? ({ ...s, ...ov, id: s.id, type: s.type } as Shape) : s;
  });
  return {
    master,
    shapes,
    sx: instance.width / master.width,
    sy: instance.height / master.height,
  };
}
