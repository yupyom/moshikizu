import { useEffect, useState } from 'react';
import type { DrawDocument, Canvas } from '@draw/core';
import { parseDocument, canvasBackgroundColor, substitutePageVars } from '@draw/core';
import { renderSvg } from '@draw/renderer';

interface Comment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

/**
 * ゲスト共有ビューアー（?share=<token>）。
 * 共通パスワードでログインし、閲覧のみ / 閲覧+コメントで表示する。
 * 編集UIは一切持たない独立画面。
 */
export function GuestViewer({ token }: { token: string }) {
  const [phase, setPhase] = useState<'loading' | 'password' | 'view' | 'invalid'>('loading');
  const [projectName, setProjectName] = useState('');
  const [mode, setMode] = useState<'view' | 'comment'>('view');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<DrawDocument | null>(null);
  const [activeCanvas, setActiveCanvas] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentName, setCommentName] = useState('');
  const [commentBody, setCommentBody] = useState('');

  const api = (path: string, init?: RequestInit) =>
    fetch(`/api/share/${token}${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });

  const loadDoc = async () => {
    const r = await api('/doc');
    if (!r.ok) return setPhase('password');
    setDoc(parseDocument(await r.json()));
    setPhase('view');
    const cr = await api('/comments');
    if (cr.ok) setComments(await cr.json());
  };

  useEffect(() => {
    api('/meta').then(async (r) => {
      if (!r.ok) return setPhase('invalid');
      const meta = await r.json();
      setProjectName(meta.projectName);
      setMode(meta.mode);
      if (meta.authenticated) loadDoc();
      else setPhase('password');
    }).catch(() => setPhase('invalid'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLogin = async () => {
    setError('');
    const r = await api('/login', { method: 'POST', body: JSON.stringify({ password }) });
    if (!r.ok) {
      setError((await r.json()).error ?? 'ログインに失敗しました');
      return;
    }
    loadDoc();
  };

  const handleComment = async () => {
    if (!commentBody.trim()) return;
    const r = await api('/comments', {
      method: 'POST',
      body: JSON.stringify({ author: commentName, body: commentBody }),
    });
    if (r.ok) {
      setCommentBody('');
      const cr = await api('/comments');
      if (cr.ok) setComments(await cr.json());
    }
  };

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#f0f2f5', fontFamily: '"LINE Seed JP", "Hiragino Sans", sans-serif', color: '#1a1a1a' },
    bar: { background: '#1a1d29', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 },
    card: { maxWidth: 420, margin: '80px auto', background: '#fff', borderRadius: 10, padding: 28, boxShadow: '0 4px 16px rgba(0,0,0,.08)' },
    input: { width: '100%', padding: '9px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' },
    btn: { padding: '9px 16px', fontSize: 14, border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer' },
    tab: { padding: '6px 14px', fontSize: 13, border: '1px solid #d0d4dc', borderRadius: 6, background: '#fff', cursor: 'pointer' },
  };

  if (phase === 'loading') return <div style={s.page} />;
  if (phase === 'invalid') {
    return (
      <div style={s.page}>
        <div style={s.card}>この共有リンクは無効です（失効した可能性があります）。</div>
      </div>
    );
  }
  if (phase === 'password') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{projectName || '共有ドキュメント'}</h2>
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px' }}>
            共有パスワードを入力してください（{mode === 'comment' ? '閲覧とコメントができます' : '閲覧のみ'}）
          </p>
          <input
            style={s.input}
            type="password"
            value={password}
            placeholder="共有パスワード"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
          <button style={{ ...s.btn, marginTop: 14, width: '100%' }} onClick={handleLogin}>開く</button>
        </div>
      </div>
    );
  }

  // ---- 閲覧画面 ----
  const pageCanvases = doc?.canvases.filter((c) => !c.isMaster) ?? [];
  const canvas: Canvas | undefined = pageCanvases[activeCanvas];
  let svg = '';
  if (doc && canvas) {
    const own = doc.shapes.filter((sh) => sh.canvasId === canvas.id);
    const master = canvas.masterId
      ? substitutePageVars(
          doc.shapes.filter((sh) => sh.canvasId === canvas.masterId),
          { page: activeCanvas + 1, pages: pageCanvases.length, canvasName: canvas.name },
        )
      : [];
    svg = renderSvg([...master, ...own], {
      // renderSvg は図形なしで null を返すため下で ?? '' に落とす
      font: 'LINE Seed JP',
      fontImport: true,
      assets: doc.assets,
      allShapes: doc.shapes,
      viewBox: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      background: canvasBackgroundColor(canvas) ?? '#ffffff',
    }) ?? '';
  }

  return (
    <div style={s.page}>
      <div style={s.bar}>
        <strong style={{ fontSize: 15 }}>Moshikizu</strong>
        <span style={{ fontSize: 14 }}>{projectName}</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          （ゲスト閲覧{mode === 'comment' ? '・コメント可' : '専用'}）
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pageCanvases.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {pageCanvases.map((c, i) => (
                <button
                  key={c.id}
                  style={{ ...s.tab, ...(i === activeCanvas ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } : {}) }}
                  onClick={() => setActiveCanvas(i)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div
            style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ') }}
          />
        </div>
        <div style={{ width: 300, background: '#fff', borderRadius: 8, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>コメント</h3>
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comments.length === 0 && <span style={{ fontSize: 13, color: '#888' }}>まだコメントはありません</span>}
            {comments.map((cm) => (
              <div key={cm.id} style={{ background: '#f6f7f9', borderRadius: 6, padding: '7px 9px' }}>
                <div style={{ fontSize: 11, color: '#666' }}>{cm.author}・{cm.created_at.slice(0, 16).replace('T', ' ')}</div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{cm.body}</div>
              </div>
            ))}
          </div>
          {mode === 'comment' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={{ ...s.input, fontSize: 13 }} placeholder="お名前" value={commentName} onChange={(e) => setCommentName(e.target.value)} />
              <textarea style={{ ...s.input, fontSize: 13, minHeight: 60, resize: 'vertical' }} placeholder="コメントを書く…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
              <button style={{ ...s.btn, fontSize: 13 }} onClick={handleComment}>投稿</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 招待受諾画面（?invite=<token>）。パスワードを設定してアカウントを有効化する */
export function InviteAccept({ token }: { token: string }) {
  const [username, setUsername] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(async (r) => (r.ok ? setUsername((await r.json()).username) : setInvalid(true)))
      .catch(() => setInvalid(true));
  }, [token]);

  const accept = async () => {
    setError('');
    const r = await fetch(`/api/invite/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) {
      setError((await r.json()).error ?? '失敗しました');
      return;
    }
    setDone(true);
  };

  const card: React.CSSProperties = {
    maxWidth: 420, margin: '80px auto', background: '#fff', borderRadius: 10, padding: 28,
    boxShadow: '0 4px 16px rgba(0,0,0,.08)', fontFamily: '"LINE Seed JP", "Hiragino Sans", sans-serif',
  };
  const wrap: React.CSSProperties = { minHeight: '100vh', background: '#f0f2f5' };

  if (invalid) return <div style={wrap}><div style={card}>この招待リンクは無効です（使用済みの可能性があります）。</div></div>;
  if (done) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>アカウントを作成しました</h2>
          <p style={{ fontSize: 13 }}>
            <a href="/">アプリを開き</a>、ユーザー名 <strong>{username}</strong> とこのパスワードでログインしてください。
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Moshikizu への招待</h2>
        <p style={{ fontSize: 13, color: '#555' }}>
          ユーザー名 <strong>{username ?? '…'}</strong> のパスワードを設定してください（8文字以上）
        </p>
        <input
          style={{ width: '100%', padding: '9px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && accept()}
        />
        {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button
          style={{ marginTop: 14, width: '100%', padding: '9px 16px', fontSize: 14, border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer' }}
          onClick={accept}
        >
          アカウントを作成
        </button>
      </div>
    </div>
  );
}
