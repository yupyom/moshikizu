import { useEffect, useState } from 'react';
import { parseDocument } from '@draw/core';
import { useDrawingStore } from '../../store/drawingStore';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

interface ProjectMeta {
  id: string;
  name: string;
  updated_at: string;
  updated_by: string;
}

/** サーバー上のプロジェクト一覧から開く */
export function ServerProjectsDialog({ onClose }: Props) {
  const store = useDrawingStore();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProjects)
      .catch(() => setMessage('一覧を取得できませんでした'));
  }, []);

  // ゲスト共有リンクの発行（共通パスワード + 閲覧/コメントモード）
  const share = async (meta: ProjectMeta) => {
    const password = prompt(`「${meta.name}」のゲスト用共有パスワードを設定してください`);
    if (!password) return;
    const withComment = confirm('ゲストのコメント投稿も許可しますか？\n（OK=閲覧+コメント / キャンセル=閲覧のみ）');
    try {
      const res = await fetch(`/api/projects/${meta.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, mode: withComment ? 'comment' : 'view' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.url).catch(() => {});
      alert(`共有リンクを発行しました（クリップボードにコピー済み）:\n${data.url}\n\nパスワードは別の手段で相手に伝えてください。`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '共有リンクの発行に失敗しました');
    }
  };

  // ユーザー招待（SMTP設定があればメール送信、無ければURLを表示）
  const invite = async () => {
    const username = prompt('招待するユーザー名');
    if (!username) return;
    const email = prompt('メールアドレス');
    if (!email) return;
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.mailed) {
        alert(`${email} に招待メールを送信しました。`);
      } else {
        await navigator.clipboard.writeText(data.url).catch(() => {});
        alert(`招待リンクを発行しました（SMTP未設定のためメールは送っていません。コピー済み）:\n${data.url}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '招待に失敗しました');
    }
  };

  const open = async (meta: ProjectMeta) => {
    try {
      const res = await fetch(`/api/projects/${meta.id}`);
      if (!res.ok) throw new Error();
      const doc = parseDocument(await res.json());
      store.loadDocument(doc);
      store.setProject(meta.id, doc.name);
      onClose();
    } catch {
      setMessage('読み込みに失敗しました');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h2 className={styles.title}>サーバーのプロジェクト</h2>
        {projects.length === 0 && !message && (
          <div className={styles.message}>プロジェクトはまだありません。「サーバーに保存」で共有できます。</div>
        )}
        {message && <div className={styles.message}>{message}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '50vh', overflowY: 'auto' }}>
          {projects.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 4 }}>
              <button
                className={styles.btn}
                style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'left', minWidth: 0 }}
                onClick={() => open(p)}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>
                  {p.updated_by} / {new Date(p.updated_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
              <button className={styles.btn} title="ゲスト共有リンクを発行（共通パスワード・閲覧/コメント）" onClick={() => share(p)}>
                共有
              </button>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={invite} title="新しいユーザーを招待（SMTP設定時はメール送信）">ユーザーを招待</button>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
