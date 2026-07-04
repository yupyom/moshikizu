import type { ChartShape, TableShape } from '@draw/core';
import { extractChartData } from '@draw/core';
import type { ChartData } from '@draw/core';

/**
 * グラフ描画（表参照）。折れ線・棒・円・ドーナツ・レーダー・散布図・
 * ウォーターフォールを SVG 文字列で生成する。
 * 散布図は先頭系列をX、以降の系列をYとして扱う。
 * ウォーターフォールは先頭系列のみ（増加=1色目、減少=2色目）。
 */

const DEFAULT_COLORS = ['#4a90d9', '#e86b5f', '#6bbf6b', '#e6c050', '#9b7fd4', '#5bc0be', '#e88bbd', '#8a9aa9'];
const AXIS = '#9ca3af';
const GRID = '#e5e7eb';
const TEXT = '#4b5563';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function txt(x: number, y: number, t: string, size: number, font: string, anchor = 'middle', color = TEXT, weight = 400): string {
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-family="${esc(`"${font}", sans-serif`)}" font-weight="${weight}" fill="${color}">${esc(t)}</text>`;
}

export function renderChart(s: ChartShape, table: TableShape | null, font: string): string {
  if (!table) {
    return `<g><rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" fill="#fffbeb" stroke="#f59e0b" stroke-dasharray="4 3"/>${txt(s.x + s.width / 2, s.y + s.height / 2, '参照先の表がありません', 12, font, 'middle', '#92400e')}</g>`;
  }
  const data = extractChartData(table.cells, table.formats, s.dataRange, s.firstRowIsHeader ?? true, s.firstColIsLabels ?? true);
  const colors = s.colors ?? DEFAULT_COLORS;
  const parts: string[] = [];
  parts.push(`<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" fill="#ffffff" stroke="#e5e7eb"/>`);

  // 凡例（上部）。円系はカテゴリ、それ以外は系列名
  const isPieLike = ['pie', 'donut'].includes(s.chartType);
  const showLegend = (s.showLegend ?? true) && (isPieLike || data.series.length > 1);
  let top = s.y + 8;
  if (showLegend) {
    const labels = isPieLike ? data.categories : data.series.map((se) => se.name);
    top = renderLegend(parts, labels, colors, s, top, font);
  }

  const body = { x: s.x + 44, y: top + 4, w: s.width - 56, h: s.y + s.height - top - 30 };

  switch (s.chartType) {
    case 'pie':
    case 'donut':
      parts.push(renderPie(s, data, colors, font, top));
      break;
    case 'radar':
      parts.push(renderRadar(s, data, colors, font, top));
      break;
    case 'scatter':
      parts.push(renderScatter(body, data, colors, font, parts));
      break;
    case 'waterfall':
      parts.push(renderWaterfall(body, data, colors, font));
      break;
    case 'bar':
    case 'line':
      parts.push(renderAxes(body, data, colors, font, s.chartType));
      break;
  }
  return `<g>${parts.join('')}</g>`;
}

/** 凡例テキストの概算幅（CJKは全角、他は約0.62em） */
function estTextWidth(t: string, size: number): number {
  let w = 0;
  for (const ch of t) {
    w += /[⺀-鿿豈-﫿＀-｠　-〿]/.test(ch) ? size : size * 0.62;
  }
  return w;
}

/** 凡例を描画する。枠の右端で折り返し、消費した高さ分進めた次のY位置を返す */
function renderLegend(parts: string[], labels: string[], colors: string[], s: ChartShape, top: number, font: string): number {
  const left = s.x + 12;
  const right = s.x + s.width - 12;
  const rowH = 16;
  let lx = left;
  let ly = top;
  labels.forEach((label, i) => {
    const itemW = 14 + estTextWidth(label, 10);
    if (lx > left && lx + itemW > right) {
      lx = left;
      ly += rowH;
    }
    parts.push(`<rect x="${n(lx)}" y="${n(ly)}" width="10" height="10" fill="${colors[i % colors.length]}"/>`);
    parts.push(txt(lx + 14, ly + 5, label, 10, font, 'start'));
    lx += itemW + 10;
  });
  return ly + 20;
}

/** Y軸スケール（0基準を含む） */
function yScale(values: number[], h: number): { min: number; max: number; toY: (v: number, y0: number) => number } {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  const pad = (max - min) * 0.05;
  max += pad;
  if (min < 0) min -= pad;
  return { min, max, toY: (v, y0) => y0 + h - ((v - min) / (max - min)) * h };
}

