import Database from 'better-sqlite3';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface User {
  id: number;
  username: string;
  pass_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  email: string | null;
}

export interface ShareLink {
  token: string;
  project_id: string;
  mode: 'view' | 'comment';
  pass_hash: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

export interface Invite {
  token: string;
  username: string;
  email: string;
  created_at: string;
  used_at: string | null;
}

export interface ProjectRow {
  id: string;
  name: string;
  doc: string;
  updated_at: string;
  updated_by: string;
}

export function openDb(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'moshikizu.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      doc TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS themes (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS share_links (
      token TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      mode TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS guest_sessions (
      token TEXT PRIMARY KEY,
      share_token TEXT NOT NULL REFERENCES share_links(token),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
  // 既存DBへの追加カラム（v1.0 → v1.1 マイグレーション）
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  } catch { /* 追加済み */ }
  return db;
}

// ---- パスワード（scrypt） ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// ---- セッション ----

export function createSession(db: Database.Database, userId: number, ttlHours: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + ttlHours * 3600_000);
  return token;
}

export function getSessionUser(db: Database.Database, token: string): User | null {
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, Date.now()) as User | undefined;
  return row ?? null;
}

export function deleteSession(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---- ゲスト共有リンク ----

export function createShareLink(
  db: Database.Database,
  projectId: string,
  mode: 'view' | 'comment',
  password: string,
  createdBy: string,
): ShareLink {
  const token = randomBytes(16).toString('hex');
  const row: ShareLink = {
    token,
    project_id: projectId,
    mode,
    pass_hash: hashPassword(password),
    created_by: createdBy,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  db.prepare('INSERT INTO share_links (token, project_id, mode, pass_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(token, projectId, mode, row.pass_hash, createdBy, row.created_at);
  return row;
}

/** 有効な（失効していない）共有リンクを取得 */
export function getShareLink(db: Database.Database, token: string): ShareLink | null {
  const row = db.prepare('SELECT * FROM share_links WHERE token = ? AND revoked_at IS NULL')
    .get(token) as ShareLink | undefined;
  return row ?? null;
}

export function revokeShareLink(db: Database.Database, token: string): void {
  db.prepare('UPDATE share_links SET revoked_at = ? WHERE token = ?')
    .run(new Date().toISOString(), token);
  db.prepare('DELETE FROM guest_sessions WHERE share_token = ?').run(token);
}

export function createGuestSession(db: Database.Database, shareToken: string, ttlHours: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO guest_sessions (token, share_token, expires_at) VALUES (?, ?, ?)')
    .run(token, shareToken, Date.now() + ttlHours * 3600_000);
  return token;
}

/** ゲストセッションから共有リンクを解決（期限・失効を確認） */
export function getGuestShare(db: Database.Database, guestToken: string): ShareLink | null {
  const row = db.prepare(`
    SELECT l.* FROM guest_sessions g JOIN share_links l ON l.token = g.share_token
    WHERE g.token = ? AND g.expires_at > ? AND l.revoked_at IS NULL
  `).get(guestToken, Date.now()) as ShareLink | undefined;
  return row ?? null;
}

// ---- ユーザー招待 ----

export function createInvite(db: Database.Database, username: string, email: string): Invite {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) throw new Error('そのユーザー名は既に使われています');
  const token = randomBytes(16).toString('hex');
  const row: Invite = { token, username, email, created_at: new Date().toISOString(), used_at: null };
  db.prepare('INSERT INTO invites (token, username, email, created_at) VALUES (?, ?, ?, ?)')
    .run(token, username, email, row.created_at);
  return row;
}

export function getInvite(db: Database.Database, token: string): Invite | null {
  const row = db.prepare('SELECT * FROM invites WHERE token = ? AND used_at IS NULL')
    .get(token) as Invite | undefined;
  return row ?? null;
}

/** 招待を受諾してアカウントを作成する */
export function acceptInvite(db: Database.Database, token: string, password: string): User {
  const invite = getInvite(db, token);
  if (!invite) throw new Error('招待が無効です（使用済みまたは存在しません）');
  const info = db.prepare('INSERT INTO users (username, pass_hash, email) VALUES (?, ?, ?)')
    .run(invite.username, hashPassword(password), invite.email);
  db.prepare('UPDATE invites SET used_at = ? WHERE token = ?').run(new Date().toISOString(), token);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as User;
}
