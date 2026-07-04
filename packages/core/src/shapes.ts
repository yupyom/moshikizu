export type MarkerType =
  | 'none'
  | 'arrow'     // 開いた矢印（V字）
  | 'triangle'  // 塗りつぶし三角
  | 'square'
  | 'circle'
  | 'diamond'
  | 'bar';      // 端の垂直バー
export type StrokeDash = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type LinePathStyle = 'orthogonal' | 'curve';
export type FontWeight = 'regular' | 'bold';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type Tool =
  | 'select'
  | 'rect'
  | 'roundedRect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'svg';

export interface LabelStyle {
  text: string;
  fontSize: number;
  fontWeight: FontWeight;
  hAlign: HAlign;
  vAlign: VAlign;
  color: string;
}

interface BaseShape {
  id: string;
  /** 所属キャンバス（DrawDocument.canvases の id）。v1由来の欠損は読込時に補完される */
  canvasId?: string;
  strokeColor: string;
  strokeWidth: number;
  /** 省略時は 'solid' */
  strokeDash?: StrokeDash;
  label?: LabelStyle;
  /** 注記メモ（編集画面のみ表示、書き出しには含まれない。サーバー版コメントの前身） */
  memo?: string;
  /** グループID（同じIDの図形はまとめて選択・移動される） */
  groupId?: string;
  /** 回転角（度・時計回り。バウンディングボックス中心基準。線は対象外） */
  rotation?: number;
}

export interface RectShape extends BaseShape {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
}

export interface RoundedRectShape extends BaseShape {
  type: 'roundedRect';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  cornerRadius: number;
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
}

export interface LinePoint {
  x: number;
  y: number;
  /**
   * 図形への連結（コネクタ）。連結先図形のバウンディングボックス原点からの
   * オフセット（グリッド単位でスナップ済み）。図形の移動・リサイズに追従する
   */
  attach?: { shapeId: string; dx: number; dy: number };
}

/**
 * 曲線セグメントのベジェ制御点（カスタム時のみ保存）。
 * c1 はセグメント始点からの相対オフセット、c2 は終点からの相対オフセット。
 * 相対保存のため、線やポイントを移動しても形が追従する。
 */
export interface CurveControl {
  c1dx: number;
  c1dy: number;
  c2dx: number;
  c2dy: number;
}

export interface LineShape extends BaseShape {
  type: 'line';
  points: LinePoint[];
  /** 省略時は 'orthogonal'（直交折れ線・角丸） */
  pathStyle?: LinePathStyle;
  startMarker: MarkerType;
  endMarker: MarkerType;
  /** 先端マーカーの大きさ倍率。省略時は 1 */
  markerSize?: number;
  /** 曲線のカスタム制御点（セグメント番号→制御点。無指定セグメントはCatmull-Rom自動） */
  curveControls?: Record<number, CurveControl>;
}

export interface TextShape extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  /** 行間（フォントサイズ倍率）。省略時 1.4 */
  lineHeight?: number;
  /** 行揃え。省略時 left（x をアンカーとして揃える） */
  align?: HAlign;
  /** リスト表示（各行の行頭に記号/番号を付ける） */
  listStyle?: 'none' | 'bullet' | 'number';
  /** listStyle='bullet' の行頭文字。省略時 '•' */
  bullet?: string;
}

export interface SvgShape extends BaseShape {
  type: 'svg';
  x: number;
  y: number;
  width: number;
  height: number;
  svgContent: string;
  originalWidth: number;
  originalHeight: number;
}

export interface ImageShape extends BaseShape {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 画像データ（data URI。png/jpeg/webp等） */
  href: string;
  originalWidth: number;
  originalHeight: number;
  /** 非破壊トリミング（元画像座標系, px）。省略時は全体を表示 */
  crop?: { x: number; y: number; width: number; height: number };
}

export interface AssetInstanceShape extends BaseShape {
  type: 'assetInstance';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 参照するアセットマスター（DrawDocument.assets の id） */
  assetId: string;
  /**
   * インスタンス側の上書き（マスター内 shape.id → 部分パッチ）。
   * テキストプレースホルダーの差し替え等。マスター更新時も上書きは保持される
   */
  overrides?: Record<string, Partial<Shape>>;
}

export interface TableShape extends BaseShape {
  type: 'table';
  x: number;
  y: number;
  colWidths: number[];
  rowHeights: number[];
  /** セルの生テキスト（'=' 始まりは数式。表示は computeTable で解決） */
  cells: string[][];
  /** 上/左からのヘッダー行・列数、下/右からのフッター行・列数（塗り分け） */
  headerRows?: number;
  headerCols?: number;
  footerRows?: number;
  footerCols?: number;
  fontSize?: number;
  borderColor?: string;
  borderWidth?: number;
  headerFill?: string;
  /** セル書式（"r,c" → CellFormat）。core/table.ts 参照 */
  formats?: Record<string, { decimals?: number; comma?: boolean; percent?: boolean }>;
}

export type ChartType = 'line' | 'bar' | 'pie' | 'donut' | 'radar' | 'scatter' | 'waterfall';

export interface ChartShape extends BaseShape {
  type: 'chart';
  x: number;
  y: number;
  width: number;
  height: number;
  chartType: ChartType;
  /** 参照する表（同一ドキュメント内の TableShape.id。キャンバス跨ぎ可） */
  tableId: string;
  /** 参照範囲（'A1:C4'）。省略時は表全体 */
  dataRange?: string;
  /** 先頭行を系列名に使う（デフォルトtrue） */
  firstRowIsHeader?: boolean;
  /** 先頭列をカテゴリラベルに使う（デフォルトtrue） */
  firstColIsLabels?: boolean;
  showLegend?: boolean;
  /** 系列色。省略時は標準パレット */
  colors?: string[];
}

export type Shape =
  | RectShape
  | RoundedRectShape
  | EllipseShape
  | LineShape
  | TextShape
  | SvgShape
  | ImageShape
  | AssetInstanceShape
  | TableShape
  | ChartShape;

export interface AppSettings {
  gridSize: number;
  defaultCornerRadius: number;
  colorPalette: string[];
  strokeWidths: number[];
  font: string;
  fontSizes: number[];
  /** PNG書き出しの倍率 */
  pngScale: number;
  /** グリッド点の表示（書き出しには常に含まれない） */
  showGrid: boolean;
  /** アプリ内MCPホストの有効化（デスクトップ版のみ） */
  mcpHostEnabled: boolean;
  /** アプリ内MCPホストのポート */
  mcpHostPort: number;
  /** 更新確認チャンネル（main=安定版 / dev=プレリリース含む） */
  updateChannel: 'main' | 'dev';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HandlePosition =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se';
