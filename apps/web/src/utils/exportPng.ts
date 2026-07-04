/**
 * SVG文字列をブラウザ内で PNG Blob に変換する（バックエンド不要）。
 *
 * 制約: <img> として読み込んだ SVG は外部リソース（Webフォント等）を
 * 取得できないため、呼び出し側は fontImport: false でレンダリングした
 * SVG を渡すこと。フォントは data URI 埋め込みで解決する（Phase 2）。
 */
export async function svgToPngBlob(svgStr: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVGの読み込みに失敗しました'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d コンテキストを取得できません');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNGの生成に失敗しました'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
