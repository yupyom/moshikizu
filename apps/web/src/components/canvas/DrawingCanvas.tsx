import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDrawingStore } from '../../store/drawingStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Shape, Tool, HandlePosition, BoundingBox, LineShape, ImageShape } from '@draw/core';
import { snap, snapPoint, cropDrag, cropPan, curveSegmentControls, tableLayout, substitutePageVars } from '@draw/core';
import { getBoundingBox, getUnionBoundingBox, boxesOverlap } from '@draw/core';
import { Grid } from './Grid';
import { RubberBand } from './RubberBand';
import { SelectionHandles } from './SelectionHandles';
import { RectShapeEl } from '../shapes/RectShapeEl';
import { RoundedRectShapeEl } from '../shapes/RoundedRectShapeEl';
import { EllipseShapeEl } from '../shapes/EllipseShapeEl';
import { LineShapeEl } from '../shapes/LineShapeEl';
import { TextShapeEl } from '../shapes/TextShapeEl';
import { SvgShapeEl } from '../shapes/SvgShapeEl';
import { ImageShapeEl } from '../shapes/ImageShapeEl';
import { AssetInstanceEl } from '../shapes/AssetInstanceEl';
import { TableShapeEl } from '../shapes/TableShapeEl';
import { ChartShapeEl } from '../shapes/ChartShapeEl';
import { renderShapesFragment } from '@draw/renderer';
import styles from './DrawingCanvas.module.css';

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; startPanX: number; startPanY: number }
  | { kind: 'move'; startX: number; startY: number; moved: boolean }
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'rubberband'; startX: number; startY: number }
  | { kind: 'resize'; handle: HandlePosition; startX: number; startY: number; origShapes: Shape[] }
  | { kind: 'line'; points: { x: number; y: number }[] }
  | { kind: 'linePoint'; shapeId: string; pointIndex: number }
  | { kind: 'curveControl'; shapeId: string; segIndex: number; which: 'c1' | 'c2' }
  | { kind: 'crop'; handle: HandlePosition; orig: ImageShape }
  | { kind: 'cropPan'; orig: ImageShape; startX: number; startY: number };

interface EditingText {
  shapeId: string | null;
  canvasX: number;  // キャンバス座標
  canvasY: number;
  canvasW: number;
  canvasH: number;
  /** 表のセル編集時のみ */
  cell?: { r: number; c: number };
}

type LineContextMenu =
  | { shapeId: string; screenX: number; screenY: number; kind: 'waypoint'; pointIndex: number; canDelete: boolean }
  | { shapeId: string; screenX: number; screenY: number; kind: 'segment'; afterIndex: number; insertPt: { x: number; y: number } };

// ウェイポイントから線分上の最近傍セグメントインデックスを返す
function distToSegment(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
  return Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy);
}

function nearestSegmentIndex(points: { x: number; y: number }[], pt: { x: number; y: number }): number {
  if (points.length <= 1) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(pt, points[i], points[i + 1]);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}


const DOUBLE_CLICK_MS = 300;

/** マスターキャンバスの図形を renderer 断片で表示（非対話） */
function MasterShapeView({ shape, allShapes, assets }: { shape: Shape; allShapes: Shape[]; assets: import('@draw/core').AssetMaster[] }) {
  const font = useSettingsStore((s) => s.settings.font);
  return <g dangerouslySetInnerHTML={{ __html: renderShapesFragment([shape], font, assets, allShapes) }} />;
}

// コンテキストメニュー用ボタン
function LineMenuBtn({ children, onClick, icon, disabled, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', textAlign: 'left',
        padding: '6px 10px', border: 'none', background: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13, borderRadius: 5,
        color: disabled ? '#9ca3af' : danger ? '#dc2626' : '#111827',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#f3f4f6'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      <span className="material-icons" style={{ fontSize: 16 }}>{icon}</span>
      {children}
    </button>
  );
}

