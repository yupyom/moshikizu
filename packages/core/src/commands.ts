import type { DrawDocument, Canvas } from './document';
import { createCanvas, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, DOCUMENT_VERSION } from './document';
import type { Shape } from './shapes';

/**
 * DrawDocument を操作するコマンド層（イミュータブル）。
 * MCPサーバー・将来のコラボ同期・UIストアが共有する編集APIの土台。
 * すべて新しいドキュメントを返し、updatedAt を更新する。
 */

declare const crypto: { randomUUID(): string };

function touch(doc: DrawDocument): DrawDocument {
  return { ...doc, updatedAt: new Date().toISOString() };
}

/** 図形を追加する。id・canvasId が無ければ補完し、追加した図形の id 一覧も返す */
export function docAddShapes(
  doc: DrawDocument,
  shapes: Array<Shape | (Omit<Shape, 'id'> & { id?: string })>,
  canvasId?: string,
): { doc: DrawDocument; ids: string[] } {
  const targetCanvas = canvasId ?? doc.canvases[0]?.id;
  if (!targetCanvas || !doc.canvases.some((c) => c.id === targetCanvas)) {
    throw new Error(`キャンバスが見つかりません: ${canvasId}`);
  }
  const added = shapes.map((s) => ({
    ...s,
    id: s.id ?? crypto.randomUUID(),
    canvasId: (s as Shape).canvasId && doc.canvases.some((c) => c.id === (s as Shape).canvasId)
      ? (s as Shape).canvasId
      : targetCanvas,
  }) as Shape);
  return {
    doc: touch({ ...doc, shapes: [...doc.shapes, ...added] }),
    ids: added.map((s) => s.id),
  };
}

/** 図形を部分更新する。存在しなければ throw */
export function docUpdateShape(
  doc: DrawDocument,
  id: string,
  patch: Partial<Shape>,
): DrawDocument {
  if (!doc.shapes.some((s) => s.id === id)) {
    throw new Error(`図形が見つかりません: ${id}`);
  }
  return touch({
    ...doc,
    shapes: doc.shapes.map((s) => (s.id === id ? ({ ...s, ...patch, id: s.id } as Shape) : s)),
  });
}

/** 図形を削除する（存在しない id は無視）。削除数も返す */
export function docDeleteShapes(
  doc: DrawDocument,
  ids: string[],
): { doc: DrawDocument; deleted: number } {
  const idSet = new Set(ids);
  const remaining = doc.shapes.filter((s) => !idSet.has(s.id));
  return {
    doc: touch({ ...doc, shapes: remaining }),
    deleted: doc.shapes.length - remaining.length,
  };
}

/** キャンバスを追加する */
export function docAddCanvas(
  doc: DrawDocument,
  name?: string,
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
): { doc: DrawDocument; canvas: Canvas } {
  const canvas = createCanvas(name ?? `キャンバス ${doc.canvases.length + 1}`, width, height);
  return { doc: touch({ ...doc, canvases: [...doc.canvases, canvas] }), canvas };
}

/** キャンバスを部分更新する。存在しなければ throw */
export function docUpdateCanvas(
  doc: DrawDocument,
  id: string,
  patch: Partial<Canvas>,
): DrawDocument {
  if (!doc.canvases.some((c) => c.id === id)) {
    throw new Error(`キャンバスが見つかりません: ${id}`);
  }
  return touch({
    ...doc,
    canvases: doc.canvases.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
  });
}

/** 新規ドキュメントを作る */
export function createDocument(
  name = '無題',
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
): DrawDocument {
  return {
    version: DOCUMENT_VERSION,
    id: crypto.randomUUID(),
    name,
    updatedAt: new Date().toISOString(),
    canvases: [createCanvas('キャンバス 1', canvasWidth, canvasHeight)],
    shapes: [],
    assets: [],
  };
}
