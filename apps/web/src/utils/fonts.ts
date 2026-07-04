import { idbGet, idbSet } from './idbCache';

/**
 * Webフォント（Google Fonts）まわりのユーティリティ。
 *
 * - 表示: <link> 注入でブラウザに読み込ませる（ensureFontLink）
 * - 書き出し: CSSを解析し、使用文字をカバーするサブセットだけを
 *   woff2 data URI として @font-face 埋め込み（buildEmbeddedFontCss）。
 *   SVG→canvas のPNG変換でも正しいフォントで描画される
 * - CSS・woff2 は IndexedDB にキャッシュ（2回目以降はオフラインでも書き出し可）
 */

export interface FontFaceEntry {
  weight: string;
  url: string;
  unicodeRange?: string;
}

/** フォント選択UIの候補（Google Fonts で提供されているもの） */
export const FONT_CHOICES: { group: string; fonts: string[] }[] = [
  {
    group: '日本語 ゴシック',
    fonts: [
      'LINE Seed JP', 'Noto Sans JP', 'M PLUS 1p', 'M PLUS Rounded 1c',
      'Zen Kaku Gothic New', 'BIZ UDPGothic', 'Kosugi Maru', 'Murecho',
    ],
  },
  {
    group: '日本語 明朝・デザイン',
    fonts: [
      'Noto Serif JP', 'Shippori Mincho', 'BIZ UDPMincho', 'Zen Maru Gothic',
      'Kaisei Decol', 'Klee One', 'Yusei Magic', 'DotGothic16',
    ],
  },
  {
    group: '欧文',
    fonts: [
      'Inter', 'Roboto', 'Open Sans', 'Montserrat',
      'Poppins', 'Nunito', 'Source Sans 3', 'Work Sans',
    ],
  },
];

export function isKnownFont(family: string): boolean {
  return FONT_CHOICES.some((g) => g.fonts.includes(family));
}

export function fontCssUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
}

/** 表示用: <link> を注入してブラウザにフォントを読み込ませる（重複注入はしない） */
export function ensureFontLink(family: string): void {
  if (!family) return;
  const id = `draw-font-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = fontCssUrl(family);
  document.head.appendChild(link);
}

/** Google Fonts のCSSを取得（IndexedDBキャッシュ付き） */
export async function fetchFontCss(family: string): Promise<string> {
  const key = `fontcss:${family}`;
  const cached = await idbGet(key);
  if (typeof cached === 'string') return cached;
  const res = await fetch(fontCssUrl(family));
  if (!res.ok) throw new Error(`フォントCSSを取得できません: ${family}`);
  const css = await res.text();
  await idbSet(key, css);
  return css;
}

/** CSS文字列から @font-face 定義を抽出する */
export function parseFontFaces(css: string): FontFaceEntry[] {
  const entries: FontFaceEntry[] = [];
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  for (const block of blocks) {
    const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) continue;
    const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? '400';
    const unicodeRange = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    entries.push({ weight, url, ...(unicodeRange ? { unicodeRange } : {}) });
  }
  return entries;
}

/** unicode-range 文字列をコードポイント範囲の配列に変換する */
export function parseUnicodeRange(range: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const part of range.split(',')) {
    const p = part.trim().replace(/^U\+/i, '');
    if (p.includes('-')) {
      const [a, b] = p.split('-');
      out.push([parseInt(a, 16), parseInt(b, 16)]);
    } else if (p.includes('?')) {
      // ワイルドカード: U+30?? → U+3000-30FF
      out.push([parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)]);
    } else {
      const v = parseInt(p, 16);
      out.push([v, v]);
    }
  }
  return out;
}

/** サブセットの unicode-range がテキスト中のいずれかの文字をカバーするか */
export function rangeCoversText(range: string | undefined, codePoints: Set<number>): boolean {
  if (!range) return true; // range 指定なし = 全文字対象
  const ranges = parseUnicodeRange(range);
  for (const cp of codePoints) {
    for (const [a, b] of ranges) {
      if (cp >= a && cp <= b) return true;
    }
  }
  return false;
}

export function textToCodePoints(text: string): Set<number> {
  const cps = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) cps.add(cp);
  }
  return cps;
}

/** woff2 を取得して data URI にする（IndexedDBキャッシュ付き） */
async function fetchFontDataUri(url: string): Promise<string> {
  const key = `fontbin:${url}`;
  const cached = await idbGet(key);
  let buf: ArrayBuffer;
  if (cached instanceof ArrayBuffer) {
    buf = cached;
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error('フォントデータを取得できません');
    buf = await res.arrayBuffer();
    await idbSet(key, buf);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:font/woff2;base64,${btoa(bin)}`;
}

/**
 * 使用文字をカバーするサブセットだけを data URI 埋め込みの
 * @font-face CSS として生成する。テキストが空なら空文字を返す。
 */
export async function buildEmbeddedFontCss(family: string, text: string): Promise<string> {
  const cps = textToCodePoints(text);
  if (cps.size === 0) return '';
  const css = await fetchFontCss(family);
  const faces = parseFontFaces(css);
  const needed = faces.filter((f) => rangeCoversText(f.unicodeRange, cps));
  const parts: string[] = [];
  for (const f of needed) {
    const dataUri = await fetchFontDataUri(f.url);
    parts.push(
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${f.weight};` +
      `src:url(${dataUri}) format('woff2');${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ''}}`,
    );
  }
  return parts.join('\n');
}
