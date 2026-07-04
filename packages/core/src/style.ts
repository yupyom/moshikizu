import type { StrokeDash } from './shapes';

/**
 * StrokeDash から SVG の stroke-dasharray 値を生成する。
 * 線幅に比例させ、太い線でもパターンの見た目が保たれるようにする。
 * 'solid'（または省略）は undefined を返す。
 */
export function strokeDashArray(
  dash: StrokeDash | undefined,
  strokeWidth: number,
): string | undefined {
  const w = Math.max(strokeWidth, 1);
  switch (dash) {
    case 'dashed':
      return `${w * 4} ${w * 2.5}`;
    case 'dotted':
      // linecap round と組み合わせて点になる（長さ0.1のダッシュ）
      return `0.1 ${w * 2.5}`;
    case 'dashdot':
      return `${w * 4} ${w * 2.5} 0.1 ${w * 2.5}`;
    default:
      return undefined;
  }
}
