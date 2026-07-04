import type { MarkerType } from './shapes';

/**
 * 線端マーカーの幾何定義。
 * React コンポーネントと文字列レンダラ（@draw/renderer）の両方が
 * この定義を使うことで、表示と書き出しの見た目を一致させる。
 */
export interface MarkerElementSpec {
  tag: 'polyline' | 'polygon' | 'rect' | 'circle';
  attrs: Record<string, string | number>;
}

export interface MarkerSpec {
  markerWidth: number;
  markerHeight: number;
  refX: number;
  refY: number;
  /** 内容全体に適用するスケール（<g transform="scale(...)"> 相当） */
  contentScale: number;
  elements: MarkerElementSpec[];
}

// 90°開き角の矢印マーカー (markerUnits="strokeWidth")
// AW = 半開き幅 = 奥行き → 90°
const AW = 3;
const TIP_X = AW + 1;  // 4: 先端合わせの参照点
const MID_X = 2.5;     // 中心合わせの参照点

/**
 * マーカー種別・色・サイズ倍率から SVG marker の定義を返す。
 * 'none' は null。
 */
export function markerSpec(type: MarkerType, color: string, size: number): MarkerSpec | null {
  if (type === 'none') return null;

  let elements: MarkerElementSpec[];
  switch (type) {
    case 'arrow':
      // 90°開き角: depth=3, half=3
      elements = [{
        tag: 'polyline',
        attrs: {
          points: `1,0 ${TIP_X},${AW} 1,${AW * 2}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 0.9,
          'stroke-linejoin': 'miter',
          'stroke-miterlimit': 10,
          'stroke-linecap': 'butt',
        },
      }];
      break;
    case 'triangle':
      elements = [{
        tag: 'polygon',
        attrs: { points: `0.5,0.5 ${TIP_X},${AW} 0.5,${AW * 2 - 0.5}`, fill: color },
      }];
      break;
    case 'square':
      elements = [{ tag: 'rect', attrs: { x: 0.5, y: 1, width: 4, height: 4, fill: color } }];
      break;
    case 'circle':
      elements = [{ tag: 'circle', attrs: { cx: MID_X, cy: AW, r: 2, fill: color } }];
      break;
    case 'diamond':
      elements = [{
        tag: 'polygon',
        attrs: {
          points: `${MID_X},0.2 ${MID_X + 2.3},${AW} ${MID_X},${AW * 2 - 0.2} ${MID_X - 2.3},${AW}`,
          fill: color,
        },
      }];
      break;
    case 'bar':
      elements = [{ tag: 'rect', attrs: { x: MID_X - 0.5, y: 0, width: 1, height: AW * 2, fill: color } }];
      break;
  }

  // 先端系（arrow/triangle）は先端を線端に、それ以外は中心を線端に合わせる
  const refX = type === 'arrow' || type === 'triangle' ? TIP_X : MID_X;

  return {
    markerWidth: (AW + 2) * size,
    markerHeight: (AW * 2 + 1) * size,
    refX: refX * size,
    refY: AW * size,
    contentScale: size,
    elements,
  };
}