function axesFrame(b: { x: number; y: number; w: number; h: number }, sc: { min: number; max: number; toY: (v: number, y0: number) => number }, font: string): string {
  const parts: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = sc.min + ((sc.max - sc.min) * i) / 4;
    const y = sc.toY(v, b.y);
    parts.push(`<line x1="${n(b.x)}" y1="${n(y)}" x2="${n(b.x + b.w)}" y2="${n(y)}" stroke="${GRID}"/>`);
    parts.push(txt(b.x - 6, y, formatTick(v), 9, font, 'end'));
  }
  parts.push(`<line x1="${n(b.x)}" y1="${n(b.y)}" x2="${n(b.x)}" y2="${n(b.y + b.h)}" stroke="${AXIS}"/>`);
  parts.push(`<line x1="${n(b.x)}" y1="${n(sc.toY(Math.max(sc.min, 0), b.y))}" x2="${n(b.x + b.w)}" y2="${n(sc.toY(Math.max(sc.min, 0), b.y))}" stroke="${AXIS}"/>`);
  return parts.join('');
}

function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000000) return `${Math.round(v / 100000) / 10}M`;
  if (a >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 100) / 100);
}

function renderAxes(b: { x: number; y: number; w: number; h: number }, data: ChartData, colors: string[], font: string, kind: 'bar' | 'line'): string {
  const all = data.series.flatMap((se) => se.values);
  const sc = yScale(all, b.h);
  const parts: string[] = [axesFrame(b, sc, font)];
  const nCat = Math.max(1, data.categories.length);
  const slot = b.w / nCat;

  data.categories.forEach((c, i) => {
    parts.push(txt(b.x + slot * i + slot / 2, b.y + b.h + 12, c, 9, font));
  });

  if (kind === 'bar') {
    const nS = data.series.length;
    const barW = Math.min(28, (slot * 0.7) / Math.max(1, nS));
    const y0 = sc.toY(Math.max(sc.min, 0), b.y);
    data.series.forEach((se, si) => {
      se.values.forEach((v, i) => {
        const cx = b.x + slot * i + slot / 2;
        const x = cx - (barW * nS) / 2 + barW * si;
        const y = sc.toY(v, b.y);
        parts.push(`<rect x="${n(x)}" y="${n(Math.min(y, y0))}" width="${n(barW)}" height="${n(Math.abs(y0 - y))}" fill="${colors[si % colors.length]}"/>`);
      });
    });
  } else {
    data.series.forEach((se, si) => {
      const pts = se.values.map((v, i) => `${n(b.x + slot * i + slot / 2)},${n(sc.toY(v, b.y))}`).join(' ');
      parts.push(`<polyline points="${pts}" fill="none" stroke="${colors[si % colors.length]}" stroke-width="2" stroke-linejoin="round"/>`);
      se.values.forEach((v, i) => {
        parts.push(`<circle cx="${n(b.x + slot * i + slot / 2)}" cy="${n(sc.toY(v, b.y))}" r="3" fill="${colors[si % colors.length]}"/>`);
      });
    });
  }
  return parts.join('');
}

function renderPie(s: ChartShape, data: ChartData, colors: string[], font: string, top: number): string {
  const values = data.series[0]?.values ?? [];
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return txt(s.x + s.width / 2, s.y + s.height / 2, 'データがありません', 11, font);
  const cx = s.x + s.width / 2;
  const cy = top + (s.y + s.height - top) / 2;
  const R = Math.min(s.width, s.y + s.height - top) / 2 - 16;
  const r0 = s.chartType === 'donut' ? R * 0.55 : 0;
  const parts: string[] = [];
  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    const frac = Math.max(0, v) / total;
    if (frac <= 0) return;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p1 = [cx + R * Math.cos(angle), cy + R * Math.sin(angle)];
    const p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
    if (r0 > 0) {
      const q1 = [cx + r0 * Math.cos(a2), cy + r0 * Math.sin(a2)];
      const q2 = [cx + r0 * Math.cos(angle), cy + r0 * Math.sin(angle)];
      parts.push(`<path d="M ${n(p1[0])} ${n(p1[1])} A ${n(R)} ${n(R)} 0 ${large} 1 ${n(p2[0])} ${n(p2[1])} L ${n(q1[0])} ${n(q1[1])} A ${n(r0)} ${n(r0)} 0 ${large} 0 ${n(q2[0])} ${n(q2[1])} Z" fill="${colors[i % colors.length]}" stroke="#fff"/>`);
    } else {
      parts.push(`<path d="M ${n(cx)} ${n(cy)} L ${n(p1[0])} ${n(p1[1])} A ${n(R)} ${n(R)} 0 ${large} 1 ${n(p2[0])} ${n(p2[1])} Z" fill="${colors[i % colors.length]}" stroke="#fff"/>`);
    }
    // パーセントラベル
    const mid = (angle + a2) / 2;
    const lr = r0 > 0 ? (R + r0) / 2 : R * 0.66;
    if (frac >= 0.06) {
      parts.push(txt(cx + lr * Math.cos(mid), cy + lr * Math.sin(mid), `${Math.round(frac * 100)}%`, 10, font, 'middle', '#fff', 700));
    }
    angle = a2;
  });
  return parts.join('');
}

