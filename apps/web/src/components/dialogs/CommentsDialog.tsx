import { useCallback, useEffect, useState } from 'react';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

interface Comment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

/** サーバー上のプロジェクトへのコメント（作成者・日時つき） */
export function CommentsDialog({ projectId, projectName, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch(`/api/projects/${projectId}/comments`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setComments)
      .catch(() => setMessage('コメントを取得できませんでした'));
  }, [projectId]);

  useEffect(reload, [reload]);

  const post = async () => {
    if (!body.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setBody('');
      reload();
    } else {
      setMessage('投稿に失敗しました');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h2 className={styles.title}>コメント — {projectName}</h2>
        {message && <div className={styles.message}>{message}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '44vh', overflowY: 'auto' }}>
          {comments.length === 0 && <div className={styles.message}>コメントはまだありません。</div>}
          {comments.map((c) => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>{c.author}</span>
                {' — '}
                {new Date(c.created_at).toLocaleString('ja-JP')}
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="コメントを書く…"
          rows={3}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
        />
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>閉じる</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={post}>投稿</button>
        </div>
      </div>
    </div>
  );
}
