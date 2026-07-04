/**
 * テーマ: ブランドカラー・フォント等の設定セット。
 * ファイル(.drawtheme.json)としてエクスポート/インポートでき、
 * サーバー版へのアップロード共有（Phase 6）も同じ形式を使う。
 */

export const THEME_VERSION = 1;

export interface Theme {
  version: number;
  name: string;
  colorPalette: string[];
  font: string;
  strokeWidths: number[];
  fontSizes?: number[];
  defaultCornerRadius?: number;
}

/** インポートデータを Theme に正規化する。不正ならthrow */
export function parseTheme(data: unknown): Theme {
  if (typeof data !== 'object' || data === null) {
    throw new Error('テーマファイルの形式が不正です');
  }
  const d = data as Partial<Theme>;
  if (typeof d.name !== 'string' || !d.name.trim()) {
    throw new Error('テーマ名がありません');
  }
  if (!Array.isArray(d.colorPalette) || d.colorPalette.some((c) => typeof c !== 'string')) {
    throw new Error('カラーパレットが不正です');
  }
  if (typeof d.font !== 'string' || !d.font.trim()) {
    throw new Error('フォント指定が不正です');
  }
  if (!Array.isArray(d.strokeWidths) || d.strokeWidths.some((w) => typeof w !== 'number')) {
    throw new Error('線幅設定が不正です');
  }
  return {
    version: d.version ?? THEME_VERSION,
    name: d.name.trim(),
    colorPalette: d.colorPalette,
    font: d.font.trim(),
    strokeWidths: d.strokeWidths,
    ...(Array.isArray(d.fontSizes) && d.fontSizes.every((s) => typeof s === 'number')
      ? { fontSizes: d.fontSizes }
      : {}),
    ...(typeof d.defaultCornerRadius === 'number'
      ? { defaultCornerRadius: d.defaultCornerRadius }
      : {}),
  };
}
