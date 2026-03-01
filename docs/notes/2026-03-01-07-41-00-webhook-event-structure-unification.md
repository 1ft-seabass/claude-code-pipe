---
tags: [webhook, event-structure, refactoring, api-design, subscriber]
---

# Webhook イベント構造の統一と発報レベルの簡素化 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: Webhook イベント構造の統一、発報レベルの簡素化

## 問題

### イベント構造の不統一

POST /sessions/new のテスト中に発見された問題:

**2種類のフィールド名が混在**:
1. **processEvents 由来** - `type` フィールド使用
   - 例: `{ type: "session-started", sessionId, pid, timestamp }`
2. **watcher 由来** - `status` フィールド使用
   - 例: `{ status: "completed", sessionId, timestamp, ... }`

**Node-RED で受信する際の問題**:
- イベントによってフィールド名が異なる
- `type` と `status` を両方チェックする必要がある
- イベント処理のロジックが複雑になる

### 発報レベルの複雑さ

従来の4つの level:

| レベル | タイミング | 内容 | 問題点 |
|--------|-----------|------|--------|
| `status` | 応答完了時 | メタ情報のみ | summary と重複 |
| `summary` | 応答完了時 | メタ情報 + message | status との違いが小さい |
| `stream` | メッセージごと | JSONL 生データ | 用途不明確 |
| `stream-status` | 状態変化時 | processing/completed | 実質機能してない |

**根本的な問題**:
引用: `docs/letters/2026-03-01-04-40-00-webhook-payload-enhancement-and-design-decisions.md:307`
> **JSONLには結果のみ記録（途中経過なし）**

- `stream-status` の `processing` は user メッセージが来た時だけ（実用性低い）
- `stream` は JSONL 生データをそのまま流してるだけ（開発用）
- 「処理中イベント」は JSONL から取れない

## 解決策

### 1. イベント構造の統一

**すべてのイベントで `type` フィールドを使用**:

```javascript
// 修正前（watcher 由来）
{
  "status": "completed",
  "sessionId": "...",
  "timestamp": "..."
}

// 修正後
{
  "type": "assistant-response-completed",
  "sessionId": "...",
  "timestamp": "..."
}
```

**イベント名の変更**:
- `status: "completed"` → `type: "assistant-response-completed"`
- `status: "processing"` → `type: "user-message-received"`（将来的に）

### 2. 発報レベルの2軸設計

**軸1: 発報範囲（どのイベントを送るか）**
- `basic` - 最低限のイベント
- `full` - 全イベント

**軸2: 発報内容（message を含めるか）**
- `includeMessage: false` - メタ情報のみ
- `includeMessage: true` - メタ情報 + message 全文

### 用語の定義

- **message** = JSONL そのままのデータ（content, usage など）
- **メタ情報** = 常時入る Webhook 情報（sessionId, timestamp, type, source, tools, responseTime など）

## 実装詳細

### subscribers.js の変更

#### 1. イベント構造の統一

**src/subscribers.js:121-128**:
```javascript
// 基本ペイロード（メタ情報）
const payload = {
  type: 'assistant-response-completed',  // ← status から type に変更
  sessionId: event.sessionId,
  timestamp: event.timestamp,
  source: source,
  tools: event.tools || [],
  responseTime: responseTime
};
```

#### 2. includeMessage パラメータの追加

**src/subscribers.js:130-133**:
```javascript
// includeMessage が true の場合、message を追加
if (includeMessage) {
  payload.message = event.message;
}
```

#### 3. basic/full レベルの実装

**src/subscribers.js:84-87**:
```javascript
// basic: 最低限のイベントのみ (session-started, process-exit)
// full: 全イベント (session-started, session-error, session-timeout, cancel-initiated, process-exit)
const basicEvents = ['session-started', 'process-exit'];
const shouldSend = level === 'full' || (level === 'basic' && basicEvents.includes(eventType));
```

#### 4. 不要なコードの削除

- `stream-status` レベルの処理を削除
- `sessionStates` Map を削除（使われていなかった）
- `handleStreamStatus()` 関数を削除

### config.json の変更

**新しい設定形式**:
```json
{
  "subscribers": [
    {
      "url": "http://localhost:1880/ccpipe/webhook",
      "label": "tester-node-red",
      "level": "basic",
      "includeMessage": true,
      "authorization": ""
    }
  ]
}
```

## 新しいイベント構造

### basic レベルのイベント

#### 1. session-started
```json
{
  "type": "session-started",
  "sessionId": "abc-123-def-456",
  "pid": 12345,
  "timestamp": "2026-03-01T07:30:00.000Z"
}
```

#### 2. assistant-response-completed

**includeMessage: false の場合**:
```json
{
  "type": "assistant-response-completed",
  "sessionId": "abc-123-def-456",
  "timestamp": "2026-03-01T07:30:05.234Z",
  "source": "api",
  "tools": ["Read", "Bash"],
  "responseTime": 5.23
}
```

**includeMessage: true の場合**:
```json
{
  "type": "assistant-response-completed",
  "sessionId": "abc-123-def-456",
  "timestamp": "2026-03-01T07:30:05.234Z",
  "source": "api",
  "tools": ["Read", "Bash"],
  "responseTime": 5.23,
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "..."},
      {"type": "tool_use", "name": "Read", "input": {...}}
    ],
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  }
}
```

