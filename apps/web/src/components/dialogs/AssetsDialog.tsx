import { useState } from 'react';
import { renderSvg } from '@draw/renderer';
import { useDrawingStore } from '../../store/drawingStore';
import { useSettingsStore } from '../../store/settingsStore';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * アセットライブラリ（マスター/インスタンス）。
 * 選択図形からマスターを登録し、配置するとインスタンスになる。
 * 同名で再登録するとマスターが更新され、全インスタンスに反映される。
 */
export function AssetsDialog({ onClose }: Props) {
  const store = useDrawingStore();
  const font = useSettingsStore((s) => s.settings.font);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const hasSelection = store.selectedIds.size > 0;

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('アセット名を入力してください');
      return;
    }
    try {
      const isUpdate = store.assets.some((a) => a.name === trimmed);
      store.createAssetFromSelection(trimmed);
      setMessage(isUpdate ? `「${trimmed}」を更新しました（全インスタンスに反映）` : `「${trimmed}」を登録しました`);
      setName('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '作成に失敗しました');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h2 className={styles.title}>アセットライブラリ</h2>

        <div className={styles.row}>
          <input
            style={{ flex: 1 }}
            placeholder="アセット名（同名で登録すると更新＝全インスタンスに反映）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          />
          <button
            className={`${styles.btn} ${styles.primary}`}
            disabled={!hasSelection}
            title={hasSelection ? '選択中の図形をアセットとして登録' : 'キャンバスで図形を選択してください'}
            onClick={create}
          >
            選択から登録
          </button>
        </div>
        {message && <div className={styles.message}>{message}</div>}

        {store.assets.length === 0 ? (
          <div className={styles.message}>
            アセットはまだありません。図形を選択して「選択から登録」で作成できます。
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, maxHeight: '46vh', overflowY: 'auto' }}>
            {store.assets.map((a) => {
              const preview = renderSvg(a.shapes, { font, fontImport: false, padding: 6 });
              return (
                <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 6 }}>
                    {preview && <img src={svgDataUri(preview)} style={{ maxWidth: '100%', maxHeight: 76 }} alt={a.name} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>
                    {a.name}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`${styles.btn} ${styles.primary}`}
                      style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                      onClick={() => { store.placeAsset(a.id); onClose(); }}
                    >
                      配置
                    </button>
                    <button
                      className={styles.btn}
                      style={{ padding: '4px 8px', fontSize: 12, color: '#dc2626' }}
                      onClick={() => {
                        if (confirm(`アセット「${a.name}」を削除しますか？\n（配置済みインスタンスは「アセット未定義」表示になります）`)) {
                          store.deleteAsset(a.id);
                        }
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
