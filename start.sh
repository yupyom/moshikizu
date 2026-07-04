#!/bin/bash
# Draw Tool 起動スクリプト
# バックエンドは廃止済み（保存はFile System Access API、設定はlocalStorage）。
# Vite開発サーバーのみを起動する。
#
# 使い方:
#   ./start.sh          # デフォルト（http://localhost:5173）
#   ./start.sh 5200     # ポート指定
#   DRAW_FRONTEND_PORT=5200 ./start.sh   # 環境変数でも指定可（引数が優先）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-${DRAW_FRONTEND_PORT:-5173}}"

echo "=== Draw Tool 起動 ==="
echo "http://localhost:${PORT}"
echo "Ctrl+C で終了"
echo ""

cd "$SCRIPT_DIR/apps/web" && exec npm run dev -- --port "$PORT"
