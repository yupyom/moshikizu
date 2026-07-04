# サーバー設置ガイド（チーム共有）

**個人利用ならサーバーは不要です。** デスクトップ版、または `apps/web/dist` を
レンタルサーバー等に置くだけの静的ホスティングで完結します。
チームでの共有（サーバー保存・作成者記録・コメント・テーマ共有）をしたい場合のみ、
コラボサーバーを立てます。
なお、サーバーが提供するのは保存・認証・コメント等の共有機能のみで、
**エージェント連携（MCP）はサーバー経由のブラウザ利用では使えません**（デスクトップ版専用）。

![サーバー構成](images/deployment.png)

## Docker で動かす（推奨）

```bash
docker build -t moshikizu .
docker run -d -p 8940:8940 -v moshikizu-data:/data --name moshikizu moshikizu
docker exec -it moshikizu node server/index.js adduser <ユーザー名> <パスワード>
```

## 直接動かす

```bash
npm run build && npm run build -w @draw/server
node apps/server/dist/index.js adduser <ユーザー名> <パスワード>
node apps/server/dist/index.js     # → http://localhost:8940
```

## 設定ファイル（config.json）

サーバーの設定は、データディレクトリ内の `config.json` で行います
（直接起動では `./server-data/config.json`、Docker では `/data/config.json`）。

**このファイルは初回起動時に既定値で自動生成される**ので、起動前に用意しておく
必要はありません。「一度起動する → 生成された config.json を編集する → 再起動する」
が基本の流れです。設定は起動時に一度だけ読み込まれるため、**変更の反映には
サーバーの再起動が必要**です（もちろん、初回起動前に自分で作成しておいても構いません）。

すべての項目を書いた例:

```json
{
  "ipAllowlist": ["203.0.113.5", "192.168.1.0/24"],
  "sessionTtlHours": 168,
  "baseUrl": "https://draw.example.com",
  "smtp": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "user": "notify@example.com",
    "pass": "********",
    "from": "Moshikizu <notify@example.com>"
  }
}
```

| キー | 既定値 | 説明 |
|---|---|---|
| `ipAllowlist` | `[]` | 接続を許可する IPv4 アドレス（`"203.0.113.5"`）/ CIDR（`"192.168.1.0/24"`）のリスト。**空なら全IP許可**（ループバックは常時許可） |
| `sessionTtlHours` | `168` | ログインセッションの有効時間（時間。既定は7日） |
| `baseUrl` | なし | 招待・共有リンクのメールに記載する外部URL（未設定時は localhost） |
| `smtp` | なし | メール通知の設定（任意。「メール通知」の節を参照） |

ポートとデータの場所は環境変数で変更できます:
`MOSHIKIZU_PORT`（既定 `8940`）/ `MOSHIKIZU_DATA_DIR`（既定 `./server-data`）。

## セキュリティ設定

- **2段階認証（TOTP）**: ログイン後「ファイル > サーバー > 2段階認証を設定」で
  QRコードを認証アプリ（Google Authenticator 等）に登録
- **IPv4 ホワイトリスト**: config.json の `ipAllowlist` に許可する IP / CIDR を列挙
  （書き方は上の「設定ファイル」を参照）。設定するまでは全IP許可なので、
  公開サーバーでは最初に設定してください
- パスワードは scrypt ハッシュ保存。**TLS は Caddy / nginx 等のリバースプロキシ**を
  手前に置いてください

## ゲスト共有リンク

ログインユーザーは「ファイル > サーバー > プロジェクト一覧」の**共有**ボタンから、
プロジェクトごとのゲスト共有リンクを発行できます。

- **共通パスワード**つき（scryptハッシュで保存。パスワードはリンクとは別の手段で伝達を）
- モードは**閲覧のみ** / **閲覧+コメント**の2種。ゲストは編集できません
- ゲストは表示名を入れてコメントでき、`ゲスト: ○○` として記録されます
- リンクは発行者がいつでも失効できます（失効と同時にゲストセッションも無効化）
- IPv4ホワイトリストは共有リンクにも適用されます。外部ゲストを招く場合は許可リストに含めてください

## メール通知（SMTP・任意）

config.json に `smtp` と `baseUrl` を設定すると（書き方は上の「設定ファイル」の例を参照）、
招待メールとコメント通知が有効になります。

- **ユーザー招待**: プロジェクト一覧の「ユーザーを招待」からユーザー名とメールを入力 →
  招待リンクがメール送信され、受け取った本人がパスワードを設定して有効化。
  SMTP未設定でも招待リンクは発行され、URLを手動で渡せます
- **コメント通知**: コメント投稿時に、メールアドレス登録済みの他ユーザーへ通知
- `baseUrl` はメールに記載するリンクの生成に使われます（未設定時は localhost）

## サーバーのアップデート

**Docker の場合**: リポジトリを更新してイメージを再ビルドし、コンテナを作り直します。
データ（ユーザー・プロジェクト・config.json）はボリューム `moshikizu-data` にあるので消えません。

```bash
git pull
docker build -t moshikizu .
docker rm -f moshikizu
docker run -d -p 8940:8940 -v moshikizu-data:/data --name moshikizu moshikizu
```

**直接動かしている場合**: `git pull` → 依存関係の更新と再ビルド → プロセス再起動。

```bash
git pull && npm install
npm run build && npm run build -w @draw/server
# systemd / pm2 等でプロセスを再起動
```

## デプロイ先の目安

| 環境 | 可否 |
|---|---|
| VPS + Docker（Dokploy / Coolify 等） | ◎ 推奨 |
| VPS 直（systemd / pm2） | ◎ |
| Fly.io / Railway / Render（永続ディスク） | ○ |
| Heroku / Lambda 等（FS揮発・サーバーレス） | × SQLite が保持できない |
| 共用レンタルサーバー | × 常駐Node不可（静的Web版の設置は○） |
