import { useState } from 'react';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  pageCount: number;
  onExport: (spec: string) => void;
  onClose: () => void;
}

/**
 * PDF書き出しのページ範囲入力。
 * 以前は window.prompt() を使っていたが、Electron が prompt() を
 * サポートしないためダイアログにしている。
 */
export function PdfExportDialog({ pageCount, onExport, onClose }: Props) {
  const [spec, setSpec] = useState('');

  const submit = () => {
    onClose();
    onExport(spec);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>PDF書き出し</h2>
        <div style={{ fontSize: 13, color: '#444' }}>
          ページ範囲（全{pageCount}ページ、例: 1,3,4-5。空欄=全ページ）
        </div>
        <div className={styles.row}>
          <input
            autoFocus
            type="text"
            placeholder="全ページ"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>キャンセル</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={submit}>書き出し</button>
        </div>
      </div>
    </div>
  );
}
