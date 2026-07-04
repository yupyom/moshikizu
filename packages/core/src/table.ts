/**
 * 表（TableShape）の数式エンジンと数値書式。
 * - セル先頭が '=' なら数式: 四則演算・カッコ・セル参照(A1)・範囲(A1:B3)・SUM/AVG
 * - エラーは '#ERR'、循環参照は '#CIRC'
 * - 書式: 小数点桁数・カンマ区切り・パーセント（セル単位）
 */

export interface CellFormat {
  decimals?: number;
  comma?: boolean;
  percent?: boolean;
}

/** 列番号(0始まり) → 'A','B',...,'Z','AA'.. */
export function colLabel(c: number): string {
  let s = '';
  let n = c;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** 'B2' → {r:1, c:1}。不正は null */
export function parseCellRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)([0-9]+)$/i.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

export function formatNumber(n: number, fmt?: CellFormat): string {
  let v = n;
  if (fmt?.percent) v = n * 100;
  let s: string;
  if (fmt?.decimals !== undefined) {
    s = v.toFixed(fmt.decimals);
  } else {
    s = String(Math.round(v * 1e6) / 1e6);
  }
  if (fmt?.comma) {
    const [int, dec] = s.split('.');
    const sign = int.startsWith('-') ? '-' : '';
    const digits = sign ? int.slice(1) : int;
    s = sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec !== undefined ? `.${dec}` : '');
  }
  if (fmt?.percent) s += '%';
  return s;
}

// ---- 数式評価（再帰下降パーサ） ----

type GetCell = (r: number, c: number) => number; // 数値化できないセルは NaN

class Parser {
  private pos = 0;
  private src: string;
  private getCell: GetCell;

  constructor(src: string, getCell: GetCell) {
    this.src = src;
    this.getCell = getCell;
  }

  parse(): number {
    const v = this.expr();
    this.skip();
    if (this.pos < this.src.length) throw new Error('parse');
    return v;
  }

  private skip() {
    while (this.pos < this.src.length && this.src[this.pos] === ' ') this.pos++;
  }

  private expr(): number {
    let v = this.term();
    for (;;) {
      this.skip();
      const ch = this.src[this.pos];
      if (ch === '+') { this.pos++; v += this.term(); }
      else if (ch === '-') { this.pos++; v -= this.term(); }
      else return v;
    }
  }

  private term(): number {
    let v = this.factor();
    for (;;) {
      this.skip();
      const ch = this.src[this.pos];
      if (ch === '*') { this.pos++; v *= this.factor(); }
      else if (ch === '/') { this.pos++; v /= this.factor(); }
      else return v;
    }
  }

  private factor(): number {
    this.skip();
    const ch = this.src[this.pos];
    if (ch === '-') { this.pos++; return -this.factor(); }
    if (ch === '(') {
      this.pos++;
      const v = this.expr();
      this.skip();
      if (this.src[this.pos] !== ')') throw new Error('paren');
      this.pos++;
      return v;
    }
    // 関数 or セル参照 or 数値
    const rest = this.src.slice(this.pos);
    const fn = /^(SUM|AVG)\s*\(/i.exec(rest);
    if (fn) {
      this.pos += fn[0].length;
      const values = this.rangeValues();
      this.skip();
      if (this.src[this.pos] !== ')') throw new Error('paren');
      this.pos++;
      if (fn[1].toUpperCase() === 'SUM') return values.reduce((a, b) => a + b, 0);
      if (values.length === 0) throw new Error('empty');
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    const ref = /^[A-Z]+[0-9]+/i.exec(rest);
    if (ref) {
      this.pos += ref[0].length;
      const rc = parseCellRef(ref[0])!;
      const v = this.getCell(rc.r, rc.c);
      if (Number.isNaN(v)) throw new Error('ref');
      return v;
    }
    const num = /^\d+(\.\d+)?/.exec(rest);
    if (num) {
      this.pos += num[0].length;
      return Number(num[0]);
    }
    throw new Error('token');
  }

  /** A1:B3 または単一セル/数値の列。範囲内の空・非数値セルは無視 */
  private rangeValues(): number[] {
    this.skip();
    const m = /^([A-Z]+[0-9]+)\s*:\s*([A-Z]+[0-9]+)/i.exec(this.src.slice(this.pos));
    if (m) {
      this.pos += m[0].length;
      const a = parseCellRef(m[1])!;
      const b = parseCellRef(m[2])!;
      const out: number[] = [];
      for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
        for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) {
          const v = this.getCell(r, c);
          if (!Number.isNaN(v)) out.push(v);
        }
      }
      return out;
    }
    return [this.expr()];
  }
}

