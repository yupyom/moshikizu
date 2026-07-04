/**
 * Moshikizu MCP サーバー（ヘッドレス stdio 版）
 *
 * .drawjson ファイルを直接読み書きし、エージェント（Claude Code等）が
 * 図の作成・修正・プレビュー確認をできるようにする。
 * アプリを起動せずに動作する。アプリ側はファイル再読込で結果を確認できる。
 *
 * Claude Code への登録例:
 *   claude mcp add moshikizu -- node <repo>/packages/mcp/dist/index.js
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { DrawDocument, Shape } from '@draw/core';
import {
  parseDocument,
  canvasBackgroundColor,
  createDocument,
  docAddShapes,
  docUpdateShape,
  docDeleteShapes,
  docAddCanvas,
  docUpdateCanvas,
} from '@draw/core';
import { renderSvg } from '@draw/renderer';
import { Resvg } from '@resvg/resvg-js';

const DEFAULT_FONT = 'LINE Seed JP';

// ---- ファイルIO ----

async function loadDoc(file: string): Promise<DrawDocument> {
  const text = await readFile(resolve(file), 'utf-8');
  return parseDocument(JSON.parse(text));
}

async function saveDoc(file: string, doc: DrawDocument): Promise<void> {
  await writeFile(resolve(file), JSON.stringify(doc, null, 2), 'utf-8');
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function summarize(doc: DrawDocument) {
  return {
    name: doc.name,
    version: doc.version,
    updatedAt: doc.updatedAt,
    canvases: doc.canvases.map((c) => ({
      id: c.id,
      name: c.name,
      width: c.width,
      height: c.height,
      shapeCount: doc.shapes.filter((s) => s.canvasId === c.id).length,
    })),
  };
}

function renderDoc(doc: DrawDocument, canvasId: string | undefined, fit: boolean): string {
  const canvas = canvasId
    ? doc.canvases.find((c) => c.id === canvasId)
    : doc.canvases[0];
  if (!canvas) throw new Error(`キャンバスが見つかりません: ${canvasId}`);
  const shapes = doc.shapes.filter((s) => s.canvasId === canvas.id);
  const svg = renderSvg(shapes, {
    font: DEFAULT_FONT,
    fontImport: false,
    assets: doc.assets,
    allShapes: doc.shapes,
    ...(fit
      ? {}
      : {
          viewBox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
          background: canvasBackgroundColor(canvas),
        }),
  });
  if (!svg) throw new Error('描画する図形がありません');
  return svg;
}

// ---- 図形仕様の説明（ツール説明に埋め込む） ----

const SHAPE_DOC = `図形(shape)のJSON仕様（type別）:
- rect/roundedRect/ellipse: {type, x, y, width, height, fillColor, strokeColor, strokeWidth, strokeDash?, cornerRadius?(roundedRectのみ), label?}
- line: {type:'line', points:[{x,y},...], strokeColor, strokeWidth, strokeDash?, pathStyle?('orthogonal'|'curve'), startMarker, endMarker('none'|'arrow'|'triangle'|'square'|'circle'|'diamond'|'bar'), markerSize?, label?}
- text: {type:'text', x, y(ベースライン), text, fontSize, fontWeight('regular'|'bold'), color, strokeColor, strokeWidth}
- 共通: strokeDash='solid'|'dashed'|'dotted'|'dashdot'。label={text, fontSize, fontWeight, hAlign('left'|'center'|'right'), vAlign('top'|'middle'|'bottom'), color}
- 座標系: 左上原点・px。キャンバスは通常 1600x900。グリッドは20px単位が望ましい`;

// ---- サーバー ----

const server = new McpServer({ name: 'moshikizu-mcp', version: '0.1.0' });

server.tool(
  'create_document',
  '新しい .drawjson ドキュメントを作成する。既存ファイルは overwrite:true が無い限り上書きしない',
  {
    file: z.string().describe('.drawjson ファイルパス'),
    name: z.string().optional().describe('ドキュメント名'),
    canvasWidth: z.number().optional().describe('キャンバス幅(px)。デフォルト1600'),
    canvasHeight: z.number().optional().describe('キャンバス高さ(px)。デフォルト900'),
    overwrite: z.boolean().optional(),
  },
  async ({ file, name, canvasWidth, canvasHeight, overwrite }) => {
    if (!overwrite) {
      const exists = await access(resolve(file)).then(() => true, () => false);
      if (exists) throw new Error(`既に存在します: ${file}（上書きは overwrite:true）`);
    }
    const doc = createDocument(name ?? '無題', canvasWidth ?? 1600, canvasHeight ?? 900);
    await saveDoc(file, doc);
    return ok(summarize(doc));
  },
);

server.tool(
  'get_document',
  'ドキュメントの概要（名前・キャンバス一覧・図形数）を返す',
  { file: z.string() },
  async ({ file }) => ok(summarize(await loadDoc(file))),
);

server.tool(
  'list_shapes',
  '図形の一覧（完全なJSON）を返す。canvasId 省略時は先頭キャンバス',
  { file: z.string(), canvasId: z.string().optional() },
  async ({ file, canvasId }) => {
    const doc = await loadDoc(file);
    const target = canvasId ?? doc.canvases[0].id;
    return ok(doc.shapes.filter((s) => s.canvasId === target));
  },
);

server.tool(
  'add_shapes',
  `図形を追加する（複数可）。id は自動採番。${SHAPE_DOC}`,
  {
    file: z.string(),
    shapes: z.array(z.record(z.any())).describe('追加する図形の配列'),
    canvasId: z.string().optional().describe('省略時は先頭キャンバス'),
  },
  async ({ file, shapes, canvasId }) => {
    const doc = await loadDoc(file);
    for (const s of shapes) {
      if (typeof s.type !== 'string') throw new Error('各図形に type が必要です');
    }
    const { doc: next, ids } = docAddShapes(doc, shapes as unknown as Shape[], canvasId);
    await saveDoc(file, next);
    return ok({ addedIds: ids, shapeCount: next.shapes.length });
  },
);

server.tool(
  'update_shape',
  `図形を部分更新する（patch は変更するフィールドのみ）。${SHAPE_DOC}`,
  { file: z.string(), id: z.string(), patch: z.record(z.any()) },
  async ({ file, id, patch }) => {
    const doc = await loadDoc(file);
    const next = docUpdateShape(doc, id, patch as Partial<Shape>);
    await saveDoc(file, next);
    return ok(next.shapes.find((s) => s.id === id));
  },
);

server.tool(
  'delete_shapes',
  '図形を削除する',
  { file: z.string(), ids: z.array(z.string()) },
  async ({ file, ids }) => {
    const doc = await loadDoc(file);
    const { doc: next, deleted } = docDeleteShapes(doc, ids);
    await saveDoc(file, next);
    return ok({ deleted, shapeCount: next.shapes.length });
  },
);

server.tool(
  'add_canvas',
  'キャンバス（アートボード）を追加する',
  {
    file: z.string(),
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  },
  async ({ file, name, width, height }) => {
    const doc = await loadDoc(file);
    const { doc: next, canvas } = docAddCanvas(doc, name, width, height);
    await saveDoc(file, next);
    return ok(canvas);
  },
);

server.tool(
  'update_canvas',
  'キャンバスの名前・寸法・背景色(background)を更新する',
  { file: z.string(), id: z.string(), patch: z.record(z.any()) },
  async ({ file, id, patch }) => {
    const doc = await loadDoc(file);
    const next = docUpdateCanvas(doc, id, patch);
    await saveDoc(file, next);
    return ok(next.canvases.find((c) => c.id === id));
  },
);

server.tool(
  'render_svg',
  'キャンバスをSVG文字列としてレンダリングする（fit:trueで内容にフィット）',
  { file: z.string(), canvasId: z.string().optional(), fit: z.boolean().optional() },
  async ({ file, canvasId, fit }) => {
    const doc = await loadDoc(file);
    const svg = renderDoc(doc, canvasId, fit ?? false);
    return { content: [{ type: 'text' as const, text: svg }] };
  },
);

server.tool(
  'render_png',
  'キャンバスをPNG画像としてレンダリングして返す（視覚確認用）。scale省略時は1',
  { file: z.string(), canvasId: z.string().optional(), fit: z.boolean().optional(), scale: z.number().optional() },
  async ({ file, canvasId, fit, scale }) => {
    const doc = await loadDoc(file);
    const svg = renderDoc(doc, canvasId, fit ?? false);
    const png = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: scale ?? 1 },
      font: { loadSystemFonts: true },
    }).render().asPng();
    return {
      content: [{
        type: 'image' as const,
        data: Buffer.from(png).toString('base64'),
        mimeType: 'image/png',
      }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
