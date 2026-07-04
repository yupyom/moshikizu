import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDb, verifyPassword,
  createShareLink, getShareLink, revokeShareLink, createGuestSession, getGuestShare,
  createInvite, getInvite, acceptInvite,
} from '../src/db';

describe('ゲスト共有リンク', () => {
  it('発行→ゲストセッション→解決、失効で無効化', () => {
    const db = openDb(mkdtempSync(join(tmpdir(), 'moshikizu-share-')));
    db.prepare("INSERT INTO projects (id, name, doc, updated_at, updated_by) VALUES ('p1','t','{}','','a')").run();
    const link = createShareLink(db, 'p1', 'comment', 'secret', 'admin');
    expect(getShareLink(db, link.token)?.mode).toBe('comment');
    // パスワード検証は既存の verifyPassword を共用
    expect(verifyPassword('secret', link.pass_hash)).toBe(true);
    expect(verifyPassword('wrong', link.pass_hash)).toBe(false);
    const guest = createGuestSession(db, link.token, 1);
    expect(getGuestShare(db, guest)?.project_id).toBe('p1');
    revokeShareLink(db, link.token);
    expect(getShareLink(db, link.token)).toBeNull();
    expect(getGuestShare(db, guest)).toBeNull();
  });
});

describe('ユーザー招待', () => {
  it('発行→受諾でアカウント作成、再利用・重複名は拒否', () => {
    const db = openDb(mkdtempSync(join(tmpdir(), 'moshikizu-invite-')));
    const inv = createInvite(db, 'alice', 'alice@example.com');
    expect(getInvite(db, inv.token)?.username).toBe('alice');
    const user = acceptInvite(db, inv.token, 'password123');
    expect(user.username).toBe('alice');
    expect(user.email).toBe('alice@example.com');
    expect(verifyPassword('password123', user.pass_hash)).toBe(true);
    expect(getInvite(db, inv.token)).toBeNull(); // 使用済み
    expect(() => acceptInvite(db, inv.token, 'x'.repeat(8))).toThrow();
    expect(() => createInvite(db, 'alice', 'a@b.c')).toThrow(); // 重複名
  });
});
