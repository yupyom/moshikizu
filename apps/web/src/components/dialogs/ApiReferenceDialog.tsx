import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

const TOOLS: { name: string; args: string; desc: string }[] = [
  { name: 'create_document', args: 'file, name?, canvasWidth?, canvasHeight?, overwrite?', desc: '新規 .drawjson を作成' },
  { name: 'get_document', args: 'file', desc: '概要（キャンバス一覧・図形数）' },
  { name: 'list_shapes', args: 'file, canvasId?', desc: '図形一覧（完全なJSON）' },
  { name: 'add_shapes', args: 'file, shapes[], canvasId?', desc: '図形を一括追加（id自動採番）' },
  { name: 'update_shape', args: 'file, id, patch', desc: '図形の部分更新' },
  { name: 'delete_shapes', args: 'file, ids[]', desc: '図形の削除' },
  { name: 'add_canvas', args: 'file, name?, width?, height?', desc: 'キャンバス追加' },
  { name: 'update_canvas', args: 'file, id, patch', desc: 'キャンバス更新（名前・寸法・background）' },
  { name: 'render_svg', args: 'file, canvasId?, fit?', desc: 'SVG文字列でレンダリング' },
  { name: 'render_png', args: 'file, canvasId?, fit?, scale?', desc: 'PNG画像でレンダリング（視覚確認用）' },
];

const SHAPE_SPEC = `図形(shape)のJSON仕様:
  rect / roundedRect / ellipse:
    {type, x, y, width, height, fillColor, strokeColor,
     strokeWidth, strokeDash?, cornerRadius?, label?}
  line:
    {type:'line', points:[{x,y},...], strokeColor, strokeWidth,
     strokeDash?, pathStyle?('orthogonal'|'curve'),
     startMarker, endMarker: 'none'|'arrow'|'triangle'|'square'
       |'circle'|'diamond'|'bar', markerSize?, label?}
  text:
    {type:'text', x, y(ベースライン), text, fontSize,
     fontWeight('regular'|'bold'), color}
  共通:
    strokeDash = 'solid'|'dashed'|'dotted'|'dashdot'
    label = {text, fontSize, fontWeight, hAlign, vAlign, color}
    座標系は左上原点(px)。キャンバスは通常 1600x900`;

const PYTHON_SAMPLE = `import json, subprocess

proc = subprocess.Popen(
    ["node", "<リポジトリ>/packages/mcp/dist/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

def rpc(id, method, params):
    proc.stdin.write(json.dumps(
        {"jsonrpc": "2.0", "id": id,
         "method": method, "params": params}) + "\\n")
    proc.stdin.flush()
    while True:
        msg = json.loads(proc.stdout.readline())
        if msg.get("id") == id:
            return msg

rpc(1, "initialize", {
    "protocolVersion": "2024-11-05", "capabilities": {},
    "clientInfo": {"name": "py", "version": "0"}})
proc.stdin.write(json.dumps(
    {"jsonrpc": "2.0",
     "method": "notifications/initialized"}) + "\\n")
proc.stdin.flush()

rpc(2, "tools/call", {"name": "create_document",
    "arguments": {"file": "demo.drawjson", "overwrite": True}})
rpc(3, "tools/call", {"name": "add_shapes",
    "arguments": {"file": "demo.drawjson", "shapes": [
        {"type": "roundedRect", "x": 100, "y": 100,
         "width": 240, "height": 120, "cornerRadius": 12,
         "fillColor": "#eef4fb", "strokeColor": "#4a90d9",
         "strokeWidth": 2,
         "label": {"text": "サーバー", "fontSize": 16,
                   "fontWeight": "bold", "hAlign": "center",
                   "vAlign": "middle", "color": "#1a1a1a"}}]}})`;

const codeStyle: React.CSSProperties = {
  background: '#f6f8fa',
  color: '#1f2937',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'pre',
  overflowX: 'auto',
  lineHeight: 1.55,
};

const h3Style: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#111827', margin: '6px 0 2px' };

export function ApiReferenceDialog({ onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 660, maxHeight: '84vh', overflowY: 'auto' }}
      >
        <h2 className={styles.title}>MCP / API リファレンス</h2>
        <p style={{ fontSize: 14, color: '#333', margin: 0 }}>
          Moshikizu は MCP（Model Context Protocol）サーバーを同梱しており、Claude Code などの
          エージェントや自作プログラムから .drawjson の作成・編集・レンダリングができます。
        </p>

        <h3 style={h3Style}>Claude Code への登録</h3>
        <div style={codeStyle}>claude mcp add moshikizu -- node &lt;リポジトリ&gt;/packages/mcp/dist/index.js</div>

        <h3 style={h3Style}>ツール一覧</h3>
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {TOOLS.map((t) => (
              <tr key={t.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#2563eb', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{t.name}</td>
                <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#666', verticalAlign: 'top' }}>{t.args}</td>
                <td style={{ padding: '4px 8px', color: '#333' }}>{t.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={h3Style}>図形のJSON仕様</h3>
        <div style={codeStyle}>{SHAPE_SPEC}</div>

        <h3 style={h3Style}>Python から直接使う（JSON-RPC over stdio）</h3>
        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
          メッセージは改行区切りのJSON-RPC 2.0。initialize → notifications/initialized の後に tools/call を送ります。
        </p>
        <div style={codeStyle}>{PYTHON_SAMPLE}</div>

        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
