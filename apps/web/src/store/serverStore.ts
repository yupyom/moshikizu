import { create } from 'zustand';

/**
 * コラボサーバー（apps/server）との接続状態。
 * - 'none': サーバー無し（静的ホスティング・ローカル開発）。サーバー機能は非表示
 * - 'unauthenticated': サーバー配下だが未ログイン
 * - 'authenticated': ログイン済み
 * 判定は /api/auth/me への probe（JSONを返すかどうかでサーバー有無を区別。
 * Vite dev や静的ホスティングでは SPA フォールバックの HTML が返るため 'none' になる）
 */

export type ServerMode = 'none' | 'unauthenticated' | 'authenticated';

export interface LoginResult {
  ok: boolean;
  totpRequired?: boolean;
  error?: string;
}

interface ServerState {
  mode: ServerMode;
  username: string | null;
  totpEnabled: boolean;
  probe: () => Promise<void>;
  login: (username: string, password: string, totp?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

async function fetchMe(): Promise<{ mode: ServerMode; username: string | null; totpEnabled: boolean }> {
  try {
    const res = await fetch('/api/auth/me');
    const isJson = res.headers.get('content-type')?.includes('application/json') ?? false;
    if (!isJson) return { mode: 'none', username: null, totpEnabled: false };
    if (res.ok) {
      const data = await res.json();
      return { mode: 'authenticated', username: data.username, totpEnabled: !!data.totpEnabled };
    }
    return { mode: 'unauthenticated', username: null, totpEnabled: false };
  } catch {
    return { mode: 'none', username: null, totpEnabled: false };
  }
}

export const useServerStore = create<ServerState>((set) => ({
  mode: 'none',
  username: null,
  totpEnabled: false,

  probe: async () => {
    set(await fetchMe());
  },

  refreshMe: async () => {
    set(await fetchMe());
  },

  login: async (username, password, totp) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        set({ mode: 'authenticated', username: data.username, totpEnabled: !!data.totpEnabled });
        return { ok: true };
      }
      return { ok: false, totpRequired: !!data.totpRequired, error: data.error };
    } catch {
      return { ok: false, error: 'サーバーに接続できません' };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 接続断でもローカル状態はクリア
    }
    set({ mode: 'unauthenticated', username: null, totpEnabled: false });
  },
}));
