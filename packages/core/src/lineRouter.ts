import type { LinePoint, LinePathStyle, CurveControl } from './shapes';

const CORNER_RADIUS = 6;

/** pathStyle に応じて SVG path の d 属性を生成する */
export function buildPath(
  points: LinePoint[],
  style?: LinePathStyle,
  controls?: Record<number, CurveControl>,
): string {
  return style === 'curve' ? buildCurvePath(points, controls) : buildLinePath(points);
}

/**
 * 各曲線セグメントの制御点（絶対座標）を返す。
 * カスタム制御点があればそれを、無ければ Catmull-Rom の自動値。
 * ベジェハンドルUIとパス生成が共有する。
 */
export function curveSegmentControls(
  points: LinePoint[],
  controls?: Record<number, CurveControl>,
): Array<{ c1: LinePoint; c2: LinePoint }> {
  const segs: Array<{ c1: LinePoint; c2: LinePoint }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const ov = controls?.[i];
    if (ov) {
      segs.push({
        c1: { x: p1.x + ov.c1dx, y: p1.y + ov.c1dy },
        c2: { x: p2.x + ov.c2dx, y: p2.y + ov.c2dy },
      });
    } else {
      segs.push({
        c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      });
    }
  }
  return segs;
}

/**
 * ウェイポイント列を通る滑らかな曲線（Catmull-Rom → 三次ベジェ変換）。
 * 端点は必ずウェイポイントを通る。
 */
export function buildCurvePath(
  points: LinePoint[],
  controls?: Record<number, CurveControl>,
): string {
  if (points.length < 2) return '';
  if (points.length === 2 && !controls?.[0]) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  const segs = curveSegmentControls(points, controls);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < segs.length; i++) {
    const { c1, c2 } = segs[i];
    const p2 = points[i + 1];
    d += ` C ${round2(c1.x)} ${round2(c1.y)} ${round2(c2.x)} ${round2(c2.y)} ${p2.x} ${p2.y}`;
  }
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ウェイポイント列から SVG path の d 属性を生成する。
 * 隣接点間は水平 or 垂直のみ。折れ曲がりは二次ベジェで角丸にする。
 */
export function buildLinePath(points: LinePoint[]): string {
  if (points.length < 2) return '';

  // 各セグメントを直交ルーティングに展開
  const expanded = expandOrthogonal(points);
  if (expanded.length < 2) return '';

  const r = CORNER_RADIUS;
  let d = `M ${expanded[0].x} ${expanded[0].y}`;

  for (let i = 1; i < expanded.length; i++) {
    const prev = expanded[i - 1];
    const curr = expanded[i];
    const next = expanded[i + 1];

    if (!next || i === expanded.length - 1) {
      // 最終点はそのまま
      d += ` L ${curr.x} ${curr.y}`;
    } else {
      // 折れ曲がり前に少し手前で止め、Qベジェで丸める
      const d1 = distBetween(prev, curr);
      const d2 = distBetween(curr, next);
      const rr = Math.min(r, d1 / 2, d2 / 2);

      const pre = lerp(curr, prev, rr / d1);
      const post = lerp(curr, next, rr / d2);

      d += ` L ${pre.x} ${pre.y}`;
      d += ` Q ${curr.x} ${curr.y} ${post.x} ${post.y}`;
    }
  }

  return d;
}

/** ウェイポイント間を直交セグメントに展開（折れ線がすでに直交でない場合に L字補間） */
function expandOrthogonal(points: LinePoint[]): LinePoint[] {
  const result: LinePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.x !== curr.x && prev.y !== curr.y) {
      // 水平→垂直 の L字: 中間点を挿入
      result.push({ x: curr.x, y: prev.y });
    }
    result.push(curr);
  }
  return result;
}

function distBetween(a: LinePoint, b: LinePoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function lerp(from: LinePoint, to: LinePoint, dist: number): LinePoint {
  const total = distBetween(from, to);
  const t = dist / total;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** 線分の中点を返す（ラベル配置用） */
export function lineMidpoint(points: LinePoint[]): LinePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const mid = Math.floor(points.length / 2);
  const a = points[mid - 1];
  const b = points[mid];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
