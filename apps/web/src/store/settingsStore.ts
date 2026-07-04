import { create } from 'zustand';
import type { AppSettings, Theme } from '@draw/core';

const STORAGE_KEY = 'draw.settings';
const THEMES_KEY = 'draw.themes';

function loadStoredThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistThemes(themes: Theme[]): void {
  try {
    localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
  } catch {
    // 保存できない環境ではメモリ上のみ
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  gridSize: 20,
  defaultCornerRadius: 20,
  colorPalette: ['#1a1a1a', '#555555', '#999999', '#ffffff', '#4a90d9', '#e86b5f', '#6bbf6b', '#e6c050'],
  strokeWidths: [4, 6, 8],
  font: 'LINE Seed JP',
  fontSizes: [9, 10, 12, 14, 16, 18, 21, 24, 30, 36, 48],
  pngScale: 2,
  showGrid: true,
  mcpHostEnabled: false,
  mcpHostPort: 8930,
  updateChannel: 'main',
};

interface SettingsState {
  settings: AppSettings;
  themes: Theme[];
  setSettings: (s: AppSettings) => void;
  loadSettings: () => void;
  saveSettings: (s: AppSettings) => void;
  /** 同名テーマは上書き */
  addTheme: (theme: Theme) => void;
  deleteTheme: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  themes: loadStoredThemes(),

  setSettings: (s) => set({ settings: s }),

  loadSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // 将来の設定項目追加に備え、デフォルトへ上書きマージする
        set({ settings: { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } });
      }
    } catch {
      // 破損時はデフォルト設定を使用
    }
  },

  saveSettings: (s) => {
    set({ settings: s });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // プライベートブラウジング等で保存できない場合はメモリ上のみ
    }
  },

  addTheme: (theme) => {
    const themes = [...get().themes.filter((t) => t.name !== theme.name), theme];
    set({ themes });
    persistThemes(themes);
  },

  deleteTheme: (name) => {
    const themes = get().themes.filter((t) => t.name !== name);
    set({ themes });
    persistThemes(themes);
  },
}));
