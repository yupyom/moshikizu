// レンダラーに公開するブリッジ。
// - MCPホスト（main側）からのツール呼び出しをレンダラーへ転送し、結果を返す
// - 環境設定からのMCPホストON/OFF
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drawDesktop', {
  /** 書類/Moshikizu/Templates の .drawjson 一覧 */
  listTemplates: () => ipcRenderer.invoke('docs:list-templates'),
  /** 書類/Moshikizu/Themes の .drawtheme.json 一覧 */
  listThemes: () => ipcRenderer.invoke('docs:list-themes'),
  /** 書類/Moshikizu の絶対パス */
  getDocsPath: () => ipcRenderer.invoke('docs:path'),
  /** 更新確認（channel: 'main' | 'dev'）。結果 or {error} を返す */
  checkUpdate: (channel) => ipcRenderer.invoke('update:check', channel),
  platform: process.platform,
  electronVersion: process.versions.electron,

  /** MCPツール呼び出しの受信ハンドラを登録する */
  onMcpRequest: (callback) => {
    ipcRenderer.on('mcp:req', (_event, msg) => callback(msg));
  },
  /** MCPツール呼び出しの結果を返す */
  sendMcpResponse: (msg) => {
    ipcRenderer.send('mcp:res', msg);
  },
  /** MCPホストの起動/停止（環境設定から） */
  setMcpHost: (enabled, port) => {
    ipcRenderer.send('mcp:set-host', { enabled, port });
  },
});
