# claude-code-pipe

Claude Code のセッションをシンプルに双方向パイプするライブラリ

[English README is here](./README.md)

## 概要

**claude-code-pipe** は、Claude Code の動作をシンプルに双方向にパイプするだけのライブラリです。

Claude Code の JSONL セッションファイルを監視し、REST API で対話し、セッションイベントを Webhook で配信します。プログラム的に Claude Code へプロンプトを送信し、応答が完了したらイベントを受け取ることができます。

## 機能

- **Watch モード**: Claude Code のセッションファイルを監視し、構造化されたデータを抽出
- **Send モード**: REST API 経由で Claude Code にプロンプトを送信（`claude -p` プロセスを作成）
- **Cancel モード**: 実行中のセッションをプログラム的にキャンセル
- **Webhook 配信**: セッションイベントを外部サービスへ送信（例: Node-RED, Slack）
- **プロセス管理**: PM2 による自動再起動をサポート

## インストール

```bash
npm install
```

## クイックスタート

### 1. 設定ファイルのセットアップ

サンプル設定ファイルをコピーして編集します。

```bash
cp config.example.json config.json
```

`config.json` を環境に合わせて編集してください（詳細は[設定詳細](#設定詳細)を参照）。

### 2. サーバーを起動

#### PM2 を使用（推奨）

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

#### 直接起動（開発時）

```bash
npm start
```

以下のように表示されます。

```
claude-code-pipe listening on port 3100
Watching directory: /home/user/.claude/projects
```

### 3. API をテスト

新しいセッションを作成します。

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

## 設定詳細

### 基本構造

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "my-service",
      "level": "basic",
      "includeMessage": true,
      "authorization": ""
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000
  }
}
```

### 設定フィールド

#### ルートレベル

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `watchDir` | string | Yes | Claude Code セッションファイルの監視ディレクトリ（例: `~/.claude/projects`） |
| `port` | number | Yes | サーバーのポート番号（デフォルト: `3100`） |
| `subscribers` | array | No | Webhook 購読者のリスト |
| `send` | object | No | Send モードの設定 |

#### Subscribers（購読者）

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `url` | string | Yes | Webhook エンドポイント URL |
| `label` | string | Yes | ログでの識別用ラベル |
| `level` | string | Yes | イベントレベル: `basic` または `full`（[Webhook レベル](#webhook-レベル)参照） |
| `includeMessage` | boolean | Yes | Webhook ペイロードに完全なメッセージ内容を含めるか |
| `authorization` | string | No | Authorization ヘッダーの値（例: `Bearer YOUR_TOKEN`） |

#### Send 設定

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `defaultAllowedTools` | array | No | `claude -p` で許可するツールのデフォルト値（デフォルト: `["Read", "Grep", "Write", "Bash"]`） |
| `cancelTimeoutMs` | number | No | キャンセル操作のタイムアウト（ミリ秒、デフォルト: `3000`） |

### Webhook レベル

用途に応じて適切なレベルを選択してください。

| level | includeMessage | 説明 | 用途 |
|-------|---------------|-------------|----------|
| `basic` | `false` | 最低限のイベント、メタ情報のみ | 軽量な通知（例: Slack） |
| `basic` | `true` | 最低限のイベント + message 全文 | 標準的な利用（例: Node-RED） |
| `full` | `false` | 全イベント、メタ情報のみ | デバッグ・監視（メタ情報のみ） |
| `full` | `true` | 全イベント + message 全文 | 完全なログ記録 |

**レベル別イベントタイプ:**

- **basic**: `session-started`, `assistant-response-completed`, `process-exit`
- **full**: 上記に加えて `session-error`, `session-timeout`, `cancel-initiated`

**「message」とは？**

- **message**: JSONL 生データ（content, usage, tools など）
- **メタ情報**: 常に含まれる情報（sessionId, timestamp, type, source, responseTime など）

### 設定例

#### 最小構成（単一 Webhook）

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

#### 複数 Webhook

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
    },
    {
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "label": "slack-notify",
      "level": "basic",
      "includeMessage": false
    },
    {
      "url": "http://localhost:3200/debug",
      "label": "debug-logger",
      "level": "full",
      "includeMessage": true,
      "authorization": "Bearer YOUR_TOKEN"
    }
  ]
}
```

## API リファレンス

### Watch モード

#### `GET /sessions`

すべてのセッションをリスト表示します。

**レスポンス:**

```json
{
  "sessions": ["session-id-1", "session-id-2"]
}
```

