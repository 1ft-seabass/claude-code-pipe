# claude-code-pipe

Claude Code セッションのシンプルな双方向パイプ

[English version](./README.md)

## 概要

**claude-code-pipe** は、Claude Code の動作を双方向にパイプするための軽量なライブラリです。

Claude Code の JSONL セッションファイルを監視し、REST API で操作を提供し、セッションイベントを Webhook で配信します。プログラムから Claude Code にプロンプトを送信し、応答が完了したらイベントを受け取ることができます。

## できること・できないこと・やらないこと

### ✅ できること
- Claude Code のセッションファイルを監視し、REST API でアクセスを提供
- プログラムから Claude Code にプロンプトを送信
- セッションイベントを Webhook で配信
- 個人のワークフロー自動化のための軽量な実装

### ❌ できないこと
- UI の提供（フロントエンドは各自で用意してください）
- Claude Code 本体のインストールや更新管理
- すべての Claude Code バージョンでの動作保証

### 🚫 やらないこと
- エンタープライズ機能（複雑な認証、レート制限、マルチテナント対応など）
- データベース永続化（インメモリキャッシュのみ）
- Claude Code の破壊的変更時の後方互換性維持

## 機能

- **Watch Mode**: Claude Code のセッションファイルを監視し、構造化されたデータを抽出
- **Send Mode**: REST API 経由で Claude Code にプロンプトを送信（`claude -p` プロセスを作成）
- **Cancel Mode**: 実行中のセッションをプログラムからキャンセル
- **Webhook 配信**: セッションイベントを外部サービス（Node-RED、Slack など）に送信
- **プロセス管理**: PM2 による自動再起動

## クイックスタート

### Step 1: インストールと起動

依存関係をインストール:

```bash
npm install
```

設定ファイルをコピーして編集:

```bash
cp config.example.json config.json
```

`config.json` を編集 - 最低限、`watchDir` を設定:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

サーバーを起動:

```bash
# PM2 を使用（推奨）
npm run pm2:start

# または直接起動（開発時）
npm start
```

以下のように表示されます:

```
claude-code-pipe listening on port 3100
Watching directory: /home/user/.claude/projects
```

### Step 2: Watch Mode（読み取り専用）

API をテストしてセッション一覧を取得:

```bash
curl http://localhost:3100/sessions
```

メッセージ数、タイムスタンプ、プレビューなどのメタデータが取得できます:

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "messageCount": 12,
      "totalTokens": 15000,
      "firstUserMessage": "プロジェクトの構造を教えて",
      "lastAssistantMessage": "どういたしまして!"
    }
  ]
}
```

セッションの全メッセージを取得:

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages
```

最新のアシスタント応答を取得:

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest
```

これが最も安全な始め方です - 既存のセッションデータを読み取るだけです。

### Step 3: Send Mode（オプション）

慣れてきたら、Claude Code にプロンプトを送信できます。

新規セッションを作成:

```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello Claude", "cwd": "/path/to/project"}'
```

レスポンス:

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

既存セッションに送信:

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/send \
  -H "Content-Type: application/json" \
  -d '{"prompt": "フォローアップメッセージ"}'
```

## 基本的な設定

### 最小構成

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

### Webhook を使う場合

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ]
}
```

### API トークンを使う場合（本番環境推奨）

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here"
}
```

`apiToken` を設定すると、全ての API リクエストに `Authorization` ヘッダーが必要になります:

```bash
curl -H "Authorization: Bearer your-secret-token-here" \
  http://localhost:3100/sessions
```

詳細な設定オプションは [DETAILS-ja.md](./DETAILS-ja.md) を参照してください。

## 一般的な使用例

### Claude Code セッションを監視

新しい応答を検知して通知を送信:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "label": "slack",
      "level": "basic",
      "includeMessage": false
    }
  ]
}
```

### Claude Code のワークフローを自動化

プログラムからセッションを作成し、Webhook で結果を受信:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token",
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ]
}
```

## PM2 管理

```bash
# 起動
npm run pm2:start

# ステータス確認
npm run pm2:status

# ログ表示
npm run pm2:logs

# 再起動
npm run pm2:restart

# 停止
npm run pm2:stop
```

## ドキュメント

- **[DETAILS-ja.md](./DETAILS-ja.md)** - 完全な API リファレンス、設定オプション、Webhook フォーマット、トラブルシューティング
- **[DETAILS.md](./DETAILS.md)** - English version

## プロジェクトの方針

このプロジェクトは**意図的にミニマル**に作られており、特定の個人的なニーズを解決するために構築されています。

### メンテナンス方針

- **主な焦点**: 作者の日常ワークフローを改善する機能
- **Claude Code の更新**: 破壊的変更には可能な範囲で追従します
- **Issue**: お気軽に開いてください（ただし、迅速な対応は保証できません）
- **Pull Request**: コントリビューションは感謝します！ただし、大きく複雑さを増すものや、ミニマルな思想から外れるものはマージしない場合があります。大きな機能追加はフォークをご検討ください。

### なぜこのアプローチなのか？

このツールは実際の必要性から生まれました：「Claude Code のセッションをプログラムから操作したい。最小限の手間で。」

フル機能のプラットフォームを構築するのではなく、シンプルさを保ちます：
- 理解しやすく、改造しやすい小さなコードベース
- 役立つために必要最小限の機能
- もっと機能が欲しい場合は、フォークや拡張を推奨します

**注意**: これは個人用ツールを公開したものです。そのまま使う、必要に応じてフォークする、改善をコントリビュートする—どれも歓迎ですが、エンタープライズレベルのサポートは期待しないでください。

## ライセンス

MIT
