/**
 * Moshikizu セルフホスト協働サーバー
 *
 * - web アプリの静的配信 + プロジェクト保存API（作成者記録つき）
 * - 認証: パスワード(scrypt) + TOTP 2FA（QRコードで認証アプリ登録）
 * - IPv4 ホワイトリスト制限（CIDR対応、ループバック常時許可）
 * - データ: SQLite（MOSHIKIZU_DATA_DIR、デフォルト ./server-data）
 *
 * 起動:      node dist/index.js            （ポートは MOSHIKIZU_PORT、デフォルト8940）
 * ユーザー:  node dist/index.js adduser <name> <password>
 * IP制限:    server-data/config.json の ipAllowlist（例: ["192.168.1.0/24"]）
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { parseDocument, parseTheme } from '@draw/core';
import {
  openDb, hashPassword, verifyPassword, createSession, getSessionUser, deleteSession,
  createShareLink, getShareLink, revokeShareLink, createGuestSession, getGuestShare,
  createInvite, getInvite, acceptInvite,
} from './db.js';
import type { User, ProjectRow } from './db.js';
import { generateTotpSecret, verifyTotp, otpauthUrl } from './totp.js';
import { isIpAllowed } from './ipAllow.js';
import { initMail, isMailEnabled, sendMail } from './mail.js';
import type { SmtpConfig } from './mail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MOSHIKIZU_DATA_DIR ?? join(process.cwd(), 'server-data');
const PORT = Number(process.env.MOSHIKIZU_PORT ?? 8940);
const STATIC_DIR = process.env.MOSHIKIZU_STATIC ?? join(__dirname, '..', '..', 'web', 'dist');

interface ServerConfig {
  ipAllowlist: string[];
  sessionTtlHours: number;
  /** 外部からアクセスするURL（招待・共有リンクのメール記載用。例 https://draw.example.com） */
  baseUrl?: string;
  /** メール送信設定（任意）。未設定なら通知機能は無効 */
  smtp?: SmtpConfig;
}

function loadConfig(): ServerConfig {
  const path = join(DATA_DIR, 'config.json');
  if (!existsSync(path)) {
    const def: ServerConfig = { ipAllowlist: [], sessionTtlHours: 24 * 7 };
    try {
      writeFileSync(path, JSON.stringify(def, null, 2));
    } catch { /* 初回のディレクトリ生成前は openDb 後に作られる */ }
    return def;
  }
  return { ipAllowlist: [], sessionTtlHours: 24 * 7, ...JSON.parse(readFileSync(path, 'utf-8')) };
}

const db = openDb(DATA_DIR);
const config = loadConfig();
initMail(config.smtp);
const baseUrl = () => config.baseUrl?.replace(/\/$/, '') ?? `http://localhost:${PORT}`;

// ---- CLI: ユーザー管理 ----
const [cmd, ...cliArgs] = process.argv.slice(2);
if (cmd === 'adduser') {
  const [username, password] = cliArgs;
  if (!username || !password) {
    console.error('使い方: node dist/index.js adduser <name> <password>');
    process.exit(1);
  }
  db.prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)').run(username, hashPassword(password));
  console.log(`ユーザー作成: ${username}（2FAは初回ログイン後に /api/auth/totp-setup で有効化）`);
  process.exit(0);
}

// ---- アプリ ----

type Env = { Variables: { user: User } };
const app = new Hono<Env>();

// バリデーション等の throw は 400 として返す
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message }, 400);
});

// IPv4ホワイトリスト（全リクエスト対象）
app.use('*', async (c, next) => {
  const remote = getConnInfo(c).remote.address ?? '';
  if (!isIpAllowed(remote, config.ipAllowlist)) {
    return c.text('Forbidden', 403);
  }
  await next();
});

const SESSION_COOKIE = 'moshikizu_session';