#### `GET /sessions/:id`

セッション履歴を取得します。

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2026-03-01T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "2026-03-01T12:00:05.000Z"
    }
  ]
}
```

#### `GET /sessions/:id/latest`

最新のアシスタントメッセージを取得します。

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "...",
    "timestamp": "2026-03-01T12:00:05.000Z"
  }
}
```

#### `WS /ws`

リアルタイムセッションイベント用の WebSocket エンドポイント（ローカル Web UI 用）。

### Send モード

#### `POST /sessions/new`

新しいセッションを作成してプロンプトを送信します。

**リクエストボディ:**

```json
{
  "prompt": "ここにプロンプトを入力",
  "cwd": "/path/to/project",
  "allowedTools": ["Read", "Grep", "Write"]
}
```

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Claude Code に送信するプロンプト |
| `cwd` | string | No | 作業ディレクトリ（デフォルト: カレントディレクトリ） |
| `allowedTools` | array | No | 許可するツール（デフォルト: config の `defaultAllowedTools`） |

**レスポンス:**

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

#### `POST /sessions/:id/send`

既存のセッションにプロンプトを送信します。

**リクエストボディ:**

```json
{
  "prompt": "追加のプロンプト"
}
```

**レスポンス:**

```json
{
  "message": "Prompt sent to existing session",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### Cancel モード

#### `POST /sessions/:id/cancel`

実行中のセッションをキャンセルします。

**レスポンス:**

```json
{
  "message": "Cancel signal sent",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### 管理

#### `GET /managed`

管理中のプロセスをリスト表示します。

**レスポンス:**

```json
{
  "processes": [
    {
      "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
      "pid": 12345,
      "startTime": "2026-03-01T12:00:00.000Z",
      "status": "running"
    }
  ]
}
```

## Webhook イベントフォーマット

Webhook は以下の構造で POST リクエストを受け取ります。

### 基本イベント（includeMessage: false）

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234
}
```

### 完全イベント（includeMessage: true）

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234,
  "message": {
    "role": "assistant",
    "content": "...",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    },
    "tools": ["Read", "Write"]
  }
}
```

### イベントタイプ

| タイプ | 説明 | レベル |
|------|-------------|-------|
| `session-started` | 新しいセッションが作成された | basic, full |
| `assistant-response-completed` | アシスタントの応答が完了した | basic, full |
| `process-exit` | Claude プロセスが終了した | basic, full |
| `session-error` | エラーが発生した | full のみ |
| `session-timeout` | セッションがタイムアウトした | full のみ |
| `cancel-initiated` | キャンセルがリクエストされた | full のみ |

## トラブルシューティング

### サーバーが起動しない

**ポートの空き状況を確認:**

```bash
lsof -i :3100
```

ポートが使用中の場合は、`config.json` の `port` を変更してください。

### イベントが受信されない

**Webhook URL を確認:**

Webhook エンドポイントがアクセス可能であることを確認します。

```bash
curl -X POST http://localhost:1880/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

**ログを確認:**

```bash
npm run pm2:logs
```

### セッションが見つからない

**watchDir を確認:**

`config.json` の `watchDir` が正しい Claude Code プロジェクトディレクトリを指していることを確認します。

```bash
ls ~/.claude/projects
```

### キャンセルが機能しない

キャンセル操作にはタイムアウトがあります（デフォルト: 3000ms）。プロセスがこの時間内に応答しない場合、強制終了されます。

`config.json` で `cancelTimeoutMs` を調整できます。

## 開発

### プロジェクト構造

```
claude-code-pipe/
├── src/
│   ├── index.js           # メインエントリポイント
│   ├── watcher.js         # JSONL ファイル監視
│   ├── parser.js          # JSONL パーサー
│   ├── sender.js          # claude -p プロセス管理
│   ├── canceller.js       # キャンセルハンドラー
│   └── subscribers.js     # Webhook 配信
├── config.json            # 設定ファイル（gitignore 済み）
├── config.example.json    # サンプル設定
├── ecosystem.config.js    # PM2 設定
└── package.json
```

### テストの実行

このプロジェクトは統合テスト用に別リポジトリを使用しています。

```bash
# テスターリポジトリをクローン
git clone https://github.com/yourorg/claude-code-pipe-tester-node-red.git

# Node-RED テスターを起動
cd claude-code-pipe-tester-node-red
npm start
```

`http://localhost:1880` で Node-RED UI にアクセスして Webhook イベントをテストできます。

## ライセンス

MIT
