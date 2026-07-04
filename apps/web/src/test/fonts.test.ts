import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseFontFaces,
  parseUnicodeRange,
  rangeCoversText,
  textToCodePoints,
  buildEmbeddedFontCss,
} from '../utils/fonts';

const SAMPLE_CSS = `
/* latin */
@font-face {
  font-family: 'Test';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+2000-206F;
}
/* jp */
@font-face {
  font-family: 'Test';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/jp.woff2) format('woff2');
  unicode-range: U+3040-30FF, U+4E00-9FFF;
}
`;

describe('parseFontFaces', () => {
  it('@font-face から weight・url・unicode-range を抽出する', () => {
    const faces = parseFontFaces(SAMPLE_CSS);
    expect(faces).toHaveLength(2);
    expect(faces[0].weight).toBe('400');
    expect(faces[0].url).toBe('https://fonts.gstatic.com/latin.woff2');
    expect(faces[0].unicodeRange).toContain('U+0000-00FF');
    expect(faces[1].weight).toBe('700');
  });
});

describe('parseUnicodeRange', () => {
  it('範囲・単一値・ワイルドカードを解釈する', () => {
    expect(parseUnicodeRange('U+0000-00FF')).toEqual([[0x0, 0xff]]);
    expect(parseUnicodeRange('U+2A00')).toEqual([[0x2a00, 0x2a00]]);
    expect(parseUnicodeRange('U+30??')).toEqual([[0x3000, 0x30ff]]);
    expect(parseUnicodeRange('U+41, U+50-5A')).toEqual([[0x41, 0x41], [0x50, 0x5a]]);
  });
});

describe('rangeCoversText', () => {
  it('テキストの文字がrangeに含まれるか判定する', () => {
    const jp = textToCodePoints('こんにちは');
    const en = textToCodePoints('Hello');
    expect(rangeCoversText('U+3040-30FF', jp)).toBe(true);
    expect(rangeCoversText('U+3040-30FF', en)).toBe(false);
    expect(rangeCoversText('U+0000-00FF', en)).toBe(true);
    expect(rangeCoversText(undefined, en)).toBe(true); // range無し=全対象
  });
});

describe('buildEmbeddedFontCss', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('使用文字をカバーするサブセットだけを data URI で埋め込む', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => ({
      ok: true,
      text: async () => SAMPLE_CSS,
      arrayBuffer: async () => new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer,
    })) as unknown as typeof fetch);

    const css = await buildEmbeddedFontCss('Test', 'こんにちは');
    // jpサブセットのみ（latinは不要）
    expect(css).toContain("font-family:'Test'");
    expect(css).toContain('font-weight:700');
    expect(css).not.toContain('font-weight:400');
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).toContain('unicode-range:U+3040-30FF');
  });

  it('テキストが空なら空文字', async () => {
    expect(await buildEmbeddedFontCss('Test', '')).toBe('');
  });
});
