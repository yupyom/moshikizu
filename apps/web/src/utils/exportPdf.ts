import { PDFDocument } from 'pdf-lib';
import { svgToPngBlob } from './exportPng';

/**
 * SVGページ列からPDFを生成する（各ページをPNG化して埋め込むラスタPDF。
 * ベクターPDFは将来課題）。ページ寸法はキャンバスのpxをそのままポイントに使う。
 */
export async function buildPdfFromSvgPages(
  pages: { svg: string; width: number; height: number }[],
  scale = 2,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const png = await svgToPngBlob(p.svg, scale);
    const img = await doc.embedPng(await png.arrayBuffer());
    const page = doc.addPage([p.width, p.height]);
    page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
  }
  const bytes = await doc.save();
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: 'application/pdf' });
}
