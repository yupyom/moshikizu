/** ブラウザのダウンロードとして文字列/Blobを保存するヘルパー */

export function downloadSvg(svgStr: string, filename: string): void {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
