# claude-code-pipe - 詳細ドキュメント

claude-code-pipe の完全なドキュメント

[English version](./DETAILS.md)

## 目次

- [設定詳細](#設定詳細)
- [API リファレンス](#api-リファレンス)
- [Webhook イベントフォーマット](#webhook-イベントフォーマット)
- [トラブルシューティング](#トラブルシューティング)
- [開発](#開発)

---

## 設定詳細

### 完全な設定構造

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token",
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

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-------|------|----------|---------|-------------|
| `watchDir` | string | Yes | - | Claude Code セッションファイルの監視ディレクトリ（例: `~/.claude/projects`） |
| `port` | number | Yes | - | サーバーのポート番号（推奨: `3100`） |
| `apiToken` | string | No | `""` | API 認証トークン。設定すると、全リクエストに `Authorization: Bearer TOKEN` ヘッダーが必要 |
| `subscribers` | array | No | `[]` | Webhook 購読者のリスト |
| `send` | object | No | `{}` | Send モードの設定 |

#### Subscribers（購読者）

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-------|------|----------|---------|-------------|
| `url` | string | Yes | - | Webhook エンドポイント URL |
| `label` | string | Yes | - | ログでの識別用ラベル |
| `level` | string | Yes | - | イベントレベル: `basic` または `full` |
| `includeMessage` | boolean | Yes | - | Webhook ペイロードに完全なメッセージ内容を含めるか |
| `authorization` | string | No | `""` | Authorization ヘッダーの値（例: `Bearer YOUR_TOKEN`） |

#### Send 設定

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-------|------|----------|---------|-------------|
| `defaultAllowedTools` | array | No | `["Read", "Grep", "Write", "Bash"]` | `claude -p` で許可するツールのデフォルト値 |
| `cancelTimeoutMs` | number | No | `3000` | キャンセル操作のタイムアウト（ミリ秒） |

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

#### 最小構成（Watch のみ）

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

#### 単一 Webhook（Node-RED）

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

#### API トークン付き（本番環境）

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here",
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "Grep"],
    "cancelTimeoutMs": 5000
  }
}
```

---

## API リファレンス

### 認証

`config.json` で `apiToken` が設定されている場合、全ての API リクエストに `Authorization` ヘッダーが必要です:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:3100/sessions
```

`apiToken` が未設定または空の場合、認証は無効化されます（本番環境では非推奨）。

### Watch Mode

#### `GET /sessions`

利用可能な全セッションをメタデータ付きでリスト表示します。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| `detail` | boolean | No | `false` | 文字列ではなく詳細なメッセージオブジェクトを含める |

**シンプル版（デフォルト）:**

```bash
curl http://localhost:3100/sessions
```

**レスポンス:**

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "lastModifiedAt": "2026-03-01T10:30:00.000Z",
      "messageCount": 12,
      "userMessageCount": 6,
      "assistantMessageCount": 6,
      "totalTokens": 15000,
      "firstUserMessage": "プロジェクトの構造を教えて",
      "lastUserMessage": "ありがとう",
      "firstAssistantMessage": "プロジェクト構造を確認します...",
      "lastAssistantMessage": "どういたしまして!"
    }
  ]
}
```

**詳細版:**

```bash
curl http://localhost:3100/sessions?detail=true
```

**レスポンス:**

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "lastModifiedAt": "2026-03-01T10:30:00.000Z",
      "messageCount": 12,
      "userMessageCount": 6,
      "assistantMessageCount": 6,
      "totalTokens": 15000,
      "firstUserMessage": {
        "content": "プロジェクトの構造を教えて",
        "timestamp": "2026-03-01T10:00:00.000Z"
      },
      "lastUserMessage": {
        "content": "ありがとう",
        "timestamp": "2026-03-01T10:28:00.000Z"
      },
      "firstAssistantMessage": {
        "content": "プロジェクト構造を確認します...",
        "timestamp": "2026-03-01T10:00:05.000Z",
        "usage": {
          "input_tokens": 100,
          "output_tokens": 50
        }
      },
      "lastAssistantMessage": {
        "content": "どういたしまして!",
        "timestamp": "2026-03-01T10:30:00.000Z",
        "usage": {
          "input_tokens": 200,
          "output_tokens": 30
        }
      }
    }
  ]
}
```

