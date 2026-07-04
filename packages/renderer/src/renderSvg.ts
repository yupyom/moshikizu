import type {
  Shape,
  RectShape,
  RoundedRectShape,
  EllipseShape,
  LineShape,
  TextShape,
  SvgShape,
  ImageShape,
  LabelStyle,
  HAlign,
  VAlign,
  MarkerSpec,
} from '@draw/core';
import type { AssetMaster, AssetInstanceShape, TableShape, ChartShape } from '@draw/core';
import { renderChart } from './renderChart';
import {
  buildPath,
  lineMidpoint,
  strokeDashArray,
  markerSpec,
  getUnionBoundingBox,
  getBoundingBox,
  resolveAssetInstance,
  computeTable,
  tableLayout,
} from '@draw/core';

const DEFAULT_PADDING = 16;

export interface RenderSvgOptions {
  /** テキストに使うフォントファミリー名 */
  font: string;
  /** バウンディングボックス外側の余白（デフォルト16px）。viewBox指定時は無視 */
  padding?: number;
  /**
   * Google Fonts の @import を埋め込むか（デフォルトtrue）。
   * canvas経由のPNG化では外部リソースが読み込まれないため false にする。
   */
  fontImport?: boolean;
  /** 背景色。省略時は透明 */
  background?: string;
  /**
   * 描画範囲の明示指定（キャンバスサイズ書き出し等）。
   * 省略時は図形のバウンディングボックス + padding。
   */
  viewBox?: { x: number; y: number; width: number; height: number };
  /**
   * 埋め込むCSS（フォントの data URI @font-face 等）。
   * <style> としてそのまま挿入される。
   */
  embedCss?: string;
  /** アセットマスター（assetInstance の解決に必要） */
  assets?: AssetMaster[];
  /**
   * ドキュメント全体の図形（グラフの表参照の解決に必要）。
   * 省略時は描画対象の shapes から解決（同一キャンバス内参照のみ）
   */
  allShapes?: Shape[];
}

/**
 * Shape[] を自己完結した SVG 文字列に変換する（React/DOM 非依存）。
 * 図形が無く viewBox 指定も無い場合は null。
 *
 * 画面表示のReactコンポーネントとはマーカー定義（markerSpec）・
 * パス生成（buildPath）・破線（strokeDashArray）を共有しており、
 * 書き出し結果は編集画面の見た目と一致する。
 */
export function renderSvg(shapes: Shape[], opts: RenderSvgOptions): string | null {
  let vx: number, vy: number, vw: number, vh: number;
  if (opts.viewBox) {
    vx = round(opts.viewBox.x);
    vy = round(opts.viewBox.y);
    vw = round(opts.viewBox.width);
    vh = round(opts.viewBox.height);
  } else {
    const bb = getUnionBoundingBox(shapes);
    if (!bb) return null;
    const pad = opts.padding ?? DEFAULT_PADDING;
    vx = round(bb.x - pad);
    vy = round(bb.y - pad);
    vw = round(bb.width + pad * 2);
    vh = round(bb.height + pad * 2);
  }

  const parts: string[] = [];

  if (opts.fontImport !== false) {
    const fontName = encodeURIComponent(opts.font);
    parts.push(
      `<style>@import url('https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700&amp;display=swap');</style>`,
    );
  }

  if (opts.embedCss) {
    parts.push(`<style>${opts.embedCss}</style>`);
  }

  if (opts.background) {
    parts.push(el('rect', { x: vx, y: vy, width: vw, height: vh, fill: opts.background }));
  }

  const all = opts.allShapes ?? shapes;
  for (const shape of shapes) {
    parts.push(renderShape(shape, opts.font, opts.assets ?? [], all));
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" ` +
    `viewBox="${vx} ${vy} ${vw} ${vh}">${parts.join('')}</svg>`
  );
}

/** 図形列を<svg>ラッパー無しの断片として描画する（アセットのプレビュー・React側での再利用向け） */
export function renderShapesFragment(shapes: Shape[], font: string, assets: AssetMaster[] = [], allShapes: Shape[] = shapes): string {
  return shapes.map((s) => renderShape(s, font, assets, allShapes)).join('');
}

