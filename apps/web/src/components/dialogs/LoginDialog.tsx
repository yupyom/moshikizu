import { useState } from 'react';
import { useServerStore } from '../../store/serverStore';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

/** コラボサーバーへのログイン（TOTP 2FA対応） */
export function LoginDialog({ onClose }: Props) {
  const login = useServerStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setBusy(true);
    setError(null);
    const r = await login(username, password, totp || undefined);
    setBusy(false);
    if (r.ok) {
      onClose();
      return;
    }
    if (r.totpRequired) setTotpRequired(true);
    setError(r.error ?? 'ログインに失敗しました');
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>サーバーにログイン</h2>
        <div className={styles.row}>
          <label>ユーザー名</label>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className={styles.row}>
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !totpRequired) submit(); }}
          />
        </div>
        {totpRequired && (
          <div className={styles.row}>
            <label>認証コード</label>
            <input
              inputMode="numeric"
              placeholder="6桁"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
        )}
        {error && <div className={styles.message} style={{ color: '#dc2626' }}>{error}</div>}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose}>ログインせずに使う</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={submit} disabled={busy}>
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
        </div>
      </div>
    </div>
  );
}
