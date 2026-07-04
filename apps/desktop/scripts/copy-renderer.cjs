// renderer/ を ../web/dist から作り直す。
// rm/cp は Windows (cmd.exe) に存在しないため、Node で実装してクロスプラットフォーム化。
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, '..', 'web', 'dist');
const dest = path.join(root, 'renderer');

if (!fs.existsSync(src)) {
  console.error(`web のビルド成果物が見つかりません: ${src}`);
  console.error('先にリポジトリルートで npm run build を実行してください。');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
