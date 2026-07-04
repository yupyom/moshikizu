import { useEffect, useState } from 'react';
import { useServerStore } from '../../store/serverStore';
import styles from './SearchReplaceDialog.module.css';

interface Props {
  onClose: () => void;
}

/** 2FA（TOTP）の設定: QRコードを認証アプリで読み取り、コードで確定 */
export function TotpSetupDialog({ onClose }: Props) {
  const refreshMe = useServerStore((s) => s.refreshMe);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/auth/totp-setup', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setQr(d.qrDataUri);
        setSecret(d.secret);
      })
      .catch(() => setMessage('セットアップ情報を取得できませんでした'));
  }, []);

  const enable = async () => {
    const res = await fetch('/api/auth/totp-enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      setDone(true);
      setMessage(null);
      await refreshMe();
    } else {
      setMessage('コードが一致しません。時計のズレがないか確認してください。');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <h2 className={styles.title}>2段階認証（TOTP）の設定</h2>
        {done ? (
          <div className={styles.message}>✅ 有効化しました。次回ログインから認証コードが必要になります。</div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#444', margin: 0 }}>
              認証アプリ（Google Authenticator / 1Password 等）でQRコードを読み取り、
              表示された6桁コードを入力してください。
            </p>
            {qr && (
              <div style={{ textAlign: 'center' }}>
                <img src={qr} width={180} height={180} alt="TOTP QRコード" />
                <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{secret}</div>
              </div>
            )}
            <div className={styles.row}>
              <label>コード</label>
              <input
                inputMode="numeric"
                placeholder="6桁"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enable(); }}
              />
            </div>
            {message && <div className={styles.message} style={{ color: '#dc2626' }}>{message}</div>}
          </>
        )}
        <div className={styles.actions}>
          {!done && <button className={`${styles.btn} ${styles.primary}`} onClick={enable}>有効化</button>}
          <button className={styles.btn} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