**メタデータフィールド:**

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `id` | string | セッション ID |
| `createdAt` | string | 最初のメッセージの ISO 8601 タイムスタンプ |
| `lastModifiedAt` | string | 最後のメッセージの ISO 8601 タイムスタンプ |
| `messageCount` | number | 総メッセージ数（ユーザー + アシスタント） |
| `userMessageCount` | number | ユーザーメッセージ数 |
| `assistantMessageCount` | number | アシスタントメッセージ数 |
| `totalTokens` | number | 総使用トークン数（入力 + 出力） |
| `firstUserMessage` | string/object | 最初のユーザーメッセージ（シンプル版: 文字列、詳細版: オブジェクト） |
| `lastUserMessage` | string/object | 最後のユーザーメッセージ（シンプル版: 文字列、詳細版: オブジェクト） |
| `firstAssistantMessage` | string/object | 最初のアシスタントメッセージ（シンプル版: 文字列、詳細版: オブジェクト） |
| `lastAssistantMessage` | string/object | 最後のアシスタントメッセージ（シンプル版: 文字列、詳細版: オブジェクト） |

**注意:**

- シンプル版はUIでの素早い表示のためメッセージ内容を文字列として返します
- 詳細版はタイムスタンプと使用データを含む完全なメッセージオブジェクトを含みます
- パフォーマンスのため、結果はファイル変更時刻（mtime）を使ってメモリにキャッシュされます
- セッションファイルが変更されるとキャッシュは自動的に無効化されます

#### `GET /sessions/:id/messages`

セッションの全メッセージを取得します。

**リクエスト:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages
```

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2026-03-01T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you?",
      "timestamp": "2026-03-01T12:00:05.000Z",
      "usage": {
        "input_tokens": 100,
        "output_tokens": 50
      }
    }
  ]
}
```

#### `GET /sessions/:id/messages/user/first`

セッションの最初のユーザーメッセージを取得します。

**リクエスト:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/first
```

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "user",
    "content": "Hello",
    "timestamp": "2026-03-01T12:00:00.000Z"
  }
}
```

#### `GET /sessions/:id/messages/user/latest`

セッションの最新のユーザーメッセージを取得します。

**リクエスト:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/latest
```

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "user",
    "content": "Thank you",
    "timestamp": "2026-03-01T12:01:00.000Z"
  }
}
```

#### `GET /sessions/:id/messages/assistant/first`

セッションの最初のアシスタントメッセージを取得します。

**リクエスト:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/first
```

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?",
    "timestamp": "2026-03-01T12:00:05.000Z"
  }
}
```

#### `GET /sessions/:id/messages/assistant/latest`

セッションの最新のアシスタントメッセージを取得します。

**リクエスト:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest
```

**レスポンス:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "You're welcome!",
    "timestamp": "2026-03-01T12:01:05.000Z",
    "usage": {
      "input_tokens": 150,
      "output_tokens": 20
    }
  }
}
```

#### `WS /ws`

リアルタイムセッションイベント用の WebSocket エンドポイント。

**接続:**

```javascript
const ws = new WebSocket('ws://localhost:3100/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(event);
});
```

**イベント:**