export function DrawingCanvas() {
  const store = useDrawingStore();
  const settings = useSettingsStore((s) => s.settings);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<SVGSVGElement>(null);

  const [size, setSize] = useState({ width: 800, height: 600 });
  // drag状態はハンドラからは dragRef で参照する（stale closure回避）。
  // useState はドラッグ中の再レンダー誘発のためだけに使う。
  const [, setDrag] = useState<DragMode>({ kind: 'none' });
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const setDragBoth = useCallback((d: DragMode) => {
    dragRef.current = d;
    setDrag(d);
  }, []);

  const [rubberBand, setRubberBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ x: number; y: number }[]>([]);
  const [editingText, setEditingText] = useState<EditingText | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineContextMenu, setLineContextMenu] = useState<LineContextMenu | null>(null);
  // ダブルクリックで入る線のウェイポイント編集モード
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  // ダブルクリックで入る画像のトリミング編集モード
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  // 線端ドラッグ中の連結候補（ハイライト表示用）
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);
  // Shiftキー押下状態（線編集モードの点追加/削除カーソル表示用）
  const [shiftDown, setShiftDown] = useState(false);
  // Spaceキー押下状態（押している間は手のひらツール＝ドラッグでパン）
  const [spaceDown, setSpaceDown] = useState(false);
  // 矢印キー移動のundoまとめ用（連打を1回のスナップショットに）
  const lastArrowAt = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(true);
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(false);
      if (e.key === ' ') setSpaceDown(false);
    };
    const blur = () => { setShiftDown(false); setSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // カスタムダブルクリック検出
  const lastShapeClick = useRef<{ id: string; time: number } | null>(null);

  // ---- ズーム ----

  /** (cx, cy) を不動点として拡大縮小する */
  const zoomAround = useCallback((cx: number, cy: number, targetZoom: number) => {
    const z = Math.max(0.1, Math.min(5, targetZoom));
    const scale = z / store.zoom;
    store.setPan(cx - (cx - store.panX) * scale, cy - (cy - store.panY) * scale);
    store.setZoom(z);
  }, [store]);

  /** ビューポート中心を不動点にズーム */
  const zoomAtCenter = useCallback((targetZoom: number) => {
    zoomAround(size.width / 2, size.height / 2, targetZoom);
  }, [zoomAround, size]);

  /** アクティブキャンバスをビューポートにフィット */
  const fitToCanvas = useCallback((viewW = size.width, viewH = size.height) => {
    const canvas = store.canvases.find((c) => c.id === store.activeCanvasId);
    if (!canvas) return;
    const margin = 40;
    const z = Math.max(0.1, Math.min(5, Math.min(
      (viewW - margin * 2) / canvas.width,
      (viewH - margin * 2) / canvas.height,
    )));
    store.setZoom(z);
    store.setPan((viewW - canvas.width * z) / 2, (viewH - canvas.height * z) / 2);
  }, [size, store]);
  const fitRef = useRef(fitToCanvas);
  useEffect(() => {
    fitRef.current = fitToCanvas;
  });

  // メニューバーの「表示」からのズーム操作を受け取る
  useEffect(() => {
    const onView = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === 'zoomIn') zoomAtCenter(store.zoom * 1.25);
      else if (action === 'zoomOut') zoomAtCenter(store.zoom / 1.25);
      else if (action === 'reset') zoomAtCenter(1);
      else if (action === 'fit') fitToCanvas();
    };
    window.addEventListener('draw:view', onView);
    return () => window.removeEventListener('draw:view', onView);
  }, [zoomAtCenter, fitToCanvas, store.zoom]);

  // コンテナリサイズ監視（初回計測時にキャンバスをフィット表示）
  const didInitialFit = useRef(false);
  useEffect(() => {
    const update = () => {
      const el = wrapperRef.current;
      if (el) setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const el = wrapperRef.current;
    if (el && !didInitialFit.current) {
      didInitialFit.current = true;
      fitRef.current(el.clientWidth, el.clientHeight);
    }
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // テキストエリアのフォーカス
  useEffect(() => {
    if (editingText) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [editingText]);

  // ホイールズーム（カーソル位置中心）& パン
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = internalRef.current!.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, store.zoom * factor);
    } else {
      store.setPan(store.panX - e.deltaX, store.panY - e.deltaY);
    }
  }, [store, zoomAround]);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // キーボードショートカット
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingText) return;
      // テキスト入力フィールドへのイベントは無視（プロジェクト名入力中にundoが走らないよう）
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isMod = e.metaKey || e.ctrlKey;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        store.deleteSelected();
      } else if (isMod && e.key === 'z' && !e.shiftKey) {
        store.undo();
      } else if (isMod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        store.redo();
      } else if (isMod && e.key === 'c') {
        store.copyToClipboard();
      } else if (isMod && e.key === 'x') {
        store.cutToClipboard();
      } else if (isMod && e.key === 'v') {
        store.pasteClipboard();
      } else if (isMod && e.key === 'd') {
        e.preventDefault();
        store.duplicateSelected();
      } else if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomAtCenter(store.zoom * 1.25);
      } else if (isMod && e.key === '-') {
        e.preventDefault();
        zoomAtCenter(store.zoom / 1.25);
      } else if (isMod && e.key === '0') {
        e.preventDefault();
        fitToCanvas();
      } else if (isMod && e.key === '1') {
        e.preventDefault();
        zoomAtCenter(1);
      } else if (isMod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) store.ungroupSelection();
        else store.groupSelection();
      } else if (isMod && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const dir = e.key === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward');
        store.reorderSelected(dir);
      } else if (!isMod && e.key.startsWith('Arrow') && store.selectedIds.size > 0) {
        e.preventDefault();
        const step = e.shiftKey ? settings.gridSize : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        // 連打は1回のundoにまとめる（800ms間隔でスナップショット）
        const now = Date.now();
        if (now - lastArrowAt.current > 800) store.snapshot();
        lastArrowAt.current = now;
        store.moveSelected(dx, dy);
      } else if (!isMod && !e.altKey && ['v', 'r', 'o', 'l', 't'].includes(e.key.toLowerCase()) && !e.shiftKey) {
        // ツールショートカット
        const toolKey: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', t: 'text' };
        store.setTool(toolKey[e.key.toLowerCase()]);
      } else if (e.key === 'Escape') {
        if (lineContextMenu) {
          setLineContextMenu(null);
          return;
        }
        if (croppingImageId) {
          setCroppingImageId(null);
          return;
        }
        if (editingLineId) {
          setEditingLineId(null);
          return;
        }
        const d = dragRef.current;
        if (d.kind === 'line') {
          setDragBoth({ kind: 'none' });
          setLinePreview([]);
        }
        store.clearSelection();
        store.setTool('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, editingText, setDragBoth, lineContextMenu, editingLineId, croppingImageId, zoomAtCenter, fitToCanvas, settings.gridSize]);

  // SVGキャンバス座標に変換
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = internalRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - store.panX) / store.zoom,
      y: (clientY - rect.top - store.panY) / store.zoom,
    };
  }, [store.panX, store.panY, store.zoom]);

  /** 線端の連結先候補を探す（最前面優先。線自身・線・アクティブキャンバス外は除外） */
  const findAttachTarget = useCallback((rawX: number, rawY: number, excludeId: string): Shape | null => {
    const st = store;
    for (let i = st.shapes.length - 1; i >= 0; i--) {
      const sh = st.shapes[i];
      if (sh.id === excludeId || sh.type === 'line' || sh.canvasId !== st.activeCanvasId) continue;
      const bb = getBoundingBox(sh);
      if (rawX >= bb.x && rawX <= bb.x + bb.width && rawY >= bb.y && rawY <= bb.y + bb.height) return sh;
    }
    return null;
  }, [store]);

  const toSnapped = useCallback((clientX: number, clientY: number) => {
    const { x, y } = toCanvas(clientX, clientY);
    return snapPoint(x, y, settings.gridSize);
  }, [toCanvas, settings.gridSize]);

  // シェイプのインラインテキスト編集を開く
  const openShapeEditor = useCallback((shape: Shape) => {
    const bb = getBoundingBox(shape);
    const initialText = shape.type !== 'text' && shape.type !== 'svg'
      ? (shape.label?.text ?? '')
      : (shape.type === 'text' ? shape.text : '');
    setTextValue(initialText);
    setEditingText({
      shapeId: shape.id,
      canvasX: bb.x,
      canvasY: bb.y,
      canvasW: bb.width,
      canvasH: bb.height,
    });
  }, []);

  // テキスト確定
  const commitText = useCallback(() => {
    if (!editingText) return;
    const text = textValue;
    store.snapshot();
    if (editingText.shapeId) {
      const shape = store.shapes.find((s) => s.id === editingText.shapeId);
      if (shape && shape.type === 'table' && editingText.cell) {
        const { r, c } = editingText.cell;
        const cells = shape.cells.map((row) => [...row]);
        if (cells[r]) {
          cells[r][c] = text;
          store.updateShape(shape.id, { cells } as Partial<Shape>);
        }
      } else if (shape && shape.type !== 'svg') {
        if (shape.type === 'text') {
          store.updateShape(shape.id, { text } as Partial<Shape>);
        } else if (text.trim()) {
          const label = {
            text,
            fontSize: shape.label?.fontSize ?? settings.fontSizes[4],
            fontWeight: shape.label?.fontWeight ?? ('regular' as const),
            hAlign: shape.label?.hAlign ?? ('center' as const),
            vAlign: shape.label?.vAlign ?? ('middle' as const),
            color: shape.label?.color ?? settings.colorPalette[0],
          };
          store.updateShape(shape.id, { label } as Partial<Shape>);
        } else {
          // テキストが空の場合はラベルをクリア
          store.updateShape(shape.id, { label: undefined } as Partial<Shape>);
        }
      }
    } else if (text.trim()) {
      store.addShape({
        id: uuidv4(),
        type: 'text',
        x: editingText.canvasX,
        y: editingText.canvasY + settings.fontSizes[4],
        text,
        fontSize: settings.fontSizes[4],
        fontWeight: 'regular',
        color: settings.colorPalette[0],
        strokeColor: settings.colorPalette[0],
        strokeWidth: 1,
      });
    }
    setEditingText(null);
    setTextValue('');
  }, [editingText, textValue, store, settings]);

  const cancelText = useCallback(() => {
    setEditingText(null);
    setTextValue('');
  }, []);

  // Enter は改行（複数行テキスト）。確定は ⌘/Ctrl+Enter か枠外クリック
  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelText();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitText();
    }
  };

  // ポインターイベント
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (editingText) {
      commitText();
      return;
    }
    const pt = toSnapped(e.clientX, e.clientY);
    const raw = toCanvas(e.clientX, e.clientY);

    // 中ボタン or Alt+左 or Space+左: パン
    if (e.button === 1 || (e.button === 0 && (e.altKey || spaceDown))) {
      setDragBoth({ kind: 'pan', startX: e.clientX, startY: e.clientY, startPanX: store.panX, startPanY: store.panY });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }

    // SVGツール（ファイル選択で配置するため、キャンバスクリックは無視）
    if (store.activeTool === 'svg') return;

    // 線ツール
    if (store.activeTool === 'line') {
      const d = dragRef.current;
      if (d.kind === 'line') {
        // ウェイポイント追加（drag.points も更新）
        const newPoints = [...d.points, pt];
        setDragBoth({ kind: 'line', points: newPoints });
        setLinePreview(newPoints);
      } else {
        setDragBoth({ kind: 'line', points: [pt] });
        setLinePreview([pt]);
      }
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }

    // テキストツール
    if (store.activeTool === 'text') {
      setTextValue('');
      setEditingText({ shapeId: null, canvasX: pt.x, canvasY: pt.y, canvasW: 240, canvasH: 80 });
      return;
    }

    // 選択ツール: キャンバス背景クリック → ラバーバンド
    if (store.activeTool === 'select') {
      store.clearSelection();
      setEditingLineId(null);
      setCroppingImageId(null);
      setRubberBand({ x: raw.x, y: raw.y, w: 0, h: 0 });
      setDragBoth({ kind: 'rubberband', startX: raw.x, startY: raw.y });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }

    // 矩形系の描画開始
    setDragBoth({ kind: 'draw', startX: pt.x, startY: pt.y });
    setDrawPreview({ x: pt.x, y: pt.y, w: 0, h: 0 });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, [editingText, commitText, toSnapped, toCanvas, store, setDragBoth, spaceDown]);

  // リサイズ処理
  const handleResize = useCallback((d: Extract<DragMode, { kind: 'resize' }>, pt: { x: number; y: number }) => {
    if (d.origShapes.length !== 1) return;
    const orig = d.origShapes[0];
    const bb = getBoundingBox(orig);
    let nx = bb.x, ny = bb.y, nw = bb.width, nh = bb.height;
    const { handle } = d;

    if (handle.includes('e')) nw = Math.max(settings.gridSize, snap(pt.x - bb.x, settings.gridSize));
    if (handle.includes('s')) nh = Math.max(settings.gridSize, snap(pt.y - bb.y, settings.gridSize));
    if (handle.includes('w')) {
      const newX = Math.min(snap(pt.x, settings.gridSize), bb.x + bb.width - settings.gridSize);
      nw = bb.x + bb.width - newX;
      nx = newX;
    }
    if (handle.includes('n')) {
      const newY = Math.min(snap(pt.y, settings.gridSize), bb.y + bb.height - settings.gridSize);
      nh = bb.y + bb.height - newY;
      ny = newY;
    }

    // 画像・SVG配置はコーナーハンドルで縦横比を維持する
    const keepAspect = (orig.type === 'image' || orig.type === 'svg') && handle.length === 2;
    if (keepAspect && bb.width > 0 && bb.height > 0) {
      const ratio = bb.width / bb.height;
      // 変化量が大きい辺に合わせる
      if (Math.abs(nw - bb.width) >= Math.abs(nh - bb.height) * ratio) {
        nh = nw / ratio;
      } else {
        nw = nh * ratio;
      }
      // 上・左基準のハンドルは位置も合わせ直す
      if (handle.includes('n')) ny = bb.y + bb.height - nh;
      if (handle.includes('w')) nx = bb.x + bb.width - nw;
    }

    if (orig.type === 'table') {
      const sx = nw / bb.width;
      const sy = nh / bb.height;
      store.updateShape(orig.id, {
        x: nx,
        y: ny,
        colWidths: orig.colWidths.map((w) => Math.max(20, w * sx)),
        rowHeights: orig.rowHeights.map((h) => Math.max(16, h * sy)),
      } as Partial<Shape>);
    } else if (orig.type !== 'line' && orig.type !== 'text') {
      store.updateShape(orig.id, { x: nx, y: ny, width: nw, height: nh } as Partial<Shape>);
    }
  }, [store, settings.gridSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // dragRef.current を使うことでstale closureを防ぐ
    const d = dragRef.current;
    const pt = toSnapped(e.clientX, e.clientY);
    const raw = toCanvas(e.clientX, e.clientY);

    if (d.kind === 'pan') {
      store.setPan(d.startPanX + e.clientX - d.startX, d.startPanY + e.clientY - d.startY);
      return;
    }
    if (d.kind === 'rubberband') {
      setRubberBand({ x: d.startX, y: d.startY, w: raw.x - d.startX, h: raw.y - d.startY });
      return;
    }
    if (d.kind === 'draw') {
      setDrawPreview({
        x: Math.min(d.startX, pt.x),
        y: Math.min(d.startY, pt.y),
        w: Math.abs(pt.x - d.startX),
        h: Math.abs(pt.y - d.startY),
      });
      return;
    }
    if (d.kind === 'line') {
      setLinePreview([...d.points, pt]);
      return;
    }
    if (d.kind === 'move') {
      const dx = snap(raw.x - d.startX, settings.gridSize);
      const dy = snap(raw.y - d.startY, settings.gridSize);
      if (dx !== 0 || dy !== 0) {
        store.moveSelected(dx, dy);
        setDragBoth({ ...d, startX: raw.x + (dx - (raw.x - d.startX)), startY: raw.y + (dy - (raw.y - d.startY)), moved: true });
      }
      return;
    }
    if (d.kind === 'resize') {
      handleResize(d, pt);
      return;
    }
    if (d.kind === 'linePoint') {
      const shape = store.shapes.find((s) => s.id === d.shapeId);
      if (shape && shape.type === 'line') {
        const newPoints = shape.points.map((p, i) => (i === d.pointIndex ? { ...p, x: pt.x, y: pt.y } : p));
        store.updateShape(d.shapeId, { points: newPoints } as Partial<Shape>);
        // 端点なら連結先候補をハイライト
        if (d.pointIndex === 0 || d.pointIndex === shape.points.length - 1) {
          setAttachTargetId(findAttachTarget(raw.x, raw.y, d.shapeId)?.id ?? null);
        }
      }
      return;
    }
    if (d.kind === 'curveControl') {
      const shape = store.shapes.find((s) => s.id === d.shapeId);
      if (shape && shape.type === 'line') {
        const p1 = shape.points[d.segIndex];
        const p2 = shape.points[d.segIndex + 1];
        if (p1 && p2) {
          // 既存（または自動）の制御点を保ちつつ、掴んだ側だけ更新（アンカー相対で保存）
          const segs = curveSegmentControls(shape.points, shape.curveControls);
          const cur = segs[d.segIndex];
          const next = d.which === 'c1'
            ? { c1dx: raw.x - p1.x, c1dy: raw.y - p1.y, c2dx: cur.c2.x - p2.x, c2dy: cur.c2.y - p2.y }
            : { c1dx: cur.c1.x - p1.x, c1dy: cur.c1.y - p1.y, c2dx: raw.x - p2.x, c2dy: raw.y - p2.y };
          store.updateShape(d.shapeId, {
            curveControls: { ...shape.curveControls, [d.segIndex]: next },
          } as Partial<Shape>);
        }
      }
      return;
    }
    if (d.kind === 'crop') {
      store.updateShape(d.orig.id, cropDrag(d.orig, d.handle, raw.x, raw.y) as Partial<Shape>);
      return;
    }
    if (d.kind === 'cropPan') {
      store.updateShape(d.orig.id, cropPan(d.orig, raw.x - d.startX, raw.y - d.startY) as Partial<Shape>);
    }
  }, [toSnapped, toCanvas, store, settings.gridSize, setDragBoth, handleResize, findAttachTarget]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // dragRef.current を使うことで、PointerDownとPointerUpの間にre-renderが
    // 完了していない場合のstale closureによる誤リセットを防ぐ
    const d = dragRef.current;

    if (d.kind === 'draw' && drawPreview) {
      const { x, y, w, h } = drawPreview;
      if (w > 4 && h > 4) {
        store.snapshot();
        const base = {
          id: uuidv4(),
          strokeColor: settings.colorPalette[0],
          strokeWidth: settings.strokeWidths[0],
          fillColor: '#ffffff',
        };
        if (store.activeTool === 'rect') store.addShape({ ...base, type: 'rect', x, y, width: w, height: h });
        else if (store.activeTool === 'roundedRect') store.addShape({ ...base, type: 'roundedRect', x, y, width: w, height: h, cornerRadius: settings.defaultCornerRadius });
        else if (store.activeTool === 'ellipse') store.addShape({ ...base, type: 'ellipse', x, y, width: w, height: h });
      }
      setDrawPreview(null);
    }

    if (d.kind === 'rubberband' && rubberBand) {
      const selBox: BoundingBox = {
        x: rubberBand.w >= 0 ? rubberBand.x : rubberBand.x + rubberBand.w,
        y: rubberBand.h >= 0 ? rubberBand.y : rubberBand.y + rubberBand.h,
        width: Math.abs(rubberBand.w),
        height: Math.abs(rubberBand.h),
      };
      if (selBox.width > 2 || selBox.height > 2) {
        const inCanvas = store.shapes.filter((s) => s.canvasId === store.activeCanvasId);
        const hit = inCanvas.filter((s) => boxesOverlap(getBoundingBox(s), selBox));
        // グループは選択単位: 1つでも掛かったグループは全メンバーを選択に含める
        const hitGroups = new Set(hit.map((s) => s.groupId).filter(Boolean));
        const ids = inCanvas
          .filter((s) => (s.groupId && hitGroups.has(s.groupId)) || hit.includes(s))
          .map((s) => s.id);
        store.selectIds(ids);
      }
      setRubberBand(null);
    }

    // 線端のドロップ: 図形上なら連結、外なら解除
    if (d.kind === 'linePoint') {
      const shape = store.shapes.find((s) => s.id === d.shapeId);
      if (shape && shape.type === 'line' && (d.pointIndex === 0 || d.pointIndex === shape.points.length - 1)) {
        const raw = toCanvas(e.clientX, e.clientY);
        const target = findAttachTarget(raw.x, raw.y, d.shapeId);
        const pt = shape.points[d.pointIndex];
        let newPoint;
        if (target) {
          const bb = getBoundingBox(target);
          newPoint = { x: pt.x, y: pt.y, attach: { shapeId: target.id, dx: pt.x - bb.x, dy: pt.y - bb.y } };
        } else {
          newPoint = { x: pt.x, y: pt.y };
        }
        store.updateShape(d.shapeId, {
          points: shape.points.map((p, i) => (i === d.pointIndex ? newPoint : p)),
        } as Partial<Shape>);
      }
      setAttachTargetId(null);
    }

    // 線描画中（line）は複数クリックでウェイポイントを追加するためリセットしない
    if (d.kind !== 'line') {
      setDragBoth({ kind: 'none' });
    }
  }, [drawPreview, rubberBand, store, settings, setDragBoth, toCanvas, findAttachTarget]);

  // ダブルクリックで線を確定
  const handleDoubleClick = useCallback((_e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (store.activeTool === 'line' && d.kind === 'line') {
      let points = d.points;
      // ダブルクリックの2回目クリックで追加された重複点を除去
      if (points.length >= 2) {
        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        if (last.x === prev.x && last.y === prev.y) {
          points = points.slice(0, -1);
        }
      }
      if (points.length >= 2) {
        store.snapshot();
        const shape: LineShape = {
          id: uuidv4(),
          type: 'line',
          points,
          strokeColor: settings.colorPalette[0],
          strokeWidth: settings.strokeWidths[0],
          startMarker: 'none',
          endMarker: 'arrow',
        };
        store.addShape(shape);
      }
      setDragBoth({ kind: 'none' });
      setLinePreview([]);
      store.setTool('select');
    }
  }, [store, settings, setDragBoth]);

  // シェイプのポインターダウン（カスタムダブルクリック検出込み）
  const handleShapePointerDown = useCallback((e: React.PointerEvent, shapeId: string) => {
    if (store.activeTool !== 'select') return;
    e.stopPropagation();

    const now = Date.now();
    const last = lastShapeClick.current;

    // カスタムダブルクリック判定
    if (last && last.id === shapeId && now - last.time < DOUBLE_CLICK_MS) {
      lastShapeClick.current = null;
      const shape = store.shapes.find((s) => s.id === shapeId);
      if (!shape) return;
      if (shape.type === 'line') {
        // 線はダブルクリックでウェイポイント編集モードへ
        store.selectIds([shapeId]);
        setEditingLineId(shapeId);
      } else if (shape.type === 'image') {
        // 画像はダブルクリックでトリミング編集モードへ
        store.selectIds([shapeId]);
        setCroppingImageId(shapeId);
      } else if (shape.type === 'table') {
        // 表はダブルクリックした位置のセルを編集
        const raw = toCanvas(e.clientX, e.clientY);
        const layout = tableLayout(shape.colWidths, shape.rowHeights);
        const lx = raw.x - shape.x;
        const ly = raw.y - shape.y;
        let c = shape.colWidths.length - 1;
        while (c > 0 && lx < layout.colX[c]) c--;
        let r = shape.rowHeights.length - 1;
        while (r > 0 && ly < layout.rowY[r]) r--;
        if (lx >= 0 && ly >= 0 && lx <= layout.width && ly <= layout.height) {
          setTextValue(shape.cells[r]?.[c] ?? '');
          setEditingText({
            shapeId,
            canvasX: shape.x + layout.colX[c],
            canvasY: shape.y + layout.rowY[r],
            canvasW: shape.colWidths[c],
            canvasH: shape.rowHeights[r],
            cell: { r, c },
          });
        }
      } else if (shape.type !== 'svg') {
        openShapeEditor(shape);
      }
      return;
    }

    lastShapeClick.current = { id: shapeId, time: now };
    // 編集モードは「編集中の図形を選択したまま再クリック」以外の単クリックで抜ける
    // （ツール切替などで選択が外れた後の単クリックでは復帰させない）
    if (editingLineId && (editingLineId !== shapeId || !store.selectedIds.has(shapeId))) {
      setEditingLineId(null);
    }
    if (croppingImageId && (croppingImageId !== shapeId || !store.selectedIds.has(shapeId))) {
      setCroppingImageId(null);
    }

    // グループに属する図形はグループ全体を選択単位にする
    const clicked = store.shapes.find((s) => s.id === shapeId);
    const clickedUnit = clicked?.groupId
      ? store.shapes
          .filter((s) => s.groupId === clicked.groupId && s.canvasId === store.activeCanvasId)
          .map((s) => s.id)
      : [shapeId];

    if (e.shiftKey) {
      store.selectIds([...store.selectedIds, ...clickedUnit]);
    } else if (!store.selectedIds.has(shapeId)) {
      store.selectIds(clickedUnit);
    }

    // Alt+ドラッグ: その場で複製してから複製側を動かす
    if (e.altKey) {
      store.duplicateSelectedInPlace();
    }

    const raw = toCanvas(e.clientX, e.clientY);
    setDragBoth({ kind: 'move', startX: raw.x, startY: raw.y, moved: false });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, toCanvas, setDragBoth, openShapeEditor, editingLineId, croppingImageId]);

  // クロップ枠ハンドルのドラッグ開始
  const handleCropHandlePointerDown = useCallback((e: React.PointerEvent, shapeId: string, handle: HandlePosition) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'image') return;
    store.snapshot();
    setDragBoth({ kind: 'crop', handle, orig: shape });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, setDragBoth]);

  // クロップ窓内ドラッグ（画像パン）の開始
  const handleCropPanPointerDown = useCallback((e: React.PointerEvent, shapeId: string) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'image') return;
    const raw = toCanvas(e.clientX, e.clientY);
    store.snapshot();
    setDragBoth({ kind: 'cropPan', orig: shape, startX: raw.x, startY: raw.y });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, toCanvas, setDragBoth]);

  const handleLinePointPointerDown = useCallback((e: React.PointerEvent, shapeId: string, pointIndex: number) => {
    store.snapshot();
    setDragBoth({ kind: 'linePoint', shapeId, pointIndex });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, setDragBoth]);

  // 曲線のベジェ制御点ドラッグ開始
  const handleCurveControlPointerDown = useCallback((e: React.PointerEvent, shapeId: string, segIndex: number, which: 'c1' | 'c2') => {
    store.snapshot();
    setDragBoth({ kind: 'curveControl', shapeId, segIndex, which });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, setDragBoth]);

  // 線上の右クリック → コンテキストメニュー（編集モードにも入る）
  const handleLineContextMenu = useCallback((e: React.MouseEvent, shapeId: string) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line') return;
    store.selectIds([shapeId]);
    setEditingLineId(shapeId);
    const pt = toSnapped(e.clientX, e.clientY);
    const afterIndex = nearestSegmentIndex(shape.points, pt);
    setLineContextMenu({
      shapeId, screenX: e.clientX, screenY: e.clientY,
      kind: 'segment', afterIndex, insertPt: pt,
    });
  }, [store, toSnapped]);

  // ウェイポイント上の右クリック → コンテキストメニュー
  const handleWaypointContextMenu = useCallback((e: React.MouseEvent, shapeId: string, pointIndex: number) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line') return;
    setLineContextMenu({
      shapeId, screenX: e.clientX, screenY: e.clientY,
      kind: 'waypoint', pointIndex,
      canDelete: shape.points.length > 2,
    });
  }, [store]);

  // 線編集モード: Shift+クリックで線上に点を追加
  const handleSegmentShiftAdd = useCallback((e: React.PointerEvent, shapeId: string) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line') return;
    const pt = toSnapped(e.clientX, e.clientY);
    const afterIndex = nearestSegmentIndex(shape.points, pt);
    store.snapshot();
    store.updateShape(shapeId, {
      points: [...shape.points.slice(0, afterIndex + 1), pt, ...shape.points.slice(afterIndex + 1)],
      curveControls: undefined,
    } as Partial<Shape>);
  }, [store, toSnapped]);

  // 折れ線⇔曲線の切り替え
  const toggleLinePathStyle = useCallback((shapeId: string) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line') return;
    store.snapshot();
    store.updateShape(shapeId, {
      pathStyle: shape.pathStyle === 'curve' ? 'orthogonal' : 'curve',
    } as Partial<Shape>);
    setLineContextMenu(null);
  }, [store]);

  // コンテキストメニューからラベル編集を開く
  const editLineLabel = useCallback((shapeId: string) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape) return;
    setLineContextMenu(null);
    openShapeEditor(shape);
  }, [store, openShapeEditor]);

  // ウェイポイント削除
  const deleteWaypoint = useCallback((shapeId: string, pointIndex: number) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line' || shape.points.length <= 2) return;
    store.snapshot();
    store.updateShape(shapeId, {
      points: shape.points.filter((_, i) => i !== pointIndex),
      curveControls: undefined,
    } as Partial<Shape>);
    setLineContextMenu(null);
  }, [store]);

  // ウェイポイント追加
  const insertWaypoint = useCallback((shapeId: string, afterIndex: number, insertPt: { x: number; y: number }) => {
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape || shape.type !== 'line') return;
    store.snapshot();
    const newPoints = [
      ...shape.points.slice(0, afterIndex + 1),
      insertPt,
      ...shape.points.slice(afterIndex + 1),
    ];
    store.updateShape(shapeId, { points: newPoints, curveControls: undefined } as Partial<Shape>);
    setLineContextMenu(null);
  }, [store]);

  const handleHandlePointerDown = useCallback((pos: HandlePosition, e: React.PointerEvent) => {
    e.stopPropagation();
    const origShapes = store.shapes.filter((s) => store.selectedIds.has(s.id));
    store.snapshot();
    setDragBoth({ kind: 'resize', handle: pos, startX: e.clientX, startY: e.clientY, origShapes });
    (internalRef.current as Element)?.setPointerCapture(e.pointerId);
  }, [store, setDragBoth]);

  // テキストオーバーレイの画面座標計算
  const textOverlayStyle = editingText ? {
    left: editingText.canvasX * store.zoom + store.panX,
    top: editingText.canvasY * store.zoom + store.panY,
    width: Math.max(editingText.canvasW * store.zoom, 160),
    height: Math.max(editingText.canvasH * store.zoom, 48),
    fontSize: settings.fontSizes[4] * store.zoom,
  } : null;

  // アクティブキャンバスの図形のみ表示・操作対象にする
  const visibleShapes = store.shapes.filter((s) => s.canvasId === store.activeCanvasId);
  const activeCanvas = store.canvases.find((c) => c.id === store.activeCanvasId);

  // 適用マスターの図形（背面に非編集表示、{page}等を置換）
  const pageCanvases = store.canvases.filter((c) => !c.isMaster);
  const pageNo = pageCanvases.findIndex((c) => c.id === store.activeCanvasId) + 1;
  const masterShapes = (() => {
    if (!activeCanvas?.masterId || activeCanvas.isMaster) return [];
    const raw = store.shapes.filter((s) => s.canvasId === activeCanvas.masterId);
    return substitutePageVars(raw, {
      page: pageNo > 0 ? pageNo : 0,
      pages: pageCanvases.length,
      canvasName: activeCanvas.name,
    });
  })();

  const selectedShapes = visibleShapes.filter((s) => store.selectedIds.has(s.id));
  const selectionBB = selectedShapes.length > 0 ? getUnionBoundingBox(selectedShapes) : null;

  // コンテキストメニュー対象の線（曲線切替の表示用）
  const menuTarget = lineContextMenu
    ? store.shapes.find((s) => s.id === lineContextMenu.shapeId)
    : undefined;
  const menuLine = menuTarget && menuTarget.type === 'line' ? menuTarget : undefined;

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <svg
        ref={internalRef}
        width={size.width}
        height={size.height}
        style={{ display: 'block', background: '#f5f5f5', cursor: spaceDown ? 'grab' : store.activeTool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* アートボード（キャンバス領域の可視化。透明背景は市松模様で表現） */}
        <defs data-ui="true">
          <pattern id="artboard-checker" width={16} height={16} patternUnits="userSpaceOnUse">
            <rect width={16} height={16} fill="#ffffff" />
            <rect width={8} height={8} fill="#e5e7eb" />
            <rect x={8} y={8} width={8} height={8} fill="#e5e7eb" />
          </pattern>
        </defs>
        {activeCanvas && (
          <g transform={`translate(${store.panX},${store.panY}) scale(${store.zoom})`}>
            <rect
              data-ui="true"
              x={0}
              y={0}
              width={activeCanvas.width}
              height={activeCanvas.height}
              fill={activeCanvas.background === 'transparent' ? 'url(#artboard-checker)' : (activeCanvas.background ?? '#ffffff')}
              stroke="#c8ccd4"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )}

        {/* グリッド（アートボードの上・図形の下に描画。書き出しには含まれない） */}
        {settings.showGrid && (
          <Grid width={size.width} height={size.height} gridSize={settings.gridSize} zoom={store.zoom} panX={store.panX} panY={store.panY} />
        )}

        {/* キャンバス変換グループ */}
        <g id="main-canvas-group" transform={`translate(${store.panX},${store.panY}) scale(${store.zoom})`}>
          {/* マスターキャンバスの共通要素（非編集・背面） */}
          {masterShapes.length > 0 && (
            <g data-ui="true" style={{ pointerEvents: 'none' }} opacity={1}>
              {masterShapes.map((shape) => (
                <MasterShapeView key={`m-${shape.id}`} shape={shape} allShapes={store.shapes} assets={store.assets} />
              ))}
            </g>
          )}
          {visibleShapes.map((shape) => {
            const selected = store.selectedIds.has(shape.id);
            const onPD = (e: React.PointerEvent) => handleShapePointerDown(e, shape.id);
            // 回転（線以外）: バウンディングボックス中心基準
            let rotateTransform: string | undefined;
            if (shape.rotation && shape.type !== 'line') {
              const rb = getBoundingBox(shape);
              rotateTransform = `rotate(${shape.rotation} ${rb.x + rb.width / 2} ${rb.y + rb.height / 2})`;
            }
            return (
              <g key={shape.id} data-shape-id={shape.id} transform={rotateTransform}>
                {shape.type === 'rect' && <RectShapeEl shape={shape} selected={selected} onPointerDown={onPD} onDoubleClick={() => {}} />}
                {shape.type === 'roundedRect' && <RoundedRectShapeEl shape={shape} selected={selected} onPointerDown={onPD} onDoubleClick={() => {}} />}
                {shape.type === 'ellipse' && <EllipseShapeEl shape={shape} selected={selected} onPointerDown={onPD} onDoubleClick={() => {}} />}
                {shape.type === 'line' && (
                  <LineShapeEl
                    shape={shape}
                    selected={selected}
                    editing={selected && editingLineId === shape.id}
                    shiftDown={shiftDown}
                    onPointerDown={onPD}
                    onPointPointerDown={(e, idx) => handleLinePointPointerDown(e, shape.id, idx)}
                    onLineContextMenu={(e) => handleLineContextMenu(e, shape.id)}
                    onWaypointContextMenu={(e, idx) => handleWaypointContextMenu(e, shape.id, idx)}
                    onSegmentShiftAdd={(e) => handleSegmentShiftAdd(e, shape.id)}
                    onWaypointShiftDelete={(idx) => deleteWaypoint(shape.id, idx)}
                    onCurveControlPointerDown={(e, seg, which) => handleCurveControlPointerDown(e, shape.id, seg, which)}
                  />
                )}
                {shape.type === 'text' && <TextShapeEl shape={shape} selected={selected} onPointerDown={onPD} onDoubleClick={() => {}} />}
                {shape.type === 'svg' && <SvgShapeEl shape={shape} selected={selected} onPointerDown={onPD} />}
                {shape.type === 'image' && (
                  <ImageShapeEl
                    shape={shape}
                    selected={selected}
                    cropping={selected && croppingImageId === shape.id}
                    onPointerDown={onPD}
                    onCropHandlePointerDown={(e, h) => handleCropHandlePointerDown(e, shape.id, h)}
                    onCropPanPointerDown={(e) => handleCropPanPointerDown(e, shape.id)}
                  />
                )}
                {shape.type === 'assetInstance' && (
                  <AssetInstanceEl shape={shape} assets={store.assets} selected={selected} onPointerDown={onPD} />
                )}
                {shape.type === 'table' && (
                  <TableShapeEl shape={shape} selected={selected} onPointerDown={onPD} />
                )}
                {shape.type === 'chart' && (
                  <ChartShapeEl shape={shape} allShapes={store.shapes} selected={selected} onPointerDown={onPD} />
                )}
                {/* メモインジケーター（ホバーで内容表示。書き出しには含まれない） */}
                {shape.memo && (() => {
                  const bb = getBoundingBox(shape);
                  return (
                    <g data-ui="true" onPointerDown={onPD} style={{ cursor: 'pointer' }}>
                      <title>{shape.memo}</title>
                      <circle cx={bb.x + bb.width + 2} cy={bb.y - 2} r={6} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
                      <text
                        x={bb.x + bb.width + 2}
                        y={bb.y - 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={8}
                        fontWeight={700}
                        fill="#fff"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        !
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* 描画プレビュー */}
          {drawPreview && drawPreview.w > 0 && drawPreview.h > 0 && (
            store.activeTool === 'rect' ? (
              <rect x={drawPreview.x} y={drawPreview.y} width={drawPreview.w} height={drawPreview.h}
                fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
            ) : store.activeTool === 'roundedRect' ? (
              <rect x={drawPreview.x} y={drawPreview.y} width={drawPreview.w} height={drawPreview.h}
                rx={settings.defaultCornerRadius} ry={settings.defaultCornerRadius}
                fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
            ) : store.activeTool === 'ellipse' ? (
              <ellipse cx={drawPreview.x + drawPreview.w / 2} cy={drawPreview.y + drawPreview.h / 2}
                rx={drawPreview.w / 2} ry={drawPreview.h / 2}
                fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
            ) : null
          )}

          {/* 線プレビュー */}
          {linePreview.length >= 2 && (
            <polyline
              points={linePreview.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke="#2563eb" strokeWidth={1} strokeDasharray="4 2" vectorEffect="non-scaling-stroke"
            />
          )}

          {/* ラバーバンド */}
          {rubberBand && <RubberBand x={rubberBand.x} y={rubberBand.y} width={rubberBand.w} height={rubberBand.h} />}

          {/* 線端ドラッグ中の連結先ハイライト */}
          {attachTargetId && (() => {
            const t = store.shapes.find((sh) => sh.id === attachTargetId);
            if (!t) return null;
            const bb = getBoundingBox(t);
            return (
              <rect
                data-ui="true"
                x={bb.x - 3}
                y={bb.y - 3}
                width={bb.width + 6}
                height={bb.height + 6}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2.5}
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}

          {/* 選択ハンドル（1オブジェクト選択時。トリミング編集中は非表示） */}
          {selectionBB && selectedShapes.length === 1
            && selectedShapes[0].type !== 'line' && selectedShapes[0].type !== 'text'
            && selectedShapes[0].id !== croppingImageId && (
            <SelectionHandles box={selectionBB} onHandlePointerDown={handleHandlePointerDown} />
          )}
        </g>
      </svg>

      {/* ズームコントロール */}
      <div className={styles.zoomControl}>
        <button onClick={() => zoomAtCenter(store.zoom / 1.25)} title="縮小 (⌘−)">
          <span className="material-icons" style={{ fontSize: 16 }}>remove</span>
        </button>
        <button className={styles.zoomPct} onClick={() => zoomAtCenter(1)} title="100%に戻す (⌘1)">
          {Math.round(store.zoom * 100)}%
        </button>
        <button onClick={() => zoomAtCenter(store.zoom * 1.25)} title="拡大 (⌘+)">
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
        </button>
        <button onClick={() => fitToCanvas()} title="キャンバスにフィット (⌘0)">
          <span className="material-icons" style={{ fontSize: 16 }}>fit_screen</span>
        </button>
      </div>

      {/* テキスト編集オーバーレイ（HTML） */}
      {editingText && textOverlayStyle && (
        <div className={styles.textOverlay} style={{
          left: textOverlayStyle.left,
          top: textOverlayStyle.top,
          width: textOverlayStyle.width,
          height: textOverlayStyle.height,
        }}>
          <textarea
            ref={textareaRef}
            className={styles.textArea}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={handleTextKeyDown}
            onBlur={commitText}
            style={{
              fontSize: Math.max(textOverlayStyle.fontSize, 12),
              fontFamily: `"${settings.font}", sans-serif`,
            }}
          />
          <div className={styles.textHint}>Enter で改行 / ⌘Enter または枠外クリックで確定 / Esc でキャンセル</div>
        </div>
      )}

      {/* 線のウェイポイント編集コンテキストメニュー */}
      {lineContextMenu && (
        <>
          {/* バックドロップ: クリックで閉じる */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 499 }}
            onPointerDown={() => setLineContextMenu(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: lineContextMenu.screenX + 4,
              top: lineContextMenu.screenY + 4,
              zIndex: 500,
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              padding: '4px',
              minWidth: 170,
              fontSize: 13,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ padding: '4px 10px 6px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #f3f4f6', marginBottom: 2 }}>
              {lineContextMenu.kind === 'waypoint'
                ? `ポイント ${lineContextMenu.pointIndex + 1}`
                : '線分'}
            </div>

            {lineContextMenu.kind === 'segment' && (
              <LineMenuBtn
                onClick={() => insertWaypoint(lineContextMenu.shapeId, lineContextMenu.afterIndex, lineContextMenu.insertPt)}
                icon="add_circle_outline"
              >
                ここにポイントを追加
              </LineMenuBtn>
            )}

            {lineContextMenu.kind === 'waypoint' && (
              <LineMenuBtn
                onClick={() => deleteWaypoint(lineContextMenu.shapeId, lineContextMenu.pointIndex)}
                icon="remove_circle_outline"
                disabled={!lineContextMenu.canDelete}
                danger
              >
                {lineContextMenu.canDelete ? 'このポイントを削除' : 'ポイントは2点以上必要'}
              </LineMenuBtn>
            )}

            {menuLine && (
              <LineMenuBtn
                onClick={() => toggleLinePathStyle(lineContextMenu.shapeId)}
                icon="gesture"
              >
                {menuLine.pathStyle === 'curve' ? '折れ線にする' : '曲線にする'}
              </LineMenuBtn>
            )}

            <LineMenuBtn
              onClick={() => editLineLabel(lineContextMenu.shapeId)}
              icon="text_fields"
            >
              ラベルを編集
            </LineMenuBtn>

            <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 2, paddingTop: 2 }}>
              <LineMenuBtn onClick={() => setLineContextMenu(null)} icon="close">
                閉じる
              </LineMenuBtn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