// 認証ガード（/api/auth/login 以外の /api/*）
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/auth/login') return next();
  // ゲスト共有・招待受諾はユーザーセッション不要（それぞれ独自に検証）
  if (c.req.path.startsWith('/api/share/') || c.req.path.startsWith('/api/invite/')) return next();
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? getSessionUser(db, token) : null;
  if (!user) return c.json({ error: '認証が必要です' }, 401);
  c.set('user', user);
  await next();
});

// ---- 認証 ----

app.post('/api/auth/login', async (c) => {
  const { username, password, totp } = await c.req.json<{ username: string; password: string; totp?: string }>();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  if (!user || !verifyPassword(password, user.pass_hash)) {
    return c.json({ error: 'ユーザー名またはパスワードが違います' }, 401);
  }
  if (user.totp_enabled) {
    if (!totp) return c.json({ error: 'TOTPコードが必要です', totpRequired: true }, 401);
    if (!user.totp_secret || !verifyTotp(user.totp_secret, totp)) {
      return c.json({ error: 'TOTPコードが違います', totpRequired: true }, 401);
    }
  }
  const token = createSession(db, user.id, config.sessionTtlHours);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/' });
  return c.json({ username: user.username, totpEnabled: !!user.totp_enabled });
});

app.post('/api/auth/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(db, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ username: user.username, totpEnabled: !!user.totp_enabled });
});

// 2FAセットアップ: シークレット生成 + QRコード（data URI）を返す
app.post('/api/auth/totp-setup', async (c) => {
  const user = c.get('user');
  const secret = generateTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, user.id);
  const url = otpauthUrl(secret, user.username);
  const qrDataUri = await QRCode.toDataURL(url);
  return c.json({ secret, otpauthUrl: url, qrDataUri });
});

// 2FA有効化: 認証アプリのコードを検証して確定
app.post('/api/auth/totp-enable', async (c) => {
  const user = c.get('user');
  const { code } = await c.req.json<{ code: string }>();
  const secret = (db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id) as { totp_secret: string | null }).totp_secret;
  if (!secret || !verifyTotp(secret, code)) {
    return c.json({ error: 'コードが一致しません' }, 400);
  }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  return c.json({ ok: true });
});

// ---- プロジェクト ----

app.get('/api/projects', (c) => {
  const rows = db.prepare('SELECT id, name, updated_at, updated_by FROM projects ORDER BY updated_at DESC').all();
  return c.json(rows);
});

app.get('/api/projects/:id', (c) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(c.req.param('id')) as ProjectRow | undefined;
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ...JSON.parse(row.doc), _meta: { updatedAt: row.updated_at, updatedBy: row.updated_by } });
});

app.put('/api/projects/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const doc = parseDocument(await c.req.json()); // 検証込み
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO projects (id, name, doc, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(id, doc.name, JSON.stringify({ ...doc, id }), now, user.username);
  return c.json({ id, updatedAt: now, updatedBy: user.username });
});

// ---- テーマ共有 ----

app.get('/api/themes', (c) => {
  const rows = db.prepare('SELECT name, updated_at, updated_by FROM themes ORDER BY name').all();
  return c.json(rows);
});

app.get('/api/themes/:name', (c) => {
  const row = db.prepare('SELECT data FROM themes WHERE name = ?').get(c.req.param('name')) as { data: string } | undefined;
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json(JSON.parse(row.data));
});