#### 3. process-exit
```json
{
  "type": "process-exit",
  "sessionId": "abc-123-def-456",
  "pid": 12345,
  "timestamp": "2026-03-01T07:30:10.000Z",
  "code": 0,
  "signal": null
}
```

### full レベルで追加されるイベント

#### 4. session-error
```json
{
  "type": "session-error",
  "sessionId": "temp-12345",
  "pid": 12345,
  "timestamp": "2026-03-01T07:30:00.000Z",
  "error": "Failed to start process"
}
```

#### 5. session-timeout
```json
{
  "type": "session-timeout",
  "sessionId": "temp-12345",
  "pid": 12345,
  "timestamp": "2026-03-01T07:30:00.000Z",
  "error": "Session start timeout: Failed to retrieve session ID"
}
```

#### 6. cancel-initiated
```json
{
  "type": "cancel-initiated",
  "sessionId": "abc-123-def-456",
  "pid": 12345,
  "timestamp": "2026-03-01T07:30:00.000Z"
}
```

## level × includeMessage の組み合わせ

| level | includeMessage | 説明 | 用途 |
|-------|---------------|------|------|
| `basic` | `false` | 最低限イベント、メタ情報のみ | 軽量な通知（Slack など） |
| `basic` | `true` | 最低限イベント + message 全文 | 標準的な利用（Node-RED など） |
| `full` | `false` | 全イベント、メタ情報のみ | デバッグ・監視（メタ情報のみ） |
| `full` | `true` | 全イベント + message 全文 | 完全なログ記録 |

## メリット

### 1. イベント構造が統一された

- ✅ すべてのイベントで `type` フィールドを使用
- ✅ Node-RED などで受信時の処理がシンプルに
- ✅ イベントタイプを `type` フィールドで一貫して判別可能

### 2. 発報レベルがシンプルに

- ✅ `basic` / `full` の2択（わかりやすい）
- ✅ `includeMessage` で message の有無を制御
- ✅ 不要な `stream` / `stream-status` を削除

### 3. 実用性の向上

- ✅ `basic` + `includeMessage: true` が標準設定として最適
- ✅ 軽量化したい場合は `includeMessage: false`
- ✅ エラーイベントも欲しい場合は `level: full`

### 4. 将来の拡張性

- ✅ `user-message-received` イベントも同じ構造で追加可能
- ✅ 新しいイベントタイプを追加しやすい
- ✅ level の追加も容易（例: `minimal`, `verbose` など）

## 動作確認

### テスト手順

1. **サーバー再起動**:
   ```bash
   npm run pm2:restart
   ```

2. **Node-RED から POST /sessions/new を実行**:
   ```json
   {
     "prompt": "hello"
   }
   ```

3. **Webhook で受信したイベント**:
   - `session-started` (type フィールド)
   - `assistant-response-completed` (type フィールド + message 含む)
   - `process-exit` (type フィールド)

### 確認結果

✅ すべてのイベントで `type` フィールドが使用されている
✅ `assistant-response-completed` に message が含まれている
✅ Node-RED で問題なく受信・処理できている

## 学び

### 1. イベント構造の一貫性の重要性

- 異なるソース（processEvents/watcher）からのイベントでも、統一された構造が重要
- フィールド名の統一により、受信側の処理が大幅にシンプル化

### 2. 2軸設計の有効性

- 「どのイベントを送るか」と「どの情報を含めるか」を分離
- level と includeMessage の組み合わせで柔軟な設定が可能
- 複雑な level の組み合わせよりシンプルで理解しやすい

### 3. JSONLの制約を理解する

引用: `docs/letters/2026-03-01-04-40-00-webhook-payload-enhancement-and-design-decisions.md:307`
> **JSONLには結果のみ記録（途中経過なし）**

- 「処理中」イベントは JSONL から取得できない
- `stream-status` の `processing` は実質使えない
- processEvents で補完するのが正解

### 4. 不要な機能の削除

- 使われていない機能（stream-status）は削除すべき
- シンプルさを維持することで保守性が向上
- 「あったら便利」より「実際に使う」機能に絞る

## 今後の拡張

### user-message-received イベントの追加

将来的に user メッセージも配信したい場合:

```javascript
// watcher で user メッセージを検出
if (event.message && event.message.role === 'user') {
  const payload = {
    type: 'user-message-received',
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    message: includeMessage ? event.message : undefined
  };
  postToSubscriber(url, payload, authorization, label);
}
```

**用途**:
- ダッシュボードで「ユーザーが何を依頼したか」を表示
- セッションのライフサイクル全体を追跡

### より細かい level の追加

必要に応じて:
- `minimal` - session-started, process-exit のみ
- `standard` - basic と同じ
- `verbose` - full + 将来追加されるイベント

## 関連ドキュメント

### 関連ノート

- [Webhook ペイロード拡張](./2026-03-01-04-30-00-webhook-payload-enhancement.md)
- [Node-RED テスター導入とテスト分離体制](./2026-03-01-05-00-00-node-red-tester-integration-and-test-separation.md)
- [追加セッションイベントシステム](./2026-02-28-04-05-00-additional-session-events.md)
- [キャンセルイベントシステム](./2026-02-23-13-45-00-cancel-event-system.md)

### 関連申し送り

- [Webhook ペイロード拡張と設計判断](../letters/2026-03-01-04-40-00-webhook-payload-enhancement-and-design-decisions.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
