import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Shape, Tool, Canvas, DrawDocument, AssetMaster } from '@draw/core';
import { createCanvas, moveShape, createAssetMaster, syncAttachedPoints } from '@draw/core';

/** undo/redo の1エントリ（shape編集とキャンバス操作の両方を巻き戻せる） */
interface HistoryEntry {
  shapes: Shape[];
  canvases: Canvas[];
  assets: AssetMaster[];
}

export interface DrawingState {
  shapes: Shape[];
  canvases: Canvas[];
  assets: AssetMaster[];
  activeCanvasId: string;
  selectedIds: Set<string>;
  activeTool: Tool;
  zoom: number;
  panX: number;
  panY: number;
  projectId: string | null;
  projectName: string;

  // undo/redo
  past: HistoryEntry[];
  future: HistoryEntry[];

  // actions
  setTool: (tool: Tool) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  deleteSelected: () => void;
  selectIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  setShapes: (shapes: Shape[]) => void;
  moveSelected: (dx: number, dy: number) => void;
  duplicateSelected: () => void;
  /** Alt+ドラッグ用: オフセット無しで複製し複製側を選択 */
  duplicateSelectedInPlace: () => void;
  /** 重なり順の変更（アクティブキャンバス内） */
  reorderSelected: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
  /** 選択図形をグループ化 / 解除 */
  groupSelection: () => void;
  ungroupSelection: () => void;
  copySelected: () => Shape[];
  pasteShapes: (shapes: Shape[]) => void;
  /** アプリ内クリップボード */
  clipboard: Shape[];
  copyToClipboard: () => void;
  cutToClipboard: () => void;
  pasteClipboard: () => void;
  undo: () => void;
  redo: () => void;
  snapshot: () => void; // undo用スナップショット保存
  setProject: (id: string | null, name: string) => void;

  // ドキュメント
  loadDocument: (doc: DrawDocument) => void;
  newDocument: (width?: number, height?: number) => void;

  // アセットライブラリ
  createAssetFromSelection: (name: string) => void;
  placeAsset: (assetId: string) => void;
  deleteAsset: (assetId: string) => void;

  // キャンバス
  setActiveCanvas: (id: string) => void;
  addCanvas: (name?: string) => void;
  updateCanvas: (id: string, patch: Partial<Canvas>) => void;
  deleteCanvas: (id: string) => void;
  /** キャンバスの並べ替え（タブD&D。ページ順に直結） */
  moveCanvas: (fromIndex: number, toIndex: number) => void;
}

const MAX_HISTORY = 50;

const initialCanvas = createCanvas('キャンバス 1');

