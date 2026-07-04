import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DrawDocument, Shape } from '@draw/core';
import { DOCUMENT_VERSION, parseDocument, canvasBackgroundColor, substitutePageVars, parsePageRanges } from '@draw/core';
import type { Canvas } from '@draw/core';
import { renderSvg } from '@draw/renderer';
import { useDrawingStore } from '../../store/drawingStore';
import { useSettingsStore } from '../../store/settingsStore';
import { downloadSvg, downloadBlob } from '../../utils/download';
import { svgToPngBlob } from '../../utils/exportPng';
import { buildPdfFromSvgPages } from '../../utils/exportPdf';
import { buildEmbeddedFontCss } from '../../utils/fonts';
import { addRecentFile } from '../../utils/recentFiles';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { SearchReplaceDialog } from '../dialogs/SearchReplaceDialog';
import { ShortcutsDialog } from '../dialogs/ShortcutsDialog';
import { ApiReferenceDialog } from '../dialogs/ApiReferenceDialog';
import { LoginDialog } from '../dialogs/LoginDialog';
import { ServerProjectsDialog } from '../dialogs/ServerProjectsDialog';
import { CommentsDialog } from '../dialogs/CommentsDialog';
import { TotpSetupDialog } from '../dialogs/TotpSetupDialog';
import { useServerStore } from '../../store/serverStore';
import styles from './MenuBar.module.css';

const APP_VERSION = '0.1.0';

const FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'Moshikizu ドキュメント', accept: { 'application/json': ['.drawjson'] } },
];

type MenuName = 'file' | 'edit' | 'view' | 'export' | 'help';