function renderShape(shape: Shape, font: string, assets: AssetMaster[], allShapes: Shape[] = []): string {
  const body = renderShapeBody(shape, font, assets, allShapes);
  // 回転（線以外）: バウンディングボックス中心基準
  if (shape.rotation && shape.type !== 'line') {
    const bb = getBoundingBox(shape);
    return `<g transform="rotate(${num(shape.rotation)} ${num(bb.x + bb.width / 2)} ${num(bb.y + bb.height / 2)})">${body}</g>`;
  }
  return body;
}

function renderShapeBody(shape: Shape, font: string, assets: AssetMaster[], allShapes: Shape[]): string {
  switch (shape.type) {
    case 'rect': return renderRect(shape, font);
    case 'roundedRect': return renderRoundedRect(shape, font);
    case 'ellipse': return renderEllipse(shape, font);
    case 'line': return renderLine(shape, font);
    case 'text': return renderText(shape, font);
    case 'svg': return renderSvgShape(shape);
    case 'image': return renderImage(shape);
    case 'assetInstance': return renderInstance(shape, font, assets);
    case 'table': return renderTable(shape, font);
    case 'chart': return renderChartShape(shape, font, allShapes);
  }
}

function renderChartShape(s: ChartShape, font: string, allShapes: Shape[]): string {
  const table = allShapes.find((sh): sh is TableShape => sh.type === 'table' && sh.id === s.tableId) ?? null;
  return renderChart(s, table, font);
}

function renderTable(s: TableShape, font: string): string {
  const layout = tableLayout(s.colWidths, s.rowHeights);
  const { display } = computeTable(s.cells, s.formats);
  const rows = s.rowHeights.length;
  const cols = s.colWidths.length;
  const bw = s.borderWidth ?? 1;
  const bc = s.borderColor ?? '#9ca3af';
  const fill = s.headerFill ?? '#eef2f7';
  const fontSize = s.fontSize ?? 13;
  const hr = s.headerRows ?? 0;
  const hc = s.headerCols ?? 0;
  const fr = s.footerRows ?? 0;
  const fc = s.footerCols ?? 0;
  const parts: string[] = [];

  // 背景（全体白 → ヘッダー/フッター塗り）
  parts.push(el('rect', { x: s.x, y: s.y, width: layout.width, height: layout.height, fill: '#ffffff' }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isHead = r < hr || c < hc || r >= rows - fr || c >= cols - fc;
      if (isHead) {
        parts.push(el('rect', {
          x: s.x + layout.colX[c], y: s.y + layout.rowY[r],
          width: s.colWidths[c], height: s.rowHeights[r], fill,
        }));
      }
    }
  }

  // セルテキスト（中央揃え）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = display[r]?.[c] ?? '';
      if (!t) continue;
      const cx = s.x + layout.colX[c] + s.colWidths[c] / 2;
      const cy = s.y + layout.rowY[r] + s.rowHeights[r] / 2;
      const isHead = r < hr || c < hc || r >= rows - fr || c >= cols - fc;
      parts.push(
        `<text x="${num(cx)}" y="${num(cy)}" text-anchor="middle" dominant-baseline="central" ` +
        `font-size="${num(fontSize)}" font-family="${fontFamilyAttr(font)}" ` +
        `font-weight="${isHead ? 700 : 400}" fill="#1a1a1a">${escapeXml(t)}</text>`,
      );
    }
  }

  // 罫線
  for (let c = 0; c <= cols; c++) {
    const x = s.x + layout.colX[c];
    parts.push(el('line', { x1: x, y1: s.y, x2: x, y2: s.y + layout.height, stroke: bc, 'stroke-width': bw }));
  }
  for (let r = 0; r <= rows; r++) {
    const y = s.y + layout.rowY[r];
    parts.push(el('line', { x1: s.x, y1: y, x2: s.x + layout.width, y2: y, stroke: bc, 'stroke-width': bw }));
  }

  return `<g>${parts.join('')}</g>`;
}

function renderInstance(s: AssetInstanceShape, font: string, assets: AssetMaster[]): string {
  const resolved = resolveAssetInstance(s, assets);
  if (!resolved) {
    // マスター欠落時のプレースホルダー
    return el('rect', {
      x: s.x, y: s.y, width: s.width, height: s.height,
      fill: 'none', stroke: '#f59e0b', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    });
  }
  const inner = resolved.shapes.map((sh) => renderShape(sh, font, [], [])).join('');
  return (
    `<g transform="translate(${num(s.x)} ${num(s.y)}) scale(${num(resolved.sx)} ${num(resolved.sy)})">` +
    inner +
    '</g>'
  );
}

