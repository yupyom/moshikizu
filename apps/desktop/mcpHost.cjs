// アプリ内MCPホスト（Streamable HTTP / localhost限定）
//
// ツール呼び出しは IPC でレンダラーに転送し、開いているドキュメントを
// 直接編集する（undo対応・画面に即時反映）。ステートレス方式:
// リクエストごとに McpServer + Transport を生成する。
//
// Claude Code への登録例:
//   claude mcp add moshikizu-app --transport http http://localhost:8930/mcp
const http = require('node:http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const SHAPE_DOC = `図形JSON: rect/roundedRect/ellipse={type,x,y,width,height,fillColor,strokeColor,strokeWidth,strokeDash?,cornerRadius?,label?} / line={type,points:[{x,y}..],strokeColor,strokeWidth,strokeDash?,pathStyle?,startMarker,endMarker,markerSize?,label?}（marker: none|arrow|triangle|square|circle|diamond|bar）/ text={type,x,y,text,fontSize,fontWeight,color}。strokeDash=solid|dashed|dotted|dashdot。label={text,fontSize,fontWeight,hAlign,vAlign,color}。座標は左上原点px`;

/** @param {(op: string, args: object) => Promise<any>} callRenderer */
function buildServer(callRenderer) {
  const server = new McpServer({ name: 'moshikizu-app', version: '0.1.0' });

  const text = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const tool = (name, desc, schema, wrap) =>
    server.tool(name, desc, schema, async (args) => {
      const result = await callRenderer(name, args ?? {});
      return wrap ? wrap(result) : text(result);
    });

  tool('get_document', '開いているドキュメントの概要（キャンバス一覧・図形数・アクティブキャンバス）', {});
  tool('list_shapes', '図形一覧。canvasId省略時はアクティブキャンバス', { canvasId: z.string().optional() });
  tool('add_shapes', `図形を追加（開いているドキュメントに即反映・undo可）。${SHAPE_DOC}`, {
    shapes: z.array(z.record(z.any())),
    canvasId: z.string().optional(),
  });
  tool('update_shape', `図形の部分更新。${SHAPE_DOC}`, { id: z.string(), patch: z.record(z.any()) });
  tool('delete_shapes', '図形を削除', { ids: z.array(z.string()) });
  tool('add_canvas', 'キャンバスを追加', {
    name: z.string().optional(), width: z.number().optional(), height: z.number().optional(),
  });
  tool('update_canvas', 'キャンバス更新（name/width/height/background。background="transparent"可）', {
    id: z.string(), patch: z.record(z.any()),
  });
  tool('render_svg', 'キャンバスをSVGでレンダリング', {
    canvasId: z.string().optional(), fit: z.boolean().optional(),
  }, (r) => ({ content: [{ type: 'text', text: r.svg }] }));
  tool('render_png', 'キャンバスをPNG画像でレンダリング（正しいWebフォントで描画される）', {
    canvasId: z.string().optional(), fit: z.boolean().optional(), scale: z.number().optional(),
  }, (r) => ({ content: [{ type: 'image', data: r.pngBase64, mimeType: 'image/png' }] }));

  return server;
}

/**
 * MCPホストを起動する。
 * @param {number} port
 * @param {(op: string, args: object) => Promise<any>} callRenderer
 * @returns {import('node:http').Server}
 */
function startMcpHost(port, callRenderer) {
  const httpServer = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith('/mcp')) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const server = buildServer(callRenderer);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => {
          transport.close();
          server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      }
    });
  });
  httpServer.listen(port, '127.0.0.1');
  return httpServer;
}

module.exports = { startMcpHost };