app.put('/api/themes/:name', async (c) => {
  const user = c.get('user');
  const theme = parseTheme(await c.req.json()); // 検証込み
  // macOSのNFDファイル名由来の濁点分解を正規化（同名テーマの重複行を防ぐ）
  const name = c.req.param('name').normalize('NFC');
  db.prepare(`
    INSERT INTO themes (name, data, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET data = excluded.data,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(name, JSON.stringify({ ...theme, name }), new Date().toISOString(), user.username);
  return c.json({ ok: true, name, updatedBy: user.username });
});

// ---- ゲスト共有リンク ----

const GUEST_COOKIE = 'moshikizu_guest';

// 発行（要ログイン）
app.post('/api/projects/:id/share', async (c) => {
  const user = c.get('user');
  const { password, mode } = await c.req.json<{ password: string; mode: 'view' | 'comment' }>();
  if (!password?.trim()) return c.json({ error: '共有パスワードが必要です' }, 400);
  if (mode !== 'view' && mode !== 'comment') return c.json({ error: 'mode は view か comment' }, 400);
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(c.req.param('id'));
  if (!project) return c.json({ error: 'プロジェクトが見つかりません' }, 404);
  const link = createShareLink(db, c.req.param('id'), mode, password.trim(), user.username);
  return c.json({ token: link.token, mode, url: `${baseUrl()}/?share=${link.token}` });
});

// 一覧（要ログイン）
app.get('/api/projects/:id/share', (c) => {
  const rows = db.prepare(
    'SELECT token, mode, created_by, created_at FROM share_links WHERE project_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
  ).all(c.req.param('id'));
  return c.json(rows);
});

// 失効（要ログイン）
app.post('/api/projects/:id/share/:token/revoke', (c) => {
  revokeShareLink(db, c.req.param('token'));
  return c.json({ ok: true });
});

// メタ情報（ゲスト向け・認証不要。パスワード入力画面の表示用）
app.get('/api/share/:token/meta', (c) => {
  const link = getShareLink(db, c.req.param('token'));
  if (!link) return c.json({ error: '共有リンクが無効です' }, 404);
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(link.project_id) as { name: string } | undefined;
  const guest = getCookie(c, GUEST_COOKIE);
  const authed = guest ? getGuestShare(db, guest)?.token === link.token : false;
  return c.json({ projectName: project?.name ?? '', mode: link.mode, authenticated: authed });
});

// 共通パスワードでゲストログイン
app.post('/api/share/:token/login', async (c) => {
  const link = getShareLink(db, c.req.param('token'));
  if (!link) return c.json({ error: '共有リンクが無効です' }, 404);
  const { password } = await c.req.json<{ password: string }>();
  if (!verifyPassword(password ?? '', link.pass_hash)) {
    return c.json({ error: 'パスワードが違います' }, 401);
  }
  const guest = createGuestSession(db, link.token, config.sessionTtlHours);
  setCookie(c, GUEST_COOKIE, guest, { httpOnly: true, sameSite: 'Lax', path: '/' });
  return c.json({ ok: true, mode: link.mode });
});

/** ゲストセッションを検証して共有リンクを返す（トークン一致必須） */
function requireGuest(c: { req: { param: (k: string) => string } }, cookie: string | undefined) {
  const link = cookie ? getGuestShare(db, cookie) : null;
  if (!link || link.token !== c.req.param('token')) return null;
  return link;
}

// ドキュメント取得（閲覧）
app.get('/api/share/:token/doc', (c) => {
  const link = requireGuest(c, getCookie(c, GUEST_COOKIE));
  if (!link) return c.json({ error: 'ゲスト認証が必要です' }, 401);
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(link.project_id) as ProjectRow | undefined;
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json({ ...JSON.parse(row.doc), _meta: { updatedAt: row.updated_at, updatedBy: row.updated_by, mode: link.mode } });
});

// コメント閲覧・投稿（mode='comment' のみ投稿可）
app.get('/api/share/:token/comments', (c) => {
  const link = requireGuest(c, getCookie(c, GUEST_COOKIE));
  if (!link) return c.json({ error: 'ゲスト認証が必要です' }, 401);
  const rows = db.prepare('SELECT id, author, body, created_at FROM comments WHERE project_id = ? ORDER BY id').all(link.project_id);
  return c.json(rows);
});

app.post('/api/share/:token/comments', async (c) => {
  const link = requireGuest(c, getCookie(c, GUEST_COOKIE));
  if (!link) return c.json({ error: 'ゲスト認証が必要です' }, 401);
  if (link.mode !== 'comment') return c.json({ error: 'このリンクは閲覧専用です' }, 403);
  const { author, body } = await c.req.json<{ author?: string; body: string }>();
  if (!body?.trim()) return c.json({ error: '本文が必要です' }, 400);
  const name = `ゲスト: ${(author ?? '').trim() || '名無し'}`;
  const info = db.prepare('INSERT INTO comments (project_id, author, body, created_at) VALUES (?, ?, ?, ?)')
    .run(link.project_id, name, body.trim(), new Date().toISOString());
  notifyComment(link.project_id, name, body.trim());
  return c.json({ id: info.lastInsertRowid, author: name });
});

// ---- ユーザー招待 ----

// 招待の発行（要ログイン）。SMTP設定があればメール送信、なければURLを返すのみ
app.post('/api/users/invite', async (c) => {
  const user = c.get('user');
  const { username, email } = await c.req.json<{ username: string; email: string }>();
  if (!username?.trim() || !email?.includes('@')) {
    return c.json({ error: 'ユーザー名とメールアドレスが必要です' }, 400);
  }
  const invite = createInvite(db, username.trim().normalize('NFC'), email.trim());
  const url = `${baseUrl()}/?invite=${invite.token}`;
  let mailed = false;
  if (isMailEnabled()) {
    await sendMail(
      email.trim(),
      'Moshikizu への招待',
      `${user.username} さんから Moshikizu サーバーに招待されました。
` +
      `以下のURLを開いてパスワードを設定してください（ユーザー名: ${username.trim()}）:
${url}
`,
    );
    mailed = true;
  }
  return c.json({ token: invite.token, url, mailed });
});

// 招待の確認（認証不要）
app.get('/api/invite/:token', (c) => {
  const invite = getInvite(db, c.req.param('token'));
  if (!invite) return c.json({ error: '招待が無効です' }, 404);
  return c.json({ username: invite.username });
});

// 招待の受諾（パスワード設定 → アカウント作成、認証不要）
app.post('/api/invite/:token/accept', async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  if (!password || password.length < 8) {
    return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
  }
  const user = acceptInvite(db, c.req.param('token'), password);
  return c.json({ ok: true, username: user.username });
});

/** コメント通知（メール設定があるとき、投稿者以外のメール登録済みユーザー全員へ） */
function notifyComment(projectId: string, author: string, body: string): void {
  if (!isMailEnabled()) return;
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string } | undefined;
  const users = db.prepare('SELECT username, email FROM users WHERE email IS NOT NULL').all() as { username: string; email: string }[];
  for (const u of users) {
    if (u.username === author) continue;
    void sendMail(
      u.email,
      `[Moshikizu] ${project?.name ?? projectId} に新しいコメント`,
      `${author} さんがコメントしました:

${body}

${baseUrl()}/`,
    );
  }
}

// ---- コメント ----

app.get('/api/projects/:id/comments', (c) => {
  const rows = db.prepare('SELECT id, author, body, created_at FROM comments WHERE project_id = ? ORDER BY id').all(c.req.param('id'));
  return c.json(rows);
});

app.post('/api/projects/:id/comments', async (c) => {
  const user = c.get('user');
  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) return c.json({ error: '本文が必要です' }, 400);
  const info = db.prepare('INSERT INTO comments (project_id, author, body, created_at) VALUES (?, ?, ?, ?)')
    .run(c.req.param('id'), user.username, body.trim(), new Date().toISOString());
  notifyComment(c.req.param('id'), user.username, body.trim());
  return c.json({ id: info.lastInsertRowid, author: user.username });
});

// ---- 静的配信（webアプリ） ----

// Windowsでも動くようPOSIX区切りに（serveStaticはスラッシュ前提）
app.use('/*', serveStatic({ root: relative(process.cwd(), STATIC_DIR).split(sep).join('/') }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Moshikizu サーバー起動: http://localhost:${PORT}`);
  console.log(`データ: ${DATA_DIR} / 静的配信: ${STATIC_DIR}`);
  if (config.ipAllowlist.length === 0) {
    console.log('警告: ipAllowlist が空です（全IP許可）。config.json での設定を推奨します。');
  }
});
