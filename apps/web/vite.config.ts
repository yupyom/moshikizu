import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  // 相対パスでビルドする（Electron の file:// 読み込みと静的ホスティングの両対応）
  base: './',
  // アプリ内の「バージョン情報」表示用（リリース時は package.json の version を上げる）
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
