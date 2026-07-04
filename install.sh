#!/bin/bash
# Moshikizu セルフビルド・インストーラー（macOS / Linux）
#   curl -fsSL https://raw.githubusercontent.com/yupyom/moshikizu/main/install.sh | bash
# 再実行で更新（git pull → 再ビルド）
set -euo pipefail

DIR="${MOSHIKIZU_HOME:-$HOME/.moshikizu}"
REPO="https://github.com/yupyom/moshikizu.git"

command -v git >/dev/null || { echo "git が必要です"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ が必要です（https://nodejs.org/）"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node.js 20 以上が必要です（現在: $(node -v)）"; exit 1; }

if [ -d "$DIR/.git" ]; then
  echo "=== 更新: $DIR ==="
  git -C "$DIR" pull --ff-only
else
  echo "=== 取得: $DIR ==="
  git clone --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"
echo "=== 依存関係のインストール ==="
npm install
echo "=== ビルド ==="
npm run build

if [ "$(uname)" = "Darwin" ]; then
  echo "=== macOS アプリの作成 ==="
  # 過去バージョンの成果物を誤って拾わないよう、release/ を空にしてからビルドする
  rm -rf apps/desktop/release
  npm run --workspace apps/desktop package
  APP=$(find apps/desktop/release -name "Moshikizu.app" -maxdepth 3 | head -1)
  if [ -n "$APP" ]; then
    rm -rf "/Applications/Moshikizu.app"
    cp -R "$APP" /Applications/
    echo ""
    echo "完了: /Applications/Moshikizu.app を配置しました。"
    echo "（コード署名なしのため、初回は 右クリック > 開く で起動してください）"
    echo ""
    echo "同梱サンプル: $DIR/samples"
    echo "  アプリの「ファイル > 開く」ダイアログで ⌘⇧G を押し、上のパスを貼り付けると開けます"
  fi
else
  BIN="$HOME/.local/bin"
  mkdir -p "$BIN"
  printf '#!/bin/bash\ncd "%s" && ./start.sh "$@"\n' "$DIR" > "$BIN/moshikizu"
  chmod +x "$BIN/moshikizu"
  echo ""
  echo "完了: 'moshikizu' コマンドでブラウザ版が起動します（$BIN にPATHを通してください）"
  echo "同梱サンプル: $DIR/samples（アプリの「ファイル > 開く」から）"
fi