interface MenuItemProps {
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ label, icon, shortcut, disabled, onClick }: MenuItemProps) {
  return (
    <button className={styles.dropItem} disabled={disabled} onClick={onClick}>
      {icon && <span className="material-icons" style={{ fontSize: 16 }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span className={styles.shortcutHint}>{shortcut}</span>}
    </button>
  );
}

export function MenuBar() {
  const store = useDrawingStore();
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showApiRef, setShowApiRef] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showServerProjects, setShowServerProjects] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const server = useServerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // File System Access API の保存先ハンドル（「保存」で同じファイルに上書きする）
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  // 外部変更検知（MCP等によるファイル編集をアプリに反映するため）
  const [externalChange, setExternalChange] = useState(false);
  const lastModifiedRef = useRef<number | null>(null);

  const rememberModified = async (handle: FileSystemFileHandle | null) => {
    if (!handle) {
      lastModifiedRef.current = null;
      return;
    }
    try {
      lastModifiedRef.current = (await handle.getFile()).lastModified;
    } catch {
      lastModifiedRef.current = null;
    }
  };

  // 保存先ファイルの外部変更をポーリング検知（2秒間隔）
  useEffect(() => {
    const timer = setInterval(async () => {
      const handle = fileHandleRef.current;
      if (!handle || lastModifiedRef.current === null) return;
      try {
        const f = await handle.getFile();
        if (f.lastModified > lastModifiedRef.current) setExternalChange(true);
      } catch {
        // ハンドル失効等は無視
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const reloadFromDisk = async () => {
    const handle = fileHandleRef.current;
    if (!handle) return;
    try {
      const f = await handle.getFile();
      applyDocument(parseDocument(JSON.parse(await f.text())));
      lastModifiedRef.current = f.lastModified;
      setExternalChange(false);
    } catch {
      alert('再読込に失敗しました。');
    }
  };

  const dismissExternalChange = async () => {
    await rememberModified(fileHandleRef.current);
    setExternalChange(false);
  };

  const hasSelection = store.selectedIds.size > 0;

  // ---- ファイル操作 ----

  const handleNew = () => {
    if (!confirm('新規作成しますか？（保存していない変更は失われます）')) return;
    store.newDocument();
    fileHandleRef.current = null;
    lastModifiedRef.current = null;
    setExternalChange(false);
  };

  const applyDocument = (doc: DrawDocument) => {
    store.loadDocument(doc);
  };

  // 保存。saveAs=true なら常に保存先を選び直す
  const handleSave = async (saveAs = false) => {
    const doc: DrawDocument = {
      version: DOCUMENT_VERSION,
      id: store.projectId ?? uuidv4(),
      name: store.projectName,
      updatedAt: new Date().toISOString(),
      canvases: store.canvases,
      shapes: store.shapes,
      assets: store.assets,
    };
    const json = JSON.stringify(doc, null, 2);

    if (window.showSaveFilePicker) {
      try {
        let handle = saveAs ? null : fileHandleRef.current;
        if (!handle) {
          handle = await window.showSaveFilePicker({
      id: 'moshikizu-docs',
      startIn: 'documents',
            suggestedName: `${store.projectName}.drawjson`,
            types: FILE_PICKER_TYPES,
          });
        }
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        fileHandleRef.current = handle;
        await rememberModified(handle);
        await addRecentFile(handle, Date.now());
        store.setProject(doc.id, doc.name);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // キャンセル
        // 書き込み失敗時はダウンロードにフォールバック
      }
    }
    downloadBlob(new Blob([json], { type: 'application/json' }), `${store.projectName}.drawjson`);
    store.setProject(doc.id, doc.name);
  };

  // ハンドルからドキュメントを開く（読込・最近使ったファイル共通）
  const openFromHandle = async (handle: FileSystemFileHandle) => {
    try {
      // IndexedDB由来のハンドルは権限の再確認が要る場合がある
      if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if (!handle.requestPermission || (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
          alert('ファイルへのアクセスが許可されませんでした。');
          return;
        }
      }
      const file = await handle.getFile();
      applyDocument(parseDocument(JSON.parse(await file.text())));
      fileHandleRef.current = handle;
      lastModifiedRef.current = file.lastModified;
      setExternalChange(false);
      await addRecentFile(handle, Date.now());
    } catch {
      alert('ファイルを読み込めませんでした。');
    }
  };

  const handleLoad = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
      id: 'moshikizu-docs',
      startIn: 'documents', types: FILE_PICKER_TYPES });
        await openFromHandle(handle);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // キャンセル
      }
      return;
    }
    fileInputRef.current?.click();
  };

  // ダッシュボード（WelcomeDialog）からのオープン要求
  useEffect(() => {
    const onOpenFile = () => {
      void handleLoad();
    };
    const onOpenHandle = (e: Event) => {
      void openFromHandle((e as CustomEvent<FileSystemFileHandle>).detail);
    };
    window.addEventListener('draw:open-file', onOpenFile);
    window.addEventListener('draw:open-handle', onOpenHandle);
    return () => {
      window.removeEventListener('draw:open-file', onOpenFile);
      window.removeEventListener('draw:open-handle', onOpenHandle);
    };
  });

  // 非対応ブラウザ用フォールバック（file input 経由。上書き保存先は保持できない）
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      applyDocument(parseDocument(JSON.parse(await file.text())));
      fileHandleRef.current = null;
    } catch {
      alert('ファイルを読み込めませんでした。');
    }
    e.target.value = '';
  };

  // ---- 書き出し ----

  // 書き出し対象（現在のキャンバスの図形 or 選択範囲）
  const exportTargets = (selectionOnly: boolean) =>
    selectionOnly
      ? store.shapes.filter((s) => store.selectedIds.has(s.id))
      : store.shapes.filter((s) => s.canvasId === store.activeCanvasId);

  // ドキュメント中の全テキスト（フォントサブセット選別用）
  const collectText = (shapes: Shape[]) =>
    shapes.map((s) => (s.type === 'text' ? s.text : s.label?.text ?? '')).join('');

  // 使用フォントを data URI で埋め込むCSSを生成（オフライン・失敗時は undefined = システムフォント描画）
  const fontCssFor = async (shapes: Shape[]): Promise<string | undefined> => {
    try {
      return (await buildEmbeddedFontCss(settings.font, collectText(shapes))) || undefined;
    } catch {
      return undefined;
    }
  };

  const doExportSvg = (selectionOnly: boolean) => {
    const str = renderSvg(exportTargets(selectionOnly), { font: settings.font, assets: store.assets, allShapes: store.shapes });
    if (!str) {
      alert('書き出す図形がありません。');
      return;
    }
    const suffix = selectionOnly ? '_selection' : '';
    downloadSvg(str, `${store.projectName}${suffix}.svg`);
  };

  const doExportPng = async (selectionOnly: boolean) => {
    const targets = exportTargets(selectionOnly);
    // <img>経由の描画では外部リソースを取得できないため、@import ではなく data URI 埋め込みを使う
    const str = renderSvg(targets, {
      font: settings.font,
      fontImport: false,
      embedCss: await fontCssFor(targets),
      assets: store.assets,
      allShapes: store.shapes,
    });
    if (!str) {
      alert('書き出す図形がありません。');
      return;
    }
    const suffix = selectionOnly ? '_selection' : '';
    try {
      const blob = await svgToPngBlob(str, settings.pngScale);
      downloadBlob(blob, `${store.projectName}${suffix}.png`);
    } catch (err) {
      alert(`PNG書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // キャンバス1枚分の図形（マスター適用 + ページ変数置換済み）
  const canvasShapesWithMaster = (canvas: Canvas) => {
    const pageCanvases = store.canvases.filter((c) => !c.isMaster);
    const pageNo = pageCanvases.findIndex((c) => c.id === canvas.id) + 1;
    const own = store.shapes.filter((s) => s.canvasId === canvas.id);
    if (!canvas.masterId || canvas.isMaster) return own;
    const master = substitutePageVars(
      store.shapes.filter((s) => s.canvasId === canvas.masterId),
      { page: pageNo, pages: pageCanvases.length, canvasName: canvas.name },
    );
    return [...master, ...own];
  };

  // キャンバスサイズで書き出し（キャンバス定義の寸法・背景で切り出す）
  const doExportCanvas = async (format: 'svg' | 'png') => {
    const canvas = store.canvases.find((c) => c.id === store.activeCanvasId);
    if (!canvas) return;
    const targets = canvasShapesWithMaster(canvas);
    const str = renderSvg(targets, {
      font: settings.font,
      fontImport: format === 'svg',
      embedCss: format === 'png' ? await fontCssFor(targets) : undefined,
      assets: store.assets,
      allShapes: store.shapes,
      viewBox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      background: canvasBackgroundColor(canvas),
    });
    if (!str) return;
    const filename = `${store.projectName}_${canvas.name}`;
    if (format === 'svg') {
      downloadSvg(str, `${filename}.svg`);
      return;
    }
    try {
      const blob = await svgToPngBlob(str, settings.pngScale);
      downloadBlob(blob, `${filename}.png`);
    } catch (err) {
      alert(`PNG書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ---- サーバー保存 ----
  const handleServerSave = async () => {
    const id = store.projectId ?? uuidv4();
    const doc: DrawDocument = {
      version: DOCUMENT_VERSION,
      id,
      name: store.projectName,
      updatedAt: new Date().toISOString(),
      canvases: store.canvases,
      shapes: store.shapes,
      assets: store.assets,
    };
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error();
      store.setProject(id, doc.name);
      alert('サーバーに保存しました。');
    } catch {
      alert('サーバーへの保存に失敗しました。');
    }
  };

  // ---- ズーム（DrawingCanvas にイベントで伝える） ----
  // PDF書き出し（ページ順=タブ順、マスターはページに含めない。範囲例 "1,3,4-5"）
  const doExportPdf = async () => {
    const pageCanvases = store.canvases.filter((c) => !c.isMaster);
    if (pageCanvases.length === 0) {
      alert('ページになるキャンバスがありません（マスターのみ）。');
      return;
    }
    const spec = prompt(
      `PDFにするページ範囲（全${pageCanvases.length}ページ、例: 1,3,4-5。空欄=全ページ）`,
      '',
    );
    if (spec === null) return;
    const nums = parsePageRanges(spec, pageCanvases.length);
    if (nums.length === 0) {
      alert('有効なページがありません。');
      return;
    }
    try {
      const pages: { svg: string; width: number; height: number }[] = [];
      for (const n of nums) {
        const canvas = pageCanvases[n - 1];
        const targets = canvasShapesWithMaster(canvas);
        const svg = renderSvg(targets, {
          font: settings.font,
          fontImport: false,
          embedCss: await fontCssFor(targets),
          assets: store.assets,
          allShapes: store.shapes,
          viewBox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
          background: canvasBackgroundColor(canvas) ?? '#ffffff',
        });
        if (svg) pages.push({ svg, width: canvas.width, height: canvas.height });
      }
      const blob = await buildPdfFromSvgPages(pages, settings.pngScale);
      downloadBlob(blob, `${store.projectName}.pdf`);
    } catch (err) {
      alert(`PDF書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const dispatchView = (action: 'zoomIn' | 'zoomOut' | 'reset' | 'fit') => {
    window.dispatchEvent(new CustomEvent('draw:view', { detail: action }));
  };

  // ---- ショートカット（保存・開く・検索） ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'o') {
        e.preventDefault();
        handleLoad();
      } else if (e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // handleSave/handleLoad はレンダーごとに再生成されるが、最新のstoreを閉じ込めたいため毎回貼り直す
  });

  // ---- メニューUI ----

  const menuButton = (name: MenuName, label: string) => (
    <button
      className={styles.btn}
      onClick={() => setOpenMenu(openMenu === name ? null : name)}
      onMouseEnter={() => { if (openMenu && openMenu !== name) setOpenMenu(name); }}
    >
      {label}
    </button>
  );

  const run = (action: () => void | Promise<void>) => {
    setOpenMenu(null);
    void action();
  };

  return (
    <>
    <div className={styles.bar}>
      <span className={styles.appName}>Moshikizu</span>
      <input
        type="text"
        className={styles.projectName}
        value={store.projectName}
        onChange={(e) => store.setProject(store.projectId, e.target.value)}
      />
      <div className={styles.actions}>
        {openMenu && <div className={styles.backdrop} onClick={() => setOpenMenu(null)} />}

        {/* ファイル */}
        <div className={styles.menuWrap}>
          {menuButton('file', 'ファイル')}
          {openMenu === 'file' && (
            <div className={styles.dropdown}>
              <MenuItem label="新規" icon="note_add" onClick={() => run(handleNew)} />
              <MenuItem label="開く…" icon="folder_open" shortcut="⌘O" onClick={() => run(handleLoad)} />
              <div className={styles.dropDivider} />
              <MenuItem label="保存" icon="save" shortcut="⌘S" onClick={() => run(() => handleSave())} />
              <MenuItem label="別名保存…" icon="save_as" onClick={() => run(() => handleSave(true))} />
              {server.mode !== 'none' && (
                <>
                  <div className={styles.dropDivider} />
                  <div className={styles.dropSection}>
                    サーバー{server.username ? `（${server.username}）` : ''}
                  </div>
                  {server.mode === 'unauthenticated' && (
                    <MenuItem label="ログイン…" icon="login" onClick={() => run(() => setShowLogin(true))} />
                  )}
                  {server.mode === 'authenticated' && (
                    <>
                      <MenuItem label="サーバーに保存" icon="cloud_upload" onClick={() => run(handleServerSave)} />
                      <MenuItem label="サーバーから開く…" icon="cloud_download" onClick={() => run(() => setShowServerProjects(true))} />
                      <MenuItem label="コメント…" icon="chat" disabled={!store.projectId} onClick={() => run(() => setShowComments(true))} />
                      {!server.totpEnabled && (
                        <MenuItem label="2段階認証を設定…" icon="verified_user" onClick={() => run(() => setShowTotpSetup(true))} />
                      )}
                      <MenuItem label="ログアウト" icon="logout" onClick={() => run(() => server.logout())} />
                    </>
                  )}
                </>
              )}
              <div className={styles.dropDivider} />
              <MenuItem label="環境設定…" icon="settings" onClick={() => run(() => setShowSettings(true))} />
            </div>
          )}
        </div>

        {/* 編集 */}
        <div className={styles.menuWrap}>
          {menuButton('edit', '編集')}
          {openMenu === 'edit' && (
            <div className={styles.dropdown}>
              <MenuItem label="元に戻す" icon="undo" shortcut="⌘Z" disabled={store.past.length === 0} onClick={() => run(store.undo)} />
              <MenuItem label="やり直す" icon="redo" shortcut="⌘⇧Z" disabled={store.future.length === 0} onClick={() => run(store.redo)} />
              <div className={styles.dropDivider} />
              <MenuItem label="コピー" icon="content_copy" shortcut="⌘C" disabled={!hasSelection} onClick={() => run(store.copyToClipboard)} />
              <MenuItem label="貼り付け" icon="content_paste" shortcut="⌘V" disabled={store.clipboard.length === 0} onClick={() => run(store.pasteClipboard)} />
              <MenuItem label="複製" icon="control_point_duplicate" shortcut="⌘D" disabled={!hasSelection} onClick={() => run(store.duplicateSelected)} />
              <MenuItem label="削除" icon="delete" shortcut="Del" disabled={!hasSelection} onClick={() => run(store.deleteSelected)} />
              <div className={styles.dropDivider} />
              <MenuItem label="グループ化" icon="join_full" shortcut="⌘G" disabled={store.selectedIds.size < 2} onClick={() => run(store.groupSelection)} />
              <MenuItem label="グループ解除" icon="join_inner" shortcut="⌘⇧G" disabled={!hasSelection} onClick={() => run(store.ungroupSelection)} />
              <div className={styles.dropDivider} />
              <MenuItem label="最前面へ" icon="flip_to_front" shortcut="⌘⇧]" disabled={!hasSelection} onClick={() => run(() => store.reorderSelected('front'))} />
              <MenuItem label="前面へ" icon="arrow_upward" shortcut="⌘]" disabled={!hasSelection} onClick={() => run(() => store.reorderSelected('forward'))} />
              <MenuItem label="背面へ" icon="arrow_downward" shortcut="⌘[" disabled={!hasSelection} onClick={() => run(() => store.reorderSelected('backward'))} />
              <MenuItem label="最背面へ" icon="flip_to_back" shortcut="⌘⇧[" disabled={!hasSelection} onClick={() => run(() => store.reorderSelected('back'))} />
              <div className={styles.dropDivider} />
              <MenuItem label="検索と置換…" icon="find_replace" shortcut="⌘F" onClick={() => run(() => setShowSearch(true))} />
            </div>
          )}
        </div>

        {/* 表示 */}
        <div className={styles.menuWrap}>
          {menuButton('view', '表示')}
          {openMenu === 'view' && (
            <div className={styles.dropdown}>
              <MenuItem label="拡大" icon="zoom_in" shortcut="⌘+" onClick={() => run(() => dispatchView('zoomIn'))} />
              <MenuItem label="縮小" icon="zoom_out" shortcut="⌘−" onClick={() => run(() => dispatchView('zoomOut'))} />
              <div className={styles.dropDivider} />
              <MenuItem label="100%表示" icon="crop_original" shortcut="⌘1" onClick={() => run(() => dispatchView('reset'))} />
              <MenuItem label="キャンバスにフィット" icon="fit_screen" shortcut="⌘0" onClick={() => run(() => dispatchView('fit'))} />
              <div className={styles.dropDivider} />
              <MenuItem
                label="グリッドを表示"
                icon={settings.showGrid ? 'check_box' : 'check_box_outline_blank'}
                onClick={() => run(() => saveSettings({ ...settings, showGrid: !settings.showGrid }))}
              />
            </div>
          )}
        </div>

        {/* 書き出し */}
        <div className={styles.menuWrap}>
          {menuButton('export', '書き出し')}
          {openMenu === 'export' && (
            <div className={styles.dropdown}>
              <div className={styles.dropSection}>現在のキャンバス（寸法・背景で切り出し）</div>
              <MenuItem label="キャンバスをSVG" icon="crop" onClick={() => run(() => doExportCanvas('svg'))} />
              <MenuItem label="キャンバスをPNG" icon="crop" onClick={() => run(() => doExportCanvas('png'))} />
              <MenuItem label="PDF（複数ページ・範囲指定）…" icon="picture_as_pdf" onClick={() => run(doExportPdf)} />
              <div className={styles.dropDivider} />
              <div className={styles.dropSection}>内容にフィット（余白16px）</div>
              <MenuItem label="図形全体をSVG" icon="fit_screen" onClick={() => run(() => doExportSvg(false))} />
              <MenuItem label="図形全体をPNG" icon="fit_screen" onClick={() => run(() => doExportPng(false))} />
              {hasSelection && (
                <>
                  <div className={styles.dropDivider} />
                  <div className={styles.dropSection}>選択範囲</div>
                  <MenuItem label="選択をSVG" icon="highlight_alt" onClick={() => run(() => doExportSvg(true))} />
                  <MenuItem label="選択をPNG" icon="highlight_alt" onClick={() => run(() => doExportPng(true))} />
                </>
              )}
              <div className={styles.dropDivider} />
              <div className={styles.dropSection}>PNG倍率</div>
              <div className={styles.scaleRow}>
                {[1, 2, 3, 4].map((s) => (
                  <button
                    key={s}
                    className={`${styles.scaleBtn} ${settings.pngScale === s ? styles.scaleActive : ''}`}
                    onClick={() => saveSettings({ ...settings, pngScale: s })}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ヘルプ */}
        <div className={styles.menuWrap}>
          {menuButton('help', 'ヘルプ')}
          {openMenu === 'help' && (
            <div className={styles.dropdown}>
              <MenuItem label="ショートカット一覧…" icon="keyboard" onClick={() => run(() => setShowShortcuts(true))} />
              <MenuItem label="MCP / APIリファレンス…" icon="api" onClick={() => run(() => setShowApiRef(true))} />
              <MenuItem label="ユーザーマニュアル" icon="menu_book" onClick={() => run(() => { window.open('https://yupyom.github.io/moshikizu/manual/', '_blank'); })} />
              {window.drawDesktop && (
                <MenuItem label="更新を確認" icon="system_update_alt" onClick={() => run(async () => {
                  const r = await window.drawDesktop!.checkUpdate(settings.updateChannel);
                  if (!r) { alert('リリース情報が見つかりませんでした。'); return; }
                  if ('error' in r) { alert(`更新確認に失敗しました: ${r.error}`); return; }
                  if (r.isNewer) {
                    if (confirm(`新しいバージョン ${r.latest} があります（現在 ${r.current}）。\nダウンロードページを開きますか？`)) {
                      window.open(r.url, '_blank');
                    }
                  } else {
                    alert(`最新版です（${r.current}）。`);
                  }
                })} />
              )}
              <div className={styles.dropDivider} />
              <MenuItem label="バージョン情報" icon="info" onClick={() => run(() => alert(`Moshikizu v${APP_VERSION}\n模式図・概念図の作成ツール（もしきず）`))} />
            </div>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".drawjson,.json" style={{ display: 'none' }} onChange={handleFileChange} />

    </div>

    {/* ダイアログはバー（白文字・暗色背景）の外でレンダリングして色の継承を避ける */}
    {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    {showSearch && <SearchReplaceDialog onClose={() => setShowSearch(false)} />}
    {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    {showApiRef && <ApiReferenceDialog onClose={() => setShowApiRef(false)} />}
    {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
    {showServerProjects && <ServerProjectsDialog onClose={() => setShowServerProjects(false)} />}
    {showComments && store.projectId && (
      <CommentsDialog projectId={store.projectId} projectName={store.projectName} onClose={() => setShowComments(false)} />
    )}
    {showTotpSetup && <TotpSetupDialog onClose={() => setShowTotpSetup(false)} />}

    {/* 外部変更バナー（MCP等による編集の検知） */}
    {externalChange && (
      <div className={styles.banner}>
        <span className="material-icons" style={{ fontSize: 16 }}>sync</span>
        保存先ファイルが外部で変更されました（エージェントによる編集の可能性があります）
        <button className={styles.bannerBtn} onClick={reloadFromDisk}>再読込</button>
        <button className={styles.bannerBtnGhost} onClick={dismissExternalChange}>無視</button>
      </div>
    )}
    </>
  );
}