// ---- 図形ごとのレンダリング ----

function renderRect(s: RectShape, font: string): string {
  return el('rect', {
    x: s.x, y: s.y, width: s.width, height: s.height,
    fill: s.fillColor,
    ...strokeAttrs(s),
  }) + labelOf(s, s.x, s.y, s.width, s.height, font);
}

function renderRoundedRect(s: RoundedRectShape, font: string): string {
  return el('rect', {
    x: s.x, y: s.y, width: s.width, height: s.height,
    rx: s.cornerRadius, ry: s.cornerRadius,
    fill: s.fillColor,
    ...strokeAttrs(s),
  }) + labelOf(s, s.x, s.y, s.width, s.height, font);
}

function renderEllipse(s: EllipseShape, font: string): string {
  return el('ellipse', {
    cx: s.x + s.width / 2, cy: s.y + s.height / 2,
    rx: s.width / 2, ry: s.height / 2,
    fill: s.fillColor,
    ...strokeAttrs(s),
  }) + labelOf(s, s.x, s.y, s.width, s.height, font);
}

function renderLine(s: LineShape, font: string): string {
  const pathD = buildPath(s.points, s.pathStyle, s.curveControls);
  const size = s.markerSize ?? 1;
  const startId = `marker-start-${s.id}`;
  const endId = `marker-end-${s.id}`;

  const defs: string[] = [];
  const start = markerSpec(s.startMarker, s.strokeColor, size);
  const end = markerSpec(s.endMarker, s.strokeColor, size);
  if (start) defs.push(markerToString(startId, start, true));
  if (end) defs.push(markerToString(endId, end, false));

  const path = el('path', {
    d: pathD,
    fill: 'none',
    stroke: s.strokeColor,
    'stroke-width': s.strokeWidth,
    'stroke-dasharray': strokeDashArray(s.strokeDash, s.strokeWidth),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'marker-start': start ? `url(#${startId})` : undefined,
    'marker-end': end ? `url(#${endId})` : undefined,
  });

  // ラベル（白背景付き）: LineShapeEl と同じ配置
  let label = '';
  if (s.label && s.label.text) {
    const mid = lineMidpoint(s.points);
    const fontSize = s.label.fontSize;
    const labelWidth = Math.max(s.label.text.length * fontSize * 0.65, 40) + 16;
    const lx = mid.x - labelWidth / 2;
    const ly = mid.y - fontSize - 4;
    const lh = fontSize * 1.6;
    label = el('rect', { x: lx, y: ly, width: labelWidth, height: lh, fill: 'white', rx: 2 })
      + renderLabel(s.label, lx, ly, labelWidth, lh, font);
  }

  const defsStr = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  return `<g>${defsStr}${path}${label}</g>`;
}

function renderText(s: TextShape, font: string): string {
  const lines = s.text.split('\n');
  const lineHeight = s.fontSize * (s.lineHeight ?? 1.4);
  const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
  const prefix = (i: number) =>
    s.listStyle === 'bullet' ? `${s.bullet ?? '•'} ` : s.listStyle === 'number' ? `${i + 1}. ` : '';
  const tspans = lines
    .map((line, i) => `<tspan x="${num(s.x)}" dy="${i === 0 ? 0 : num(lineHeight)}">${escapeXml(prefix(i) + line)}</tspan>`)
    .join('');
  return (
    `<text x="${num(s.x)}" y="${num(s.y)}" text-anchor="${anchor}" font-size="${num(s.fontSize)}" ` +
    `font-family="${fontFamilyAttr(font)}" font-weight="${s.fontWeight === 'bold' ? 700 : 400}" ` +
    `fill="${escapeXml(s.color)}">${tspans}</text>`
  );
}

function renderSvgShape(s: SvgShape): string {
  const href = `data:image/svg+xml;base64,${toBase64Utf8(s.svgContent)}`;
  return el('image', { x: s.x, y: s.y, width: s.width, height: s.height, href });
}