export const useDrawingStore = create<DrawingState>((set, get) => ({
  shapes: [],
  canvases: [initialCanvas],
  assets: [],
  activeCanvasId: initialCanvas.id,
  selectedIds: new Set(),
  activeTool: 'select',
  zoom: 1,
  panX: 0,
  panY: 0,
  projectId: null,
  projectName: '無題',
  past: [],
  future: [],

  setTool: (tool) => set({ activeTool: tool, selectedIds: new Set() }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),

  snapshot: () => {
    const { shapes, canvases, assets, past } = get();
    const entry: HistoryEntry = {
      shapes: shapes.map((s) => ({ ...s })),
      canvases: canvases.map((c) => ({ ...c })),
      assets: assets.map((a) => ({ ...a })),
    };
    set({ past: [...past, entry].slice(-MAX_HISTORY), future: [] });
  },

  addShape: (shape) => {
    get().snapshot();
    const canvasId = shape.canvasId ?? get().activeCanvasId;
    set((state) => ({ shapes: [...state.shapes, { ...shape, canvasId }] }));
  },

  updateShape: (id, patch) => {
    set((state) => ({
      shapes: syncAttachedPoints(
        state.shapes.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s)),
      ),
    }));
  },

  deleteSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    get().snapshot();
    set((state) => ({
      shapes: state.shapes.filter((s) => !state.selectedIds.has(s.id)),
      selectedIds: new Set(),
    }));
  },

  selectIds: (ids) => set({ selectedIds: new Set(ids) }),
  addToSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      next.add(id);
      return { selectedIds: next };
    }),
  clearSelection: () => set({ selectedIds: new Set() }),

  setShapes: (shapes) => set({ shapes }),

  moveSelected: (dx, dy) => {
    set((state) => ({
      shapes: syncAttachedPoints(
        state.shapes.map((s) =>
          state.selectedIds.has(s.id) ? moveShape(s, dx, dy) : s,
        ),
      ),
    }));
  },

  duplicateSelected: () => {
    const { shapes, selectedIds, activeCanvasId } = get();
    const offset = 20;
    const targets = shapes.filter((s) => selectedIds.has(s.id));
    const newShapes = targets.map((s) => {
      const copied = moveShape({ ...s, id: uuidv4() } as Shape, offset, offset);
      return { ...copied, canvasId: activeCanvasId } as Shape;
    });
    get().snapshot();
    set((state) => ({
      shapes: [...state.shapes, ...newShapes],
      selectedIds: new Set(newShapes.map((s) => s.id)),
    }));
  },

  groupSelection: () => {
    const { selectedIds } = get();
    if (selectedIds.size < 2) return;
    get().snapshot();
    const gid = uuidv4();
    set((state) => ({
      shapes: state.shapes.map((s) => (state.selectedIds.has(s.id) ? { ...s, groupId: gid } : s)),
    }));
  },

  ungroupSelection: () => {
    const { selectedIds, shapes } = get();
    if (![...selectedIds].some((id) => shapes.find((s) => s.id === id)?.groupId)) return;
    get().snapshot();
    set((state) => ({
      shapes: state.shapes.map((s) =>
        state.selectedIds.has(s.id) ? { ...s, groupId: undefined } : s,
      ),
    }));
  },

  duplicateSelectedInPlace: () => {
    const { shapes, selectedIds, activeCanvasId } = get();
    const targets = shapes.filter((s) => selectedIds.has(s.id));
    if (targets.length === 0) return;
    const newShapes = targets.map((s) => ({ ...s, id: uuidv4(), canvasId: activeCanvasId } as Shape));
    get().snapshot();
    set((state) => ({
      shapes: [...state.shapes, ...newShapes],
      selectedIds: new Set(newShapes.map((s) => s.id)),
    }));
  },

  reorderSelected: (dir) => {
    const { shapes, selectedIds, activeCanvasId } = get();
    if (selectedIds.size === 0) return;
    get().snapshot();
    const others = shapes.filter((s) => s.canvasId !== activeCanvasId);
    const inCanvas = shapes.filter((s) => s.canvasId === activeCanvasId);
    let arranged: Shape[];
    if (dir === 'front') {
      arranged = [...inCanvas.filter((s) => !selectedIds.has(s.id)), ...inCanvas.filter((s) => selectedIds.has(s.id))];
    } else if (dir === 'back') {
      arranged = [...inCanvas.filter((s) => selectedIds.has(s.id)), ...inCanvas.filter((s) => !selectedIds.has(s.id))];
    } else {
      arranged = [...inCanvas];
      const idxs = arranged
        .map((s, i) => (selectedIds.has(s.id) ? i : -1))
        .filter((i) => i >= 0);
      if (dir === 'forward') {
        for (const i of [...idxs].reverse()) {
          if (i < arranged.length - 1 && !selectedIds.has(arranged[i + 1].id)) {
            [arranged[i], arranged[i + 1]] = [arranged[i + 1], arranged[i]];
          }
        }
      } else {
        for (const i of idxs) {
          if (i > 0 && !selectedIds.has(arranged[i - 1].id)) {
            [arranged[i], arranged[i - 1]] = [arranged[i - 1], arranged[i]];
          }
        }
      }
    }
    set({ shapes: [...others, ...arranged] });
  },

  copySelected: () => {
    const { shapes, selectedIds } = get();
    return shapes.filter((s) => selectedIds.has(s.id));
  },

  clipboard: [],

  copyToClipboard: () => {
    const copied = get().copySelected();
    if (copied.length > 0) set({ clipboard: copied });
  },

  cutToClipboard: () => {
    const copied = get().copySelected();
    if (copied.length === 0) return;
    set({ clipboard: copied });
    get().deleteSelected();
  },

  pasteClipboard: () => {
    get().pasteShapes(get().clipboard);
  },

  pasteShapes: (shapesToPaste) => {
    if (shapesToPaste.length === 0) return;
    const offset = 20;
    const { activeCanvasId } = get();
    const newShapes = shapesToPaste.map((s) => {
      const copied = moveShape({ ...s, id: uuidv4() } as Shape, offset, offset);
      // 貼り付け先は常に現在のキャンバス（別キャンバスからのコピーにも対応）
      return { ...copied, canvasId: activeCanvasId } as Shape;
    });
    get().snapshot();
    set((state) => ({
      shapes: [...state.shapes, ...newShapes],
      selectedIds: new Set(newShapes.map((s) => s.id)),
    }));
  },

  undo: () => {
    const { past, shapes, canvases, assets, future, activeCanvasId } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      shapes: prev.shapes,
      canvases: prev.canvases,
      assets: prev.assets,
      activeCanvasId: prev.canvases.some((c) => c.id === activeCanvasId)
        ? activeCanvasId
        : prev.canvases[0].id,
      selectedIds: new Set(),
      past: past.slice(0, -1),
      future: [{ shapes, canvases, assets }, ...future].slice(0, MAX_HISTORY),
    });
  },

  redo: () => {
    const { future, shapes, canvases, assets, past, activeCanvasId } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      shapes: next.shapes,
      canvases: next.canvases,
      assets: next.assets,
      activeCanvasId: next.canvases.some((c) => c.id === activeCanvasId)
        ? activeCanvasId
        : next.canvases[0].id,
      selectedIds: new Set(),
      future: future.slice(1),
      past: [...past, { shapes, canvases, assets }].slice(-MAX_HISTORY),
    });
  },

  setProject: (id, name) => set({ projectId: id, projectName: name }),

  loadDocument: (doc) => {
    set({
      shapes: doc.shapes,
      canvases: doc.canvases,
      assets: doc.assets,
      activeCanvasId: doc.canvases[0].id,
      selectedIds: new Set(),
      projectId: doc.id,
      projectName: doc.name,
      past: [],
      future: [],
    });
  },

  newDocument: (width?: number, height?: number) => {
    const canvas = createCanvas('キャンバス 1', width, height);
    set({
      shapes: [],
      canvases: [canvas],
      assets: [],
      activeCanvasId: canvas.id,
      selectedIds: new Set(),
      projectId: null,
      projectName: '無題',
      past: [],
      future: [],
    });
  },

  createAssetFromSelection: (name) => {
    const { shapes, selectedIds, assets } = get();
    const selected = shapes.filter((s) => selectedIds.has(s.id));
    const master = createAssetMaster(name, selected);
    get().snapshot();
    // 同名アセットは id を引き継いで更新（既存インスタンスに反映される）
    const existing = assets.find((a) => a.name === name);
    const finalMaster = existing ? { ...master, id: existing.id } : master;
    set({ assets: [...assets.filter((a) => a.name !== name), finalMaster] });
  },

  placeAsset: (assetId) => {
    const { assets, activeCanvasId } = get();
    const master = assets.find((a) => a.id === assetId);
    if (!master) return;
    get().snapshot();
    const instance: Shape = {
      id: uuidv4(),
      type: 'assetInstance',
      canvasId: activeCanvasId,
      x: 140,
      y: 140,
      width: master.width,
      height: master.height,
      assetId,
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
    set((state) => ({
      shapes: [...state.shapes, instance],
      selectedIds: new Set([instance.id]),
    }));
  },

  deleteAsset: (assetId) => {
    get().snapshot();
    set((state) => ({ assets: state.assets.filter((a) => a.id !== assetId) }));
  },

  setActiveCanvas: (id) => {
    if (!get().canvases.some((c) => c.id === id)) return;
    set({ activeCanvasId: id, selectedIds: new Set() });
  },

  addCanvas: (name) => {
    get().snapshot();
    const canvas = createCanvas(name ?? `キャンバス ${get().canvases.length + 1}`);
    set((state) => ({
      canvases: [...state.canvases, canvas],
      activeCanvasId: canvas.id,
      selectedIds: new Set(),
    }));
  },

  updateCanvas: (id, patch) => {
    set((state) => ({
      canvases: state.canvases.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
    }));
  },

  moveCanvas: (fromIndex, toIndex) => {
    const { canvases } = get();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= canvases.length || toIndex >= canvases.length) return;
    get().snapshot();
    const next = [...canvases];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ canvases: next });
  },

  deleteCanvas: (id) => {
    const { canvases } = get();
    if (canvases.length <= 1 || !canvases.some((c) => c.id === id)) return;
    get().snapshot();
    set((state) => {
      const remaining = state.canvases.filter((c) => c.id !== id);
      return {
        canvases: remaining,
        shapes: state.shapes.filter((s) => s.canvasId !== id),
        activeCanvasId: state.activeCanvasId === id ? remaining[0].id : state.activeCanvasId,
        selectedIds: new Set(),
      };
    });
  },
}));
