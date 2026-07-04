import type { Shape } from './shapes';

/**
 * ページ変数の置換（キャンバスマスター用）。
 * テキスト・ラベル中の {page} {pages} {canvas} を置き換えた新しい図形列を返す。
 */
export function substitutePageVars(
  shapes: Shape[],
  vars: { page: number; pages: number; canvasName?: string },
): Shape[] {
  const rep = (t: string) =>
    t
      .replaceAll('{page}', String(vars.page))
      .replaceAll('{pages}', String(vars.pages))
      .replaceAll('{canvas}', vars.canvasName ?? '');
  return shapes.map((s) => {
    let next = s;
    if (s.type === 'text' && /\{(page|pages|canvas)\}/.test(s.text)) {
      next = { ...next, text: rep(s.text) } as Shape;
    }
    if (next.label && /\{(page|pages|canvas)\}/.test(next.label.text)) {
      next = { ...next, label: { ...next.label, text: rep(next.label.text) } } as Shape;
    }
    return next;
  });
}

/**
 * ページ範囲指定（"1,3,4-5"）を 1始まりのページ番号配列にする。
 * 空文字は全ページ。不正トークンは無視、範囲外はクランプ。
 */
export function parsePageRanges(spec: string, max: number): number[] {
  const out: number[] = [];
  const push = (v: number) => {
    if (v >= 1 && v <= max && !out.includes(v)) out.push(v);
  };
  const trimmed = spec.trim();
  if (!trimmed) {
    for (let i = 1; i <= max; i++) out.push(i);
    return out;
  }
  for (const token of trimmed.split(',')) {
    const t = token.trim();
    const m = /^([0-9]+)\s*-\s*([0-9]+)$/.exec(t);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let v = Math.min(a, b); v <= Math.max(a, b); v++) push(v);
    } else if (/^[0-9]+$/.test(t)) {
      push(Number(t));
    }
  }
  return out;
}
