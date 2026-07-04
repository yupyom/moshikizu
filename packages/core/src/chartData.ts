import { computeTable, parseCellRef } from './table';
import type { CellFormat } from './table';

/**
 * グラフのデータ抽出。表（cells）から範囲を切り出し、
 * カテゴリラベルと系列（名前+数値列）に整形する。
 * - 列 = 系列、行 = カテゴリ（一般的な表の向き）
 * - firstRowIsHeader: 先頭行を系列名として使う
 * - firstColIsLabels: 先頭列をカテゴリラベルとして使う
 */

export interface ChartData {
  categories: string[];
  series: { name: string; values: number[] }[];
}

export function extractChartData(
  cells: string[][],
  formats: Record<string, CellFormat> | undefined,
  range: string | undefined,
  firstRowIsHeader = true,
  firstColIsLabels = true,
): ChartData {
  const { display, values } = computeTable(cells, formats);
  const rows = display.length;
  const cols = rows > 0 ? display[0].length : 0;

  let r0 = 0, c0 = 0, r1 = rows - 1, c1 = cols - 1;
  if (range) {
    const m = /^([A-Z]+[0-9]+)\s*:\s*([A-Z]+[0-9]+)$/i.exec(range.trim());
    if (m) {
      const a = parseCellRef(m[1])!;
      const b = parseCellRef(m[2])!;
      r0 = Math.max(0, Math.min(a.r, b.r));
      r1 = Math.min(rows - 1, Math.max(a.r, b.r));
      c0 = Math.max(0, Math.min(a.c, b.c));
      c1 = Math.min(cols - 1, Math.max(a.c, b.c));
    }
  }

  const dataR0 = firstRowIsHeader ? r0 + 1 : r0;
  const dataC0 = firstColIsLabels ? c0 + 1 : c0;

  const categories: string[] = [];
  for (let r = dataR0; r <= r1; r++) {
    categories.push(firstColIsLabels ? (display[r]?.[c0] ?? '') : String(r - dataR0 + 1));
  }

  const series: ChartData['series'] = [];
  for (let c = dataC0; c <= c1; c++) {
    const name = firstRowIsHeader ? (display[r0]?.[c] ?? '') : `系列${c - dataC0 + 1}`;
    const vals: number[] = [];
    for (let r = dataR0; r <= r1; r++) {
      const v = values[r]?.[c];
      vals.push(v === undefined || Number.isNaN(v) ? 0 : v);
    }
    series.push({ name, values: vals });
  }
  return { categories, series };
}
