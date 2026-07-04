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

## インストール

インストールせずに試したい場合は、**[ブラウザ版プレイグラウンド](https://yupyom.github.io/moshikizu/app/)**
をどうぞ（インストール版と同じ Web アプリです。データはローカルに保存されます。
なお [エージェント連携（MCP）](mcp.md) はデスクトップ版専用のため、プレイグラウンドでは使えません）。

いずれの方法も [Node.js](https://nodejs.org/) 20 以上と git が必要です。

### かんたんインストール（推奨）

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/yupyom/moshikizu/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/yupyom/moshikizu/main/install.ps1 | iex
```

ソース一式が `~/.moshikizu`（Windows は `%USERPROFILE%\.moshikizu`）に取得され、
デスクトップアプリがビルド・配置されます。

- **macOS**: `/Applications/Moshikizu.app`
  （コード署名なしのため、初回は**右クリック > 開く**で起動）
- **Windows**: スタートメニューの「Moshikizu」から起動
  （本体は `%LOCALAPPDATA%\Programs\Moshikizu`。SmartScreen 警告が出たら「詳細情報 > 実行」）
- **Linux**: `moshikizu` コマンドでブラウザ版が起動（`~/.local/bin` に配置）

### 手動セットアップ（セルフビルド）

```bash
git clone https://github.com/yupyom/moshikizu.git
cd moshikizu
npm install
./start.sh            # ブラウザ版 → http://localhost:5173
npm run desktop       # デスクトップ版（Electron）
```

## アップデート

**かんたんインストールのコマンドをもう一度実行**してください。
再実行すると更新として動作します（git pull → 再ビルド → アプリ差し替え。データや設定は消えません）。

新しいバージョンが出ているかは、アプリの**ヘルプ > 更新を確認**でも確認できます
（環境設定で main=安定版 / dev=プレリリース のチャンネルを選択）。

手動セットアップの場合は、リポジトリで `git pull` して `npm install` を再実行してください。

## サンプル

`samples/` に Moshikizu 自身（の MCP 機能）で描いたサンプル文書が入っています。
アプリの「ファイル > 開く」から開けるほか、ブラウザ版なら
`http://localhost:5173/?doc=/samples/architecture.drawjson` のように URL でも開けます。

インストールスクリプトを使った場合の場所は **`~/.moshikizu/samples/`**
（Windows は `%USERPROFILE%\.moshikizu\samples`）です
（隠しフォルダのため、macOS のファイルダイアログでは **⌘⇧G** を押して
`~/.moshikizu/samples` と入力すると開けます）。

| ファイル | 内容 |
|---|---|
| `architecture.drawjson` | このアプリのアーキテクチャ概念図 |
| `stats.drawjson` | コード統計（数式入りの表 + それを参照する棒/ドーナツグラフ） |
| `deployment.drawjson` | サーバー公開時の構成図（アイコン付き） |
