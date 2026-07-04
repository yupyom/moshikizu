import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '⌘S', desc: '保存（上書き）' },
  { keys: '⌘O', desc: '開く' },
  { keys: '⌘Z / ⌘⇧Z', desc: '元に戻す / やり直す' },
  { keys: '⌘X / ⌘C / ⌘V', desc: 'カット / コピー / 貼り付け' },
  { keys: '⌘D', desc: '複製' },
  { keys: 'Delete', desc: '選択を削除' },
  { keys: '⌘F', desc: '検索と置換' },
  { keys: '⌘+ / ⌘−', desc: '拡大 / 縮小' },
  { keys: '⌘0 / ⌘1', desc: 'キャンバスにフィット / 100%' },
  { keys: '⌘+ホイール', desc: 'カーソル中心にズーム' },
  { keys: '中ボタン / Alt+ドラッグ', desc: 'キャンバスをパン' },
  { keys: 'ダブルクリック（図形）', desc: 'テキスト・ラベル編集' },
  { keys: 'ダブルクリック（線）', desc: 'ウェイポイント編集モード' },
  { keys: 'ダブルクリック（画像）', desc: 'トリミングモード' },
  { keys: '右クリック（線）', desc: 'ポイント追加・削除・曲線切替メニュー' },
  { keys: 'Esc', desc: 'モード解除・選択解除' },
];

export function ShortcutsDialog({ onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <h2 className={styles.title}>ショートカット一覧</h2>
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: '#2563eb', fontWeight: 500 }}>{s.keys}</td>
                <td style={{ padding: '5px 8px', color: '#333' }}>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
