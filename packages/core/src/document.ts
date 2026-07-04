import type { Shape } from './shapes';
import type { AssetMaster } from './assets';

/** .drawjson のスキーマバージョン。非互換変更時にインクリメントする */
export const DOCUMENT_VERSION = 3;

// v1: { version?, id, name, updatedAt, shapes } キャンバス概念なし
// v2: canvases[] を導入し、各 shape が canvasId でキャンバスに属する
// v3: assets[]（アセットマスター）を導入。旧版は空配列として読み込む

/** uuid生成（ブラウザ/Node両対応。lib.domに依存しないための局所宣言） */
declare const crypto: { randomUUID(): string };

export interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
  /** 背景色。省略時は白。'transparent' で透明（書き出しはアルファ付き） */
  background?: string;
  /** 注記メモ（編集画面のみ、書き出しには含まれない） */
  memo?: string;
  /** マスターキャンバス（他キャンバスの共通背景。ページ数に数えない） */
  isMaster?: boolean;
  /** 適用するマスターキャンバスの id */
  masterId?: string;
}

/**
 * 書き出し・表示に使うキャンバス背景色。
 * 透明指定なら undefined（= 背景を描かない）を返す。
 */
export function canvasBackgroundColor(c: Canvas): string | undefined {
  if (c.background === 'transparent') return undefined;
  return c.background ?? '#ffffff';
}

export const DEFAULT_CANVAS_WIDTH = 1600;
export const DEFAULT_CANVAS_HEIGHT = 900;

/** キャンバスサイズのプリセット（新規テンプレート・キャンバス設定で使用） */
export const CANVAS_PRESETS: { label: string; width: number; height: number }[] = [
  { label: 'プレゼン 16:9（1600×900）', width: 1600, height: 900 },
  { label: 'プレゼン 16:9 FHD（1920×1080）', width: 1920, height: 1080 },
  { label: 'プレゼン 4:3（1600×1200）', width: 1600, height: 1200 },
  { label: '動画 4K（3840×2160）', width: 3840, height: 2160 },
  { label: 'A4 横（1754×1240）', width: 1754, height: 1240 },
  { label: 'A4 縦（1240×1754）', width: 1240, height: 1754 },
  { label: '正方形・SNS（1080×1080）', width: 1080, height: 1080 },
];

export function createCanvas(
  name: string,
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
): Canvas {
  return { id: crypto.randomUUID(), name, width, height };
}

export interface DrawDocument {
  version: number;
  /** 未保存ドキュメントは null */
  id: string | null;
  name: string;
  updatedAt: string;
  canvases: Canvas[];
  /** 各 shape は canvasId でキャンバスに属する */
  shapes: Shape[];
  /** アセットマスター（マスター/インスタンス機能） */
  assets: AssetMaster[];
}

/**
 * 保存データを現行バージョンの DrawDocument に正規化する。
 * - version フィールドを持たない旧ファイルは v1 とみなす
 * - v1: デフォルトキャンバスを生成し全 shape を割り当てる
 *   （旧バックエンドの canvasWidth / canvasHeight があれば引き継ぐ）
 */
export function parseDocument(data: unknown): DrawDocument {
  if (typeof data !== 'object' || data === null) {
    throw new Error('不正なドキュメントです');
  }
  const d = data as Partial<DrawDocument> & { canvasWidth?: number; canvasHeight?: number };

  const shapes: Shape[] = Array.isArray(d.shapes) ? d.shapes : [];

  // キャンバス列の正規化（v1 は未定義）
  let canvases: Canvas[];
  if (Array.isArray(d.canvases) && d.canvases.length > 0) {
    canvases = d.canvases.map((c, i) => ({
      id: c?.id ?? crypto.randomUUID(),
      name: c?.name ?? `キャンバス ${i + 1}`,
      width: typeof c?.width === 'number' ? c.width : DEFAULT_CANVAS_WIDTH,
      height: typeof c?.height === 'number' ? c.height : DEFAULT_CANVAS_HEIGHT,
      ...(c?.background !== undefined ? { background: c.background } : {}),
      ...(c?.memo !== undefined ? { memo: c.memo } : {}),
      ...(c?.isMaster ? { isMaster: true } : {}),
      ...(c?.masterId !== undefined ? { masterId: c.masterId } : {}),
    }));
  } else {
    canvases = [
      createCanvas(
        'キャンバス 1',
        d.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
        d.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
      ),
    ];
  }

  // canvasId を持たない shape（v1 由来）は先頭キャンバスへ割り当て
  const primaryId = canvases[0].id;
  const canvasIds = new Set(canvases.map((c) => c.id));
  const normalizedShapes = shapes.map((s) =>
    s.canvasId && canvasIds.has(s.canvasId) ? s : { ...s, canvasId: primaryId },
  );

  // v3: アセットマスター（旧版は空）
  const assets: AssetMaster[] = Array.isArray(d.assets)
    ? d.assets.filter((a) => a && typeof a.id === 'string' && Array.isArray(a.shapes))
    : [];

  return {
    version: DOCUMENT_VERSION,
    id: d.id ?? null,
    name: d.name ?? '無題',
    updatedAt: d.updatedAt ?? '',
    canvases,
    shapes: normalizedShapes,
    assets,
  };
}
