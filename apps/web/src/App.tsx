import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDrawingStore } from './store/drawingStore';
import { useSettingsStore } from './store/settingsStore';
import { MenuBar } from './components/toolbar/MenuBar';
import { Toolbar } from './components/toolbar/Toolbar';
import { DrawingCanvas } from './components/canvas/DrawingCanvas';
import { CanvasBar } from './components/canvas/CanvasBar';
import { PropertyPanel } from './components/toolbar/PropertyPanel';
import { IconLibraryDialog } from './components/dialogs/IconLibraryDialog';
import { WelcomeDialog } from './components/dialogs/WelcomeDialog';
import { AssetsDialog } from './components/dialogs/AssetsDialog';
import { snapPoint } from '@draw/core';
import type { SvgShape, ImageShape, TableShape, ChartShape } from '@draw/core';
import { GuestViewer, InviteAccept } from './components/guest/GuestViewer';
import { ensureFontLink } from './utils/fonts';
import { registerMcpBridge } from './utils/mcpBridge';
import { useServerStore } from './store/serverStore';
import './App.css';

const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 480;

export default function App() {
  // ゲスト共有・招待受諾は独立画面（編集UIを持たない）
  const guestShare = new URLSearchParams(location.search).get('share');
  const inviteToken = new URLSearchParams(location.search).get('invite');
  if (guestShare) return <GuestViewer token={guestShare} />;
  if (inviteToken) return <InviteAccept token={inviteToken} />;
  return <Editor />;
}

