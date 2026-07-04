import { describe, it, expect } from 'vitest';
import type { ChartShape, TableShape } from '@draw/core';
import { renderChart } from '../src/renderChart';

const table: TableShape = {
  id: 'tbl', type: 'table', x: 0, y: 0,
  colWidths: [100, 80], rowHeights: [30, 30, 30, 30, 30, 30, 30],
  cells: [
    ['パッケージ', '行数'],
    ['core', '1631'],
    ['renderer', '720'],
    ['mcp', '241'],
    ['web', '6873'],
    ['desktop', '232'],
    ['server', '430'],
  ],
  strokeColor: 'transparent', strokeWidth: 0,
};

const donut = (width: number): ChartShape => ({
  id: 'ch', type: 'chart', x: 10, y: 10, width, height: 260,
  chartType: 'donut', tableId: 'tbl',
  strokeColor: 'transparent', strokeWidth: 0,
});

/** 凡例スウォッチ（10x10のrect）のx,y座標を抽出する */
function legendSwatches(svg: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /<rect x="([-\d.]+)" y="([-\d.]+)" width="10" height="10"/g;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    out.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return out;
}

describe('renderChart 凡例', () => {
  it('凡例はグラフ枠の右端を越えず、入り切らない分は折り返す', () => {
    const s = donut(300); // 6カテゴリは1行に入り切らない幅
    const svg = renderChart(s, table, 'Noto Sans JP');
    const sw = legendSwatches(svg);
    expect(sw).toHaveLength(6);
    for (const p of sw) {
      expect(p.x).toBeGreaterThanOrEqual(s.x);
      expect(p.x + 10).toBeLessThanOrEqual(s.x + s.width);
    }
    const rows = new Set(sw.map((p) => p.y));
    expect(rows.size).toBeGreaterThan(1); // 折り返しが起きている
  });

  it('十分な幅なら1行に収まる', () => {
    const s = donut(700);
    const svg = renderChart(s, table, 'Noto Sans JP');
    const rows = new Set(legendSwatches(svg).map((p) => p.y));
    expect(rows.size).toBe(1);
  });

  it('showLegend=false なら凡例を出さない（円系にも適用）', () => {
    const s = { ...donut(300), showLegend: false };
    const svg = renderChart(s, table, 'Noto Sans JP');
    expect(legendSwatches(svg)).toHaveLength(0);
  });
});
