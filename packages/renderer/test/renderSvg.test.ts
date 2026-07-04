import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/renderSvg';
import type { LineShape, RectShape, TextShape, SvgShape, Shape } from '@draw/core';

const rect: RectShape = {
  id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 60,
  fillColor: '#ffffff', strokeColor: '#1a1a1a', strokeWidth: 2,
};

const line: LineShape = {
  id: 'l1', type: 'line',
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
  strokeColor: '#1a1a1a', strokeWidth: 2,
  startMarker: 'none', endMarker: 'arrow',
};

const OPTS = { font: 'LINE Seed JP' };

describe('renderSvg', () => {
  it('図形が無ければ null', () => {
    expect(renderSvg([], OPTS)).toBeNull();
  });

  it('viewBox はバウンディングボックス + パディング16px', () => {
    const svg = renderSvg([rect], OPTS)!;
    expect(svg).toContain('viewBox="-16 -16 132 92"');
    expect(svg).toContain('width="132"');
    expect(svg).toContain('height="92"');
  });

  it('デフォルトで Google Fonts の @import を含む（& はエスケープ）', () => {
    const svg = renderSvg([rect], OPTS)!;
    expect(svg).toContain('@import');
    expect(svg).toContain('&amp;display=swap');
  });

  it('fontImport: false なら @import を含まない', () => {
    const svg = renderSvg([rect], { ...OPTS, fontImport: false })!;
    expect(svg).not.toContain('@import');
  });

  it('矩形: 破線と塗りが反映される', () => {
    const svg = renderSvg([{ ...rect, strokeDash: 'dashed' }], OPTS)!;
    expect(svg).toContain('stroke-dasharray="8 5"');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('線: マーカー定義と参照、曲線パスが入る', () => {
    const svg = renderSvg([{ ...line, pathStyle: 'curve', markerSize: 2 }], OPTS)!;
    expect(svg).toContain('<marker id="marker-end-l1"');
    expect(svg).toContain('marker-end="url(#marker-end-l1)"');
    expect(svg).toContain('markerWidth="10"'); // (3+2) * size2
    expect(svg).toMatch(/d="M 0 0 C /);
    expect(svg).not.toContain('marker-start='); // startMarker: none
  });

  it('ラベル: 図形中央に配置され、改行が tspan になる', () => {
    const labeled: RectShape = {
      ...rect,
      label: { text: 'A\nB', fontSize: 14, fontWeight: 'bold', hAlign: 'center', vAlign: 'middle', color: '#333333' },
    };
    const svg = renderSvg([labeled], OPTS)!;
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('dominant-baseline="central"');
    expect(svg).toContain('font-weight="700"');
    expect((svg.match(/<tspan/g) ?? []).length).toBe(2);
  });

  it('テキスト: XML特殊文字がエスケープされる', () => {
    const text: TextShape = {
      id: 't1', type: 'text', x: 10, y: 20, text: 'a < b & c',
      fontSize: 14, fontWeight: 'regular', color: '#000000',
      strokeColor: '#000000', strokeWidth: 1,
    };
    const svg = renderSvg([text], OPTS)!;
    expect(svg).toContain('a &lt; b &amp; c');
  });

  it('SVG配置: base64 の data URI になる（日本語も可）', () => {
    const svgShape: SvgShape = {
      id: 's1', type: 'svg', x: 0, y: 0, width: 50, height: 50,
      svgContent: '<svg xmlns="http://www.w3.org/2000/svg"><title>アイコン</title></svg>',
      originalWidth: 50, originalHeight: 50,
      strokeColor: 'transparent', strokeWidth: 0,
    };
    const svg = renderSvg([svgShape], OPTS)!;
    const m = svg.match(/href="data:image\/svg\+xml;base64,([^"]+)"/);
    expect(m).not.toBeNull();
    // Node 側で復号して往復一致を確認
    const decoded = Buffer.from(m![1], 'base64').toString('utf-8');
    expect(decoded).toBe(svgShape.svgContent);
  });

  it('viewBox 指定でキャンバスサイズ書き出しができる（padding無視・図形0でも可）', () => {
    const svg = renderSvg([rect], { ...OPTS, viewBox: { x: 0, y: 0, width: 1600, height: 900 } })!;
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).toContain('width="1600"');
    const empty = renderSvg([], { ...OPTS, viewBox: { x: 0, y: 0, width: 100, height: 100 }, background: '#fff' })!;
    expect(empty).toContain('viewBox="0 0 100 100"');
    expect(empty).toContain('fill="#fff"');
  });

  it('ラスター画像: data URI と非破壊トリミング（crop）が反映される', () => {
    const img = {
      id: 'i1', type: 'image' as const, x: 10, y: 10, width: 80, height: 60,
      href: 'data:image/png;base64,AAAA', originalWidth: 800, originalHeight: 600,
      strokeColor: 'transparent', strokeWidth: 0,
    };
    const plain = renderSvg([img], OPTS)!;
    expect(plain).toContain('href="data:image/png;base64,AAAA"');
    expect(plain).not.toContain('viewBox="100 50');

    const cropped = renderSvg([{ ...img, crop: { x: 100, y: 50, width: 400, height: 300 } }], OPTS)!;
    expect(cropped).toContain('viewBox="100 50 400 300"');
    expect(cropped).toContain('width="800"'); // 内側は元画像サイズ
  });

  it('背景色を指定できる', () => {
    const svg = renderSvg([rect], { ...OPTS, background: '#ffffff' })!;
    expect(svg).toContain('<rect x="-16" y="-16" width="132" height="92" fill="#ffffff"/>');
  });

  it('複数図形が順に描画される（後の図形が上）', () => {
    const shapes: Shape[] = [rect, line];
    const svg = renderSvg(shapes, OPTS)!;
    const rectPos = svg.indexOf('<rect x="0"');
    const linePos = svg.indexOf('<path');
    expect(rectPos).toBeGreaterThan(-1);
    expect(linePos).toBeGreaterThan(rectPos);
  });
});