export interface ComputedTable {
  /** 表示用文字列（書式適用済み） */
  display: string[][];
  /** 数値値（数値化できないセルは NaN）。グラフの参照元 */
  values: number[][];
}

/** 表全体を計算する。数式・参照・循環・書式を解決 */
export function computeTable(
  cells: string[][],
  formats?: Record<string, CellFormat>,
): ComputedTable {
  const rows = cells.length;
  const cols = rows > 0 ? Math.max(...cells.map((r) => r.length)) : 0;
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const getNumeric = (r: number, c: number): number => {
    if (r < 0 || c < 0 || r >= rows || c >= (cells[r]?.length ?? 0)) return NaN;
    const key = `${r},${c}`;
    if (memo.has(key)) return memo.get(key)!;
    if (visiting.has(key)) throw new Error('circular');
    const raw = (cells[r][c] ?? '').trim();
    let v: number;
    if (raw.startsWith('=')) {
      visiting.add(key);
      try {
        v = new Parser(raw.slice(1), getNumeric).parse();
      } finally {
        visiting.delete(key);
      }
    } else {
      // 数値解釈（カンマ・%許容）
      const cleaned = raw.replace(/,/g, '');
      if (/^-?\d+(\.\d+)?%$/.test(cleaned)) v = Number(cleaned.slice(0, -1)) / 100;
      else v = cleaned === '' ? NaN : Number(cleaned);
    }
    memo.set(key, v);
    return v;
  };

  const display: string[][] = [];
  const values: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const drow: string[] = [];
    const vrow: number[] = [];
    for (let c = 0; c < cols; c++) {
      const raw = (cells[r][c] ?? '').trim();
      const fmt = formats?.[`${r},${c}`];
      if (raw.startsWith('=')) {
        try {
          const v = getNumeric(r, c);
          if (Number.isNaN(v) || !Number.isFinite(v)) {
            drow.push('#ERR');
            vrow.push(NaN);
          } else {
            drow.push(formatNumber(v, fmt));
            vrow.push(v);
          }
        } catch (e) {
          drow.push(e instanceof Error && e.message === 'circular' ? '#CIRC' : '#ERR');
          vrow.push(NaN);
        }
      } else {
        let v: number;
        try {
          v = getNumeric(r, c);
        } catch {
          v = NaN;
        }
        vrow.push(v);
        drow.push(!Number.isNaN(v) && fmt ? formatNumber(v, fmt) : raw);
      }
    }
    display.push(drow);
    values.push(vrow);
  }
  return { display, values };
}

/** 表のグリッド座標（相対）。colX/rowY は各境界のオフセット（長さ = n+1） */
export function tableLayout(colWidths: number[], rowHeights: number[]): {
  colX: number[];
  rowY: number[];
  width: number;
  height: number;
} {
  const colX = [0];
  for (const w of colWidths) colX.push(colX[colX.length - 1] + w);
  const rowY = [0];
  for (const h of rowHeights) rowY.push(rowY[rowY.length - 1] + h);
  return { colX, rowY, width: colX[colX.length - 1], height: rowY[rowY.length - 1] };
}
