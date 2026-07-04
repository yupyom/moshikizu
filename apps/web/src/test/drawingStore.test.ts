import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '../store/drawingStore';
import type { RectShape } from '@draw/core';
import { v4 as uuidv4 } from 'uuid';

const makeRect = (): RectShape => ({
  id: uuidv4(), type: 'rect', x: 0, y: 0, width: 100, height: 80,
  fillColor: '#fff', strokeColor: '#000', strokeWidth: 1,
});

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  useDrawingStore.setState({ activeTool: 'select', zoom: 1, panX: 0, panY: 0 });
});

describe('drawingStore', () => {
  it('adds a shape', () => {
    const { addShape } = useDrawingStore.getState();
    const r = makeRect();
    addShape(r);
    expect(useDrawingStore.getState().shapes).toHaveLength(1);
  });

  it('deletes selected shape', () => {
    const { addShape, selectIds, deleteSelected } = useDrawingStore.getState();
    const r = makeRect();
    addShape(r);
    selectIds([r.id]);
    deleteSelected();
    expect(useDrawingStore.getState().shapes).toHaveLength(0);
  });

  it('supports undo', () => {
    const store = useDrawingStore.getState();
    const r = makeRect();
    store.addShape(r); // snapshot + add
    expect(useDrawingStore.getState().shapes).toHaveLength(1);
    useDrawingStore.getState().undo();
    expect(useDrawingStore.getState().shapes).toHaveLength(0);
  });

  it('supports redo after undo', () => {
    const store = useDrawingStore.getState();
    const r = makeRect();
    store.addShape(r);
    useDrawingStore.getState().undo();
    useDrawingStore.getState().redo();
    expect(useDrawingStore.getState().shapes).toHaveLength(1);
  });

  it('updates a shape', () => {
    const store = useDrawingStore.getState();
    const r = makeRect();
    store.addShape(r);
    store.updateShape(r.id, { x: 50 } as Partial<RectShape>);
    const updated = useDrawingStore.getState().shapes[0] as RectShape;
    expect(updated.x).toBe(50);
  });

  it('duplicates selected shapes with offset', () => {
    const store = useDrawingStore.getState();
    const r = makeRect();
    store.addShape(r);
    store.selectIds([r.id]);
    store.duplicateSelected();
    const state = useDrawingStore.getState();
    expect(state.shapes).toHaveLength(2);
    const dup = state.shapes[1] as RectShape;
    expect(dup.x).toBe(20); // original 0 + offset 20
    expect(dup.y).toBe(20);
  });
});

describe('multi-canvas', () => {
  it('addShape はアクティブキャンバスの canvasId を刻印する', () => {
    const store = useDrawingStore.getState();
    store.addShape(makeRect());
    const state = useDrawingStore.getState();
    expect(state.shapes[0].canvasId).toBe(state.activeCanvasId);
  });

  it('addCanvas で追加・切替、undo で巻き戻せる', () => {
    const store = useDrawingStore.getState();
    const firstId = useDrawingStore.getState().activeCanvasId;
    store.addCanvas('2枚目');
    let state = useDrawingStore.getState();
    expect(state.canvases).toHaveLength(2);
    expect(state.activeCanvasId).not.toBe(firstId);
    state.undo();
    state = useDrawingStore.getState();
    expect(state.canvases).toHaveLength(1);
    expect(state.activeCanvasId).toBe(firstId);
  });

  it('deleteCanvas はそのキャンバスの図形も削除する', () => {
    const store = useDrawingStore.getState();
    store.addShape(makeRect()); // キャンバス1の図形
    store.addCanvas();
    const secondId = useDrawingStore.getState().activeCanvasId;
    useDrawingStore.getState().addShape(makeRect()); // キャンバス2の図形
    useDrawingStore.getState().deleteCanvas(secondId);
    const state = useDrawingStore.getState();
    expect(state.canvases).toHaveLength(1);
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].canvasId).toBe(state.activeCanvasId);
  });

  it('最後の1枚は削除できない', () => {
    const store = useDrawingStore.getState();
    store.deleteCanvas(useDrawingStore.getState().activeCanvasId);
    expect(useDrawingStore.getState().canvases).toHaveLength(1);
  });

  it('pasteShapes は貼り付け先キャンバスに canvasId を付け替える', () => {
    const store = useDrawingStore.getState();
    const r = makeRect();
    store.addShape(r);
    store.selectIds([r.id]);
    const copied = useDrawingStore.getState().copySelected();
    store.addCanvas();
    useDrawingStore.getState().pasteShapes(copied);
    const state = useDrawingStore.getState();
    const pasted = state.shapes[state.shapes.length - 1];
    expect(pasted.canvasId).toBe(state.activeCanvasId);
    expect(pasted.canvasId).not.toBe(r.canvasId);
  });
});
