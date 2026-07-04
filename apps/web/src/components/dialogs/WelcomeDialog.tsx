import { useEffect, useState } from 'react';
import { CANVAS_PRESETS } from '@draw/core';
import { useDrawingStore } from '../../store/drawingStore';
import { parseDocument } from '@draw/core';
import { getRecentFiles, type RecentFile } from '../../utils/recentFiles';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

const presetBtnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  color: '#111827',
  textAlign: 'left',
};

/** 起動時のダッシュボード: 新規テンプレート・最近使ったファイル */
export function WelcomeDialog({ onClose }: Props) {
  const store = useDrawingStore();
  const [recent, setRecent] = useState<RecentFile[]>([]);

  const [templates, setTemplates] = useState<{ name: string; json: string }[]>([]);
  const [docsPath, setDocsPath] = useState('');

  useEffect(() => {
    getRecentFiles().then(setRecent);
    // デスクトップ版: 書類/Moshikizu/Templates をスキャン
    window.drawDesktop?.listTemplates().then(setTemplates).catch(() => {});
    window.drawDesktop?.getDocsPath().then(setDocsPath).catch(() => {});
  }, []);

  // テンプレートから新規（id を外して「無題」として開く）
  const newFromTemplate = (t: { name: string; json: string }) => {
    try {
      const doc = parseDocument(JSON.parse(t.json));
      store.loadDocument({ ...doc, id: null });
      store.setProject(null, `${t.name} のコピー`);
      onClose();
    } catch {
      alert(`テンプレート「${t.name}」を読み込めませんでした。`);
    }
  };

  const newFromPreset = (w: number, h: number) => {
    store.newDocument(w, h);
    onClose();
  };

  const openPicker = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('draw:open-file'));
  };

  const openRecent = (r: RecentFile) => {
    onClose();
    window.dispatchEvent(new CustomEvent('draw:open-handle', { detail: r.handle }));
  };

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxHeight: '84vh', overflowY: 'auto' }}
      >
        <h2 className={styles.title}>Moshikizu へようこそ</h2>

        {templates.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>
              マイテンプレート
              <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 12 }}>
                {docsPath ? `${docsPath}/Templates` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {templates.map((t) => (
                <button
                  key={t.name}
                  onClick={() => newFromTemplate(t)}
                  style={{ padding: '10px 14px', fontSize: 13, border: '1px solid #d0d4dc', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
                >
                  <span className="material-icons" style={{ fontSize: 15, verticalAlign: '-3px', marginRight: 6, color: '#2563eb' }}>description</span>
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>新規作成</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {CANVAS_PRESETS.map((p) => (
            <button key={p.label} style={presetBtnStyle} onClick={() => newFromPreset(p.width, p.height)}>
              <span style={{ fontWeight: 600 }}>{p.label.split('（')[0]}</span>
              <span style={{ color: '#888', fontSize: 12 }}>{p.width} × {p.height} px</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: '#555', fontWeight: 500, marginTop: 6 }}>最近使ったファイル</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: '#999' }}>
            まだありません。保存・読込したファイルがここに表示されます。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recent.map((r, i) => (
              <button
                key={i}
                style={{ ...presetBtnStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => openRecent(r)}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ color: '#999', fontSize: 12, flexShrink: 0, marginLeft: 12 }}>
                  {new Date(r.time).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btn} onClick={openPicker}>ファイルを開く…</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={onClose}>白紙から始める</button>
        </div>
      </div>
    </div>
  );
}