function renderRadar(s: ChartShape, data: ChartData, colors: string[], font: string, top: number): string {
  const nAxes = data.categories.length;
  if (nAxes < 3) return txt(s.x + s.width / 2, s.y + s.height / 2, 'レーダーは3カテゴリ以上必要です', 11, font);
  const cx = s.x + s.width / 2;
  const cy = top + (s.y + s.height - top) / 2;
  const R = Math.min(s.width, s.y + s.height - top) / 2 - 24;
  const max = Math.max(1, ...data.series.flatMap((se) => se.values));
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / nAxes;
  const parts: string[] = [];
  // 目盛りリング + 軸
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (R * ring) / 4;
    const pts = data.categories.map((_, i) => `${n(cx + rr * Math.cos(angle(i)))},${n(cy + rr * Math.sin(angle(i)))}`).join(' ');
    parts.push(`<polygon points="${pts}" fill="none" stroke="${GRID}"/>`);
  }
  data.categories.forEach((c, i) => {
    parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx + R * Math.cos(angle(i)))}" y2="${n(cy + R * Math.sin(angle(i)))}" stroke="${GRID}"/>`);
    parts.push(txt(cx + (R + 12) * Math.cos(angle(i)), cy + (R + 12) * Math.sin(angle(i)), c, 9, font));
  });
  data.series.forEach((se, si) => {
    const pts = se.values.map((v, i) => {
      const rr = (Math.max(0, v) / max) * R;
      return `${n(cx + rr * Math.cos(angle(i)))},${n(cy + rr * Math.sin(angle(i)))}`;
    }).join(' ');
    const col = colors[si % colors.length];
    parts.push(`<polygon points="${pts}" fill="${col}" fill-opacity="0.15" stroke="${col}" stroke-width="2"/>`);
  });
  return parts.join('');
}

function renderScatter(b: { x: number; y: number; w: number; h: number }, data: ChartData, colors: string[], font: string, _parts: string[]): string {
  if (data.series.length < 2) return txt(b.x + b.w / 2, b.y + b.h / 2, '散布図は2系列（X列+Y列）必要です', 11, font);
  const xs = data.series[0].values;
  const parts: string[] = [];
  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  if (xmin === xmax) xmax = xmin + 1;
  const ally = data.series.slice(1).flatMap((se) => se.values);
  const sc = yScale(ally, b.h);
  parts.push(axesFrame(b, sc, font));
  const toX = (v: number) => b.x + ((v - xmin) / (xmax - xmin)) * b.w;
  data.series.slice(1).forEach((se, si) => {
    se.values.forEach((v, i) => {
      parts.push(`<circle cx="${n(toX(xs[i] ?? 0))}" cy="${n(sc.toY(v, b.y))}" r="4" fill="${colors[(si + 1) % colors.length]}" fill-opacity="0.85"/>`);
    });
  });
  parts.push(txt(b.x + b.w / 2, b.y + b.h + 12, data.series[0].name, 9, font));
  return parts.join('');
}

function renderWaterfall(b: { x: number; y: number; w: number; h: number }, data: ChartData, colors: string[], font: string): string {
  const values = data.series[0]?.values ?? [];
  if (values.length === 0) return txt(b.x + b.w / 2, b.y + b.h / 2, 'データがありません', 11, font);
  // 累積の推移でスケールを決める
  const cum: number[] = [];
  let run = 0;
  for (const v of values) { run += v; cum.push(run); }
  const sc = yScale([0, ...cum], b.h);
  const parts: string[] = [axesFrame(b, sc, font)];
  const slot = b.w / values.length;
  const barW = Math.min(40, slot * 0.6);
  let prev = 0;
  values.forEach((v, i) => {
    const cur = prev + v;
    const y1 = sc.toY(prev, b.y);
    const y2 = sc.toY(cur, b.y);
    const col = v >= 0 ? colors[0] : colors[1];
    const cx = b.x + slot * i + slot / 2;
    parts.push(`<rect x="${n(cx - barW / 2)}" y="${n(Math.min(y1, y2))}" width="${n(barW)}" height="${n(Math.max(1, Math.abs(y1 - y2)))}" fill="${col}"/>`);
    if (i < values.length - 1) {
      parts.push(`<line x1="${n(cx + barW / 2)}" y1="${n(y2)}" x2="${n(cx + slot)}" y2="${n(y2)}" stroke="${AXIS}" stroke-dasharray="3 2"/>`);
    }
    parts.push(txt(cx, b.y + b.h + 12, data.categories[i] ?? '', 9, font));
    prev = cur;
  });
  return parts.join('');
}