Webhook イベントと同じフォーマット（[Webhook イベントフォーマット](#webhook-イベントフォーマット)参照）。

### Send Mode

#### `POST /sessions/new`

新しいセッションを作成してプロンプトを送信します。

**リクエスト:**

```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "ここにプロンプトを入力",
    "cwd": "/path/to/project",
    "allowedTools": ["Read", "Grep", "Write"]
  }'
```

**リクエストボディ:**

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Claude Code に送信するプロンプト |
| `cwd` | string | No | カレントディレクトリ | セッションの作業ディレクトリ |
| `allowedTools` | array | No | `config.send.defaultAllowedTools` | Claude Code で許可するツール |

**レスポンス:**

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

#### `POST /sessions/:id/send`

既存のセッションにプロンプトを送信します。

**リクエスト:**

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/send \
  -H "Content-Type: application/json" \
  -d '{"prompt": "追加のメッセージ"}'
```

**リクエストボディ:**

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| `prompt` | string | Yes | 送信するプロンプト |

**レスポンス:**

```json
{
  "message": "Prompt sent to existing session",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### Cancel Mode

#### `POST /sessions/:id/cancel`

実行中のセッションをキャンセルします。

**リクエスト:**

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/cancel
```

**レスポンス:**

```json
{
  "message": "Cancel signal sent",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

**動作:**

1. プロセスに Ctrl+C シグナルを送信
2. `cancelTimeoutMs`（デフォルト: 3000ms）待機
3. プロセスが終了しない場合、強制終了
4. `cancel-initiated` イベントを送信（level: `full`）

### Management

#### `GET /managed`

管理中の全プロセスをリスト表示します。

**リクエスト:**

```bash
curl http://localhost:3100/managed
```

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

---

## Webhook イベントフォーマット

Webhook は以下の構造で POST リクエストを受け取ります。

### イベント構造

全てのイベントには以下のメタ情報フィールドが含まれます:

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `type` | string | イベントタイプ（[イベントタイプ](#イベントタイプ)参照） |
| `sessionId` | string | セッション ID |
| `timestamp` | string | ISO 8601 タイムスタンプ |
| `source` | string | イベントソース: `watcher`, `sender`, または `canceller` |

追加のフィールドは `includeMessage` 設定に依存します。

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
    "content": "Hello! How can I help you?",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    },
    "tools": ["Read", "Write"]
  }
}
```

### イベントタイプ

| タイプ | 説明 | レベル | ソース |
|------|-------------|-------|--------|
| `session-started` | 新しいセッションが作成された | basic, full | sender |
| `assistant-response-completed` | アシスタントの応答が完了した | basic, full | watcher |
| `process-exit` | Claude プロセスが終了した | basic, full | sender |
| `session-error` | エラーが発生した | full のみ | watcher |
| `session-timeout` | セッションがタイムアウトした | full のみ | watcher |
| `cancel-initiated` | キャンセルがリクエストされた | full のみ | canceller |

### イベント例

#### session-started

```json
{
  "type": "session-started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "source": "sender"
}
```

#### assistant-response-completed

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234,
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  }
}
```

#### process-exit

```json
{
  "type": "process-exit",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:05:00.000Z",
  "source": "sender",
  "exitCode": 0
}
```

#### cancel-initiated

```json
{
  "type": "cancel-initiated",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:02:00.000Z",
  "source": "canceller"
}
```

---

## トラブルシューティング

### サーバーが起動しない

**症状:** `Error: listen EADDRINUSE: address already in use :::3100`

**解決策:** ポートが既に使用中です。使用状況を確認:

```bash
lsof -i :3100
```

プロセスを終了するか、`config.json` の `port` を変更してください。

---

**症状:** `Error: Cannot find module './config.json'`

**解決策:** `config.json` を作成する必要があります:

```bash
cp config.example.json config.json
```

その後、`config.json` を環境に合わせて編集してください。

---

### イベントが受信されない

**症状:** Webhook エンドポイントがイベントを受信しない。

**解決策 1:** Webhook URL がアクセス可能か確認:

```bash
curl -X POST http://localhost:1880/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

**解決策 2:** ログでエラーを確認:

```bash
npm run pm2:logs
```

**解決策 3:** `config.json` の Webhook 設定を確認:

- `url` が正しい
- `level` が `basic` または `full` に設定されている
- `label` が一意である

---

### セッションが見つからない

**症状:** `GET /sessions/:id/messages` が 404 を返す。

**解決策 1:** セッションが存在するか確認:

```bash
curl http://localhost:3100/sessions
```

**解決策 2:** `watchDir` が正しいディレクトリを指しているか確認:

```bash
ls ~/.claude/projects
```

`.jsonl` ファイルが表示されるはずです。

**解決策 3:** ファイルパーミッションを確認:

```bash
ls -la ~/.claude/projects
```

`claude-code-pipe` を実行しているユーザーに読み取り権限があることを確認してください。

---

### キャンセルが機能しない

**症状:** `POST /sessions/:id/cancel` がプロセスを停止しない。

**解決策 1:** キャンセル操作にはタイムアウトがあります（デフォルト: 3000ms）。プロセスがこの時間内に終了するか確認してください。

**解決策 2:** `config.json` でタイムアウトを増やす:

```json
{
  "send": {
    "cancelTimeoutMs": 5000
  }
}
```

**解決策 3:** プロセスが強制終了されたかログで確認:

```bash
npm run pm2:logs
```

---

### 認証エラー

**症状:** `401 Unauthorized: Missing or invalid authorization header`

**解決策 1:** リクエストに `Authorization` ヘッダーを含める:

```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:3100/sessions
```

**解決策 2:** トークンが `config.json` の `apiToken` と一致するか確認。

**解決策 3:** 認証が不要な場合、`apiToken` フィールドを削除または空にする:

```json
{
  "apiToken": ""
}
```

その後、サーバーを再起動:

```bash
npm run pm2:restart
```

---

### PM2 の問題

**症状:** `pm2 status` でアプリが停止またはエラー状態。

**解決策 1:** ログを確認:

```bash
npm run pm2:logs
```

**解決策 2:** アプリを再起動:

```bash
npm run pm2:restart
```

**解決策 3:** 削除してから再起動:

```bash
npm run pm2:stop
pm2 delete claude-code-pipe
npm run pm2:start
```

---

## 開発

### プロジェクト構造

```
claude-code-pipe/
├── src/
│   ├── index.js           # メインエントリポイント、Express サーバー、認証ミドルウェア
│   ├── api.js             # REST API ルート定義
│   ├── watcher.js         # JSONL ファイル監視（chokidar）
│   ├── parser.js          # JSONL パーサー
│   ├── sender.js          # claude -p プロセス管理
│   ├── canceller.js       # キャンセルハンドラー（Ctrl+C）
│   └── subscribers.js     # Webhook 配信
├── config.json            # 設定ファイル（gitignore 済み）
├── config.example.json    # サンプル設定
├── ecosystem.config.js    # PM2 設定
├── package.json
├── README.md
├── README-ja.md
├── DETAILS.md
└── DETAILS-ja.md
```

### 主要モジュール

#### src/index.js

- メインエントリポイント
- Express サーバーセットアップ
- 認証ミドルウェア（Bearer Token）
- ローカル Web UI 用 WebSocket サーバー
- ルート登録

#### src/api.js

- REST API ルート定義
- セッション管理（一覧、メッセージ取得）
- Send/Cancel 操作
- メッセージフィルタリング（user/assistant, first/latest）

#### src/watcher.js

- `watchDir` の JSONL ファイル変更を監視
- 新しい行が追加されたらイベントを発行
- `chokidar` を使用したファイル監視

#### src/parser.js

- JSONL ファイルをパース
- メッセージとメタ情報を抽出
- 異なるイベントタイプを処理

#### src/sender.js

- `claude -p` プロセスを管理
- 実行中のセッションを追跡
- プロセスのライフサイクル管理

#### src/canceller.js

- 実行中のプロセスに Ctrl+C を送信
- タイムアウト超過時に強制終了
- キャンセルイベントを発行

#### src/subscribers.js

- イベントを Webhook に配信
- レベルでイベントをフィルタ
- メッセージ内容の含有/除外

### テストの実行

このプロジェクトは統合テスト用に別リポジトリを使用しています。

#### テスト環境のセットアップ

```bash
# テスターリポジトリをクローン
git clone https://github.com/yourorg/claude-code-pipe-tester-node-red.git
cd claude-code-pipe-tester-node-red

# 依存関係をインストール
npm install

# Node-RED を起動
npm start
```

`http://localhost:1880` で Node-RED にアクセスできます。

#### テストワークフロー

1. **claude-code-pipe を起動**:
   ```bash
   cd /path/to/claude-code-pipe
   npm run pm2:start
   ```

2. **Webhook を設定** (`config.json`):
   ```json
   {
     "subscribers": [
       {
         "url": "http://localhost:1880/webhook",
         "label": "test",
         "level": "full",
         "includeMessage": true
       }
     ]
   }
   ```

3. **テストリクエストを送信**:
   ```bash
   curl -X POST http://localhost:3100/sessions/new \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Hello", "cwd": "/tmp"}'
   ```

4. **Node-RED で確認** - `http://localhost:1880/ccpipe/webhook` で Webhook イベントを確認。

### 新機能の追加

#### 新しい API エンドポイントの追加

1. `src/api.js` にルートを追加:
   ```javascript
   router.get('/sessions/:id/my-feature', (req, res) => {
     // 実装
   });
   ```

2. `src/index.js` でルートを登録（既存のルーターを使用していない場合）。

3. `curl` でテスト。

#### 新しいイベントタイプの追加

1. 適切なモジュールでイベントを発行（例: `src/watcher.js`）:
   ```javascript
   emitter.emit('event', {
     type: 'my-event-type',
     sessionId: 'xxx',
     timestamp: new Date().toISOString(),
     source: 'watcher'
   });
   ```

2. 必要に応じて `src/subscribers.js` の Webhook レベルフィルターに追加。

3. `DETAILS-ja.md` にドキュメント化。

#### 新しい設定オプションの追加

1. `config.example.json` に追加:
   ```json
   {
     "myNewOption": "default-value"
   }
   ```

2. コードで使用:
   ```javascript
   const config = require('../config.json');
   const myOption = config.myNewOption || 'default-value';
   ```

3. `DETAILS-ja.md` にドキュメント化。

### デバッグ

#### 詳細ログを有効化

`src/index.js` を編集して console.log 文を追加:

```javascript
console.log('DEBUG:', data);
```

ログを表示:

```bash
npm run pm2:logs
```

#### Webhook 配信のデバッグ

`src/subscribers.js` で配信エラーを確認。

#### JSONL パースのデバッグ

`src/parser.js` と `src/watcher.js` でファイル読み取りエラーを確認。

---

## ライセンス

MIT
