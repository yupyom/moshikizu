# Moshikizu ユーザーガイド

**Moshikizu（模式図）** は、PowerPoint 資料などに載せる模式図・概念図を、
非イラストレーターが簡便に作るためのドローイングツールです。

![Moshikizu の画面](images/ui-main.png)

## このガイドの構成

| ページ | 内容 |
|---|---|
| [チュートリアル](tutorial.md) | はじめての図を描く（10分） |
| [機能ガイド](features.md) | キャンバス・マスター・表・グラフ・アセット等の全機能 |
| [エージェント連携（MCP）](mcp.md) | Claude Code 等から図を描かせる・API リファレンス |
| [サーバー設置ガイド](server.md) | チーム共有用コラボサーバーのセルフホスト |

## インストール（セルフビルド）

Node.js 20 以上と git が必要です。

```bash
git clone https://github.com/yupyom/moshikizu.git
cd moshikizu
npm install
./start.sh            # ブラウザ版 → http://localhost:5173
npm run desktop       # デスクトップ版（Electron）
```

## サンプル

`samples/` に Moshikizu 自身（の MCP 機能）で描いたサンプル文書が入っています。
アプリの「ファイル > 開く」から開けるほか、ブラウザ版なら
`http://localhost:5173/?doc=/samples/architecture.drawjson` のように URL でも開けます。

インストールスクリプトを使った場合の場所は **`~/.moshikizu/samples/`** です
（隠しフォルダのため、macOS のファイルダイアログでは **⌘⇧G** を押して
`~/.moshikizu/samples` と入力すると開けます）。

| ファイル | 内容 |
|---|---|
| `architecture.drawjson` | このアプリのアーキテクチャ概念図 |
| `stats.drawjson` | コード統計（数式入りの表 + それを参照する棒/ドーナツグラフ） |
| `deployment.drawjson` | サーバー公開時の構成図（アイコン付き） |