function renderImage(s: ImageShape): string {
  if (!s.crop) {
    return el('image', {
      x: s.x, y: s.y, width: s.width, height: s.height,
      href: s.href, preserveAspectRatio: 'none',
    });
  }
  // 非破壊トリミング: nested <svg> の viewBox で切り出す
  const inner = el('image', {
    x: 0, y: 0, width: s.originalWidth, height: s.originalHeight,
    href: s.href, preserveAspectRatio: 'none',
  });
  return (
    `<svg x="${num(s.x)}" y="${num(s.y)}" width="${num(s.width)}" height="${num(s.height)}" ` +
    `viewBox="${num(s.crop.x)} ${num(s.crop.y)} ${num(s.crop.width)} ${num(s.crop.height)}" ` +
    `preserveAspectRatio="none">${inner}</svg>`
  );
}

// ---- ラベル（ShapeLabel と同じ配置ロジック） ----

function hAnchor(h: HAlign): string {
  if (h === 'left') return 'start';
  if (h === 'right') return 'end';
  return 'middle';
}

function xOffset(h: HAlign, width: number): number {
  if (h === 'left') return 8;
  if (h === 'right') return width - 8;
  return width / 2;
}

function yOffset(v: VAlign, height: number, fontSize: number): number {
  if (v === 'top') return fontSize + 4;
  if (v === 'bottom') return height - 4;
  return height / 2;
}

function dominantBaseline(v: VAlign): string {
  return v === 'middle' ? 'central' : 'auto';
}

function renderLabel(label: LabelStyle, x: number, y: number, width: number, height: number, font: string): string {
  const lines = label.text.split('\n');
  const tx = x + xOffset(label.hAlign, width);
  const ty = y + yOffset(label.vAlign, height, label.fontSize);
  const lineHeight = label.fontSize * 1.4;
  const startY = ty - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${num(tx)}" dy="${i === 0 ? 0 : num(lineHeight)}">${escapeXml(line)}</tspan>`)
    .join('');
  return (
    `<text x="${num(tx)}" y="${num(startY)}" text-anchor="${hAnchor(label.hAlign)}" ` +
    `dominant-baseline="${dominantBaseline(label.vAlign)}" font-size="${num(label.fontSize)}" ` +
    `font-family="${fontFamilyAttr(font)}" font-weight="${label.fontWeight === 'bold' ? 700 : 400}" ` +
    `fill="${escapeXml(label.color)}">${tspans}</text>`
  );
}

function labelOf(s: { label?: LabelStyle }, x: number, y: number, w: number, h: number, font: string): string {
  if (!s.label || !s.label.text) return '';
  return renderLabel(s.label, x, y, w, h, font);
}

// ---- ヘルパー ----

function strokeAttrs(s: { strokeColor: string; strokeWidth: number; strokeDash?: RectShape['strokeDash'] }) {
  return {
    stroke: s.strokeColor,
    'stroke-width': s.strokeWidth,
    'stroke-dasharray': strokeDashArray(s.strokeDash, s.strokeWidth),
    'stroke-linecap': 'round',
  };
}

function markerToString(id: string, spec: MarkerSpec, isStart: boolean): string {
  const content = spec.elements
    .map((e) => el(e.tag, e.attrs))
    .join('');
  return (
    `<marker id="${id}" markerWidth="${num(spec.markerWidth)}" markerHeight="${num(spec.markerHeight)}" ` +
    `refX="${num(spec.refX)}" refY="${num(spec.refY)}" ` +
    `orient="${isStart ? 'auto-start-reverse' : 'auto'}" markerUnits="strokeWidth" overflow="visible">` +
    `<g transform="scale(${num(spec.contentScale)})">${content}</g></marker>`
  );
}

/** 属性オブジェクトから自己終了タグを生成（undefined の属性はスキップ） */
function el(tag: string, attrs: Record<string, string | number | undefined>): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? num(v) : escapeXml(v as string)}"`)
    .join(' ');
  return `<${tag} ${attrStr}/>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fontFamilyAttr(font: string): string {
  return escapeXml(`"${font}", sans-serif`);
}

function num(n: number): string {
  return String(round(n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// btoa（ブラウザ）にも Buffer（Node）にも依存しない UTF-8 → base64
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64Utf8(str: string): string {
  const encoded = encodeURIComponent(str);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}