function Editor() {
  const store = useDrawingStore();
  const { loadSettings, settings } = useSettingsStore();

  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  // 起動時ダッシュボード（新規テンプレート・最近使ったファイル）
  // ?doc=<URL> 指定時はそのドキュメントを開く（サンプル・共有リンク用）
  const [showWelcome, setShowWelcome] = useState(
    () => !new URLSearchParams(location.search).has('doc'),
  );

  // デスクトップ版: 書類/Moshikizu/Themes の .drawtheme.json を起動時に取込（名前で上書き）
  useEffect(() => {
    if (!window.drawDesktop) return;
    window.drawDesktop.listThemes().then(async (files) => {
      const { parseTheme } = await import('@draw/core');
      const st = useSettingsStore.getState();
      for (const f of files) {
        try {
          st.addTheme(parseTheme(JSON.parse(f.json)));
        } catch {
          console.warn(`テーマ「${f.name}」を取込めませんでした`);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const docUrl = new URLSearchParams(location.search).get('doc');
    if (!docUrl) return;
    fetch(docUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (data) => {
        const { parseDocument } = await import('@draw/core');
        useDrawingStore.getState().loadDocument(parseDocument(data));
      })
      .catch(() => console.warn('ドキュメントを読み込めませんでした:', docUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // プロパティパネルの幅（ドラッグで調整可能・永続化）
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem('draw.panelWidth'));
    return Number.isFinite(saved) && saved >= PANEL_MIN_WIDTH ? Math.min(saved, PANEL_MAX_WIDTH) : 264;
  });
  const panelDrag = useRef<{ startX: number; startW: number } | null>(null);

  const handlePanelResizeStart = (e: React.PointerEvent) => {
    panelDrag.current = { startX: e.clientX, startW: panelWidth };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePanelResizeMove = (e: React.PointerEvent) => {
    const d = panelDrag.current;
    if (!d) return;
    const w = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, d.startW + (d.startX - e.clientX)));
    setPanelWidth(w);
    localStorage.setItem('draw.panelWidth', String(w));
  };
  const handlePanelResizeEnd = () => {
    panelDrag.current = null;
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // 設定フォントを表示用に読み込む
  useEffect(() => {
    ensureFontLink(settings.font);
  }, [settings.font]);

  // デスクトップ版: MCPブリッジ登録とホストON/OFFの反映
  useEffect(() => {
    registerMcpBridge();
  }, []);

  // コラボサーバーの検出（サーバー配下ならファイルメニューにサーバー機能が出る）
  useEffect(() => {
    void useServerStore.getState().probe();
  }, []);
  useEffect(() => {
    window.drawDesktop?.setMcpHost?.(settings.mcpHostEnabled, settings.mcpHostPort);
  }, [settings.mcpHostEnabled, settings.mcpHostPort]);

  // SVGファイル配置ハンドラ
  const handleSvgImport = (content: string, origW: number, origH: number) => {
    const scale = Math.min(300 / origW, 200 / origH, 1);
    const snappedW = snapPoint(origW * scale, 0, settings.gridSize).x;
    const snappedH = snapPoint(origH * scale, 0, settings.gridSize).y;
    const shape: SvgShape = {
      id: uuidv4(),
      type: 'svg',
      x: snapPoint(100, 0, settings.gridSize).x,
      y: snapPoint(100, 0, settings.gridSize).y,
      width: Math.max(snappedW, settings.gridSize),
      height: Math.max(snappedH, settings.gridSize),
      svgContent: content,
      originalWidth: origW,
      originalHeight: origH,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    store.addShape(shape);
    store.setTool('select');
  };

  // アイコン配置ハンドラ（96pxを基準に縦横比を保って配置）
  const handleIconPlace = (svgText: string, viewW: number, viewH: number) => {
    const target = 96;
    const scale = target / Math.max(viewW, viewH);
    const shape: SvgShape = {
      id: uuidv4(),
      type: 'svg',
      x: snapPoint(120, 0, settings.gridSize).x,
      y: snapPoint(120, 0, settings.gridSize).y,
      width: Math.max(Math.round(viewW * scale), settings.gridSize),
      height: Math.max(Math.round(viewH * scale), settings.gridSize),
      svgContent: svgText,
      originalWidth: viewW,
      originalHeight: viewH,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    store.addShape(shape);
    store.setTool('select');
  };

  // 表の挿入（3列×4行、ヘッダー行つき）
  const handleInsertTable = () => {
    const shape: TableShape = {
      id: uuidv4(),
      type: 'table',
      x: snapPoint(140, 0, settings.gridSize).x,
      y: snapPoint(140, 0, settings.gridSize).y,
      colWidths: [140, 120, 120],
      rowHeights: [36, 32, 32, 32],
      cells: [
        ['項目', '値A', '値B'],
        ['', '', ''],
        ['', '', ''],
        ['合計', '=SUM(B2:B3)', '=SUM(C2:C3)'],
      ],
      headerRows: 1,
      footerRows: 1,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    store.addShape(shape);
    store.setTool('select');
  };

  // グラフの挿入（選択中の表、無ければアクティブキャンバスの最初の表を参照）
  const handleInsertChart = () => {
    const st = useDrawingStore.getState();
    const selectedTable = st.shapes.find((s) => st.selectedIds.has(s.id) && s.type === 'table');
    const anyTable = selectedTable ?? st.shapes.find((s) => s.canvasId === st.activeCanvasId && s.type === 'table') ?? st.shapes.find((s) => s.type === 'table');
    if (!anyTable) {
      alert('グラフの参照先になる表がありません。先に「表を挿入」してください。');
      return;
    }
    const shape: ChartShape = {
      id: uuidv4(),
      type: 'chart',
      x: snapPoint(160, 0, settings.gridSize).x,
      y: snapPoint(160, 0, settings.gridSize).y,
      width: 380,
      height: 260,
      chartType: 'bar',
      tableId: anyTable.id,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    store.addShape(shape);
    store.setTool('select');
  };

  // ラスター画像配置ハンドラ（大きすぎる画像は480pxに収めて配置）
  const handleImageImport = (dataUri: string, origW: number, origH: number) => {
    const scale = Math.min(480 / origW, 480 / origH, 1);
    const shape: ImageShape = {
      id: uuidv4(),
      type: 'image',
      x: snapPoint(100, 0, settings.gridSize).x,
      y: snapPoint(100, 0, settings.gridSize).y,
      width: Math.max(Math.round(origW * scale), 10),
      height: Math.max(Math.round(origH * scale), 10),
      href: dataUri,
      originalWidth: origW,
      originalHeight: origH,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    store.addShape(shape);
    store.setTool('select');
  };

  return (
    <div className="app">
      <MenuBar />
      <div className="workspace">
        <Toolbar
          onSvgImport={handleSvgImport}
          onImageImport={handleImageImport}
          onOpenIconLibrary={() => setShowIconLibrary(true)}
          onOpenAssets={() => setShowAssets(true)}
          onInsertTable={handleInsertTable}
          onInsertChart={handleInsertChart}
        />
        <div className="canvas-wrap">
          <div className="canvas-area">
            <DrawingCanvas />
          </div>
          <CanvasBar />
        </div>
        <div
          className="panel-resizer"
          title="ドラッグで幅を調整"
          onPointerDown={handlePanelResizeStart}
          onPointerMove={handlePanelResizeMove}
          onPointerUp={handlePanelResizeEnd}
        />
        <div className="panel-wrap" style={{ width: panelWidth }}>
          <PropertyPanel />
        </div>
      </div>
      {showIconLibrary && (
        <IconLibraryDialog onPlace={handleIconPlace} onClose={() => setShowIconLibrary(false)} />
      )}
      {showAssets && <AssetsDialog onClose={() => setShowAssets(false)} />}
      {showWelcome && <WelcomeDialog onClose={() => setShowWelcome(false)} />}
    </div>
  );
}
