// Draw デスクトップシェル（Electron メインプロセス）
//
// - 開発時: `./start.sh` で起動した Vite dev サーバーに接続（--dev）
//   ポートは DRAW_DEV_URL で変更可（デフォルト http://localhost:5173）
// - 本番時: apps/web のビルド成果物（dist/）を file:// で読み込む
// - DRAW_SMOKE=1: ウィンドウを表示せず起動確認だけして終了（CI/検証用）
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
// ---- 更新確認（GitHub Releases） ----
// コード署名なし配布のため autoUpdater は使わず、新版の検知と誘導のみ行う。
// チャンネル: 'main'（安定版・prerelease除外）/ 'dev'（プレリリース含む最新）
const UPDATE_REPO = 'yupyom/moshikizu';

async function checkForUpdate(channel) {
  const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`, {
    headers: { 'User-Agent': 'moshikizu-app', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const releases = await res.json();
  const candidates = releases.filter((r) => !r.draft && (channel === 'dev' || !r.prerelease));
  if (candidates.length === 0) return null;
  const latest = candidates[0];
  const current = app.getVersion();
  const latestVer = String(latest.tag_name || '').replace(/^v/, '');
  return {
    current,
    latest: latestVer,
    isNewer: compareVersions(latestVer, current) > 0,
    url: latest.html_url,
    name: latest.name || latest.tag_name,
  };
}

/** 素朴なsemver比較（1.0.0 > 1.0.0-rc.1 となるようプレリリースを考慮） */
function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pb = String(b).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (x === y) continue;
    if (x === undefined) return typeof y === 'string' ? 1 : -1;
    if (y === undefined) return typeof x === 'string' ? -1 : 1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

const fs = require('node:fs');
const path = require('node:path');
const { startMcpHost } = require('./mcpHost.cjs');

const isDev = process.argv.includes('--dev');
const isSmoke = process.env.DRAW_SMOKE === '1';
// E2E検証用: 指定ポートでMCPホストを強制起動し、ウィンドウ非表示で常駐
const mcpTestPort = process.env.DRAW_MCP_TEST ? Number(process.env.DRAW_MCP_TEST) : null;
const DEV_URL = process.env.DRAW_DEV_URL ?? 'http://localhost:5173';

// ---- レンダラーへのMCPリクエスト転送 ----
let mainWindow = null;
let mcpServer = null;
let reqSeq = 0;
const pendingMcp = new Map();

function callRenderer(op, args) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      reject(new Error('アプリのウィンドウがありません'));
      return;
    }
    const id = ++reqSeq;
    const timer = setTimeout(() => {
      pendingMcp.delete(id);
      reject(new Error('レンダラー応答がタイムアウトしました'));
    }, 15000);
    pendingMcp.set(id, { resolve, reject, timer });
    mainWindow.webContents.send('mcp:req', { id, op, args });
  });
}

ipcMain.on('mcp:res', (_e, msg) => {
  const pending = pendingMcp.get(msg.id);
  if (!pending) return;
  pendingMcp.delete(msg.id);
  clearTimeout(pending.timer);
  if (msg.error) pending.reject(new Error(msg.error));
  else pending.resolve(msg.result);
});

function setMcpHost(enabled, port) {
  if (mcpServer) {
    mcpServer.close();
    mcpServer = null;
  }
  if (enabled) {
    mcpServer = startMcpHost(port, callRenderer);
    console.log(`MCPホスト起動: http://localhost:${port}/mcp`);
  }
}

ipcMain.handle('update:check', async (_e, channel) => {
  try {
    return await checkForUpdate(channel === 'dev' ? 'dev' : 'main');
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.on('mcp:set-host', (_e, { enabled, port }) => {
  if (mcpTestPort) return; // E2Eテスト中は設定からの変更を無視
  try {
    setMcpHost(enabled, port);
  } catch (err) {
    console.error('MCPホスト起動失敗:', err);
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: 'Moshikizu',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    if (isSmoke) {
      console.log('DRAW_SMOKE_OK');
      app.quit();
      return;
    }
    if (mcpTestPort) {
      setMcpHost(true, mcpTestPort);
      console.log('DRAW_MCP_TEST_READY');
      return; // ウィンドウ非表示のまま常駐
    }
    win.show();
  });

  // 外部リンクは既定ブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else if (app.isPackaged) {
    // パッケージ版: ビルド時に renderer/ へコピーされた web アプリを読み込む
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    win.loadFile(path.join(__dirname, '..', 'web', 'dist', 'index.html'));
  }
  return win;
}

// ---- 書類/Moshikizu フォルダ（デフォルト保存先・テンプレート・テーマ置き場） ----
const nfc = (t) => String(t).normalize('NFC');
const DOCS_DIR = () => path.join(app.getPath('documents'), 'Moshikizu');

function ensureDocsDirs() {
  try {
    const root = DOCS_DIR();
    fs.mkdirSync(path.join(root, 'Templates'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Themes'), { recursive: true });
    // 初回のみ同梱サンプルをコピー（発見しやすい場所に置く）
    const dest = path.join(root, 'サンプル');
    if (!fs.existsSync(dest)) {
      const src = [
        path.join(__dirname, 'renderer', 'samples'),
        path.join(__dirname, '..', 'web', 'dist', 'samples'),
        path.join(__dirname, '..', 'web', 'public', 'samples'),
      ].find((d) => fs.existsSync(d));
      if (src) {
        fs.mkdirSync(dest, { recursive: true });
        for (const f of fs.readdirSync(src)) {
          if (f.endsWith('.drawjson')) fs.copyFileSync(path.join(src, f), path.join(dest, f));
        }
      }
    }
  } catch (err) {
    console.error('書類/Moshikizu の初期化に失敗:', err.message);
  }
}

/** 指定サブフォルダの拡張子一致ファイルを [{name, json}] で返す（名前はNFC正規化） */
function listDocsFiles(sub, ext) {
  try {
    const dir = path.join(DOCS_DIR(), sub);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(ext))
      .sort()
      .map((f) => ({
        name: nfc(f.slice(0, -ext.length)),
        json: fs.readFileSync(path.join(dir, f), 'utf-8'),
      }));
  } catch {
    return [];
  }
}

ipcMain.handle('docs:list-templates', () => listDocsFiles('Templates', '.drawjson'));
ipcMain.handle('docs:list-themes', () => listDocsFiles('Themes', '.drawtheme.json'));
ipcMain.handle('docs:path', () => DOCS_DIR());

// メニューはアプリ内メニューバー（レンダラー側）が担うため、OS標準メニューは重複させない。
// - Windows/Linux: ウィンドウ内に出て二重メニューになるため非表示
// - macOS: 画面上部のメニューは残すが、テキスト入力の⌘C/⌘V等が効くよう標準ロールの最小構成に
// - 開発時: リロード・DevTools のため Electron デフォルトメニューをそのまま使う
function setupAppMenu() {
  if (isDev) return;
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
}

app.whenReady().then(() => {
  setupAppMenu();
  ensureDocsDirs();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
