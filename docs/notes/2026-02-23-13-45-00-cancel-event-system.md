---
tags: [event-emitter, webhook, cancel, process-management, architecture]
---

# キャンセルイベントシステムの実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: キャンセルイベントのWebhook配信

## 問題

キャンセル操作（`POST /sessions/:id/cancel`）が実行されても、その情報がWebhook経由で配信されない問題がありました。

### 背景

- Claude CLIのJSONLファイルには**キャンセル情報が記録されない**
- watcherはJSONLファイルの変更のみを監視
- sender.js/canceller.jsのログ（console.log）にはキャンセル情報があるが、イベントとして発行されていない

### 必要な機能

1. キャンセル開始時のイベント（`cancel-initiated`）
2. プロセス終了時のイベント（`process-exit`）
3. これらのイベントをWebhook経由で配信

## 試行錯誤

### 調査: Claude CLIのJSONLにキャンセル情報が含まれるか？

**試したこと**: キャンセルしたセッションのJSONLファイルを確認

```bash
cat ~/.claude/projects/.../44db4c42-f826-4ac3-b34b-29b1be2c37cd.jsonl | tail -n 5
```

**結果**: キャンセル情報は含まれていない

**発見**:
- JSONLには途中までのメッセージしか記録されない
- プロセスが強制終了されるため、終了イベントは書き込まれない
- **キャンセル情報はsender.js/canceller.js側で独自にイベント発行する必要がある**

---

### アプローチ: EventEmitterを使ったイベントシステム（成功）

**試したこと**: sender.jsをEventEmitter化し、canceller.jsと連携

**結果**: 成功

**実装の流れ**:
1. sender.jsに `processEvents` (EventEmitter) を追加
2. canceller.jsでキャンセル開始時に `cancel-initiated` イベントを発行
3. sender.jsでプロセス終了時に `process-exit` イベントを発行
4. subscribers.jsでこれらのイベントを監視
5. Webhook経由で配信

## 解決策

EventEmitterを使ってsender.js/canceller.jsからイベントを発行し、subscribers.jsで受け取ってWebhook配信する仕組みを実装しました。

### アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│               index.js                          │
│  - processEvents のイベントを logs に記録       │
│  - subscribers に processEvents を渡す          │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴─────────────┐
      ▼                     ▼
┌──────────────┐   ┌──────────────────────┐
│  sender.js   │   │   subscribers.js     │
│              │   │                      │
│ processEvents├──→│ - watcher のイベント │
│ (EventEmitter)   │ - processEvents の    │
│              │   │   イベントを監視      │
│ emit:        │   │                      │
│ - process-exit   │ → Webhook 配信       │
└──────────────┘   └──────────────────────┘
      ▲
      │
┌──────────────┐
│ canceller.js │
│              │
│ emit:        │
│ - cancel-    │
│   initiated  │
└──────────────┘
```

### 実装箇所

#### 1. sender.js: EventEmitter の追加

**ファイル**: `src/sender.js:9-15`

```javascript
const { spawn } = require('child_process');
const EventEmitter = require('events');

// sessionId → { proc, pid, startedAt } のマップ
const managedProcesses = new Map();

// EventEmitter のインスタンス
const processEvents = new EventEmitter();
```

#### 2. sender.js: process-exit イベントの発行

**ファイル**: `src/sender.js:106-113`

```javascript
// プロセス終了時の処理
proc.on('exit', (code, signal) => {
  const sessionId = actualSessionId || tempSessionId;
  console.log(`[sender] Process exited: sessionId=${sessionId}, pid=${pid}, code=${code}, signal=${signal}`);

  // イベント発行
  processEvents.emit('process-exit', {
    sessionId,
    pid,
    code,
    signal,
    timestamp: new Date().toISOString()
  });

  managedProcesses.delete(sessionId);
  // ...
});
```

#### 3. canceller.js: cancel-initiated イベントの発行

**ファイル**: `src/canceller.js:9, 29-34`

```javascript
const { getManagedProcess, processEvents } = require('./sender');

// ...

// キャンセル開始イベントを発行
processEvents.emit('cancel-initiated', {
  sessionId,
  pid,
  timestamp: new Date().toISOString()
});

// まず SIGINT を送る
try {
  proc.kill('SIGINT');
  // ...
```

#### 4. subscribers.js: processEvents の監視

**ファイル**: `src/subscribers.js:18, 34-47`

```javascript
function setupSubscribers(subscribers, watcher, processEvents) {
  // ...

  // processEvents のイベントを監視（キャンセルや終了など）
  if (processEvents) {
    processEvents.on('cancel-initiated', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'cancel-initiated', event);
      }
    });

    processEvents.on('process-exit', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'process-exit', event);
      }
    });
  }
  // ...
}
```

#### 5. subscribers.js: handleProcessEvent 関数

**ファイル**: `src/subscribers.js:55-70`

```javascript
function handleProcessEvent(subscriber, eventType, event) {
  const { url, label, level, authorization } = subscriber;

  // レベルに応じて処理（status, summary, stream, stream-status すべてに送信）
  if (level === 'status' || level === 'summary' || level === 'stream' || level === 'stream-status') {
    const payload = {
      type: eventType,
      sessionId: event.sessionId,
      pid: event.pid,
      timestamp: event.timestamp,
      ...(event.code !== undefined && { code: event.code }),
      ...(event.signal !== undefined && { signal: event.signal })
    };
    postToSubscriber(url, payload, authorization, label);
  }
}
```

#### 6. index.js: processEvents の統合

**ファイル**: `src/index.js:16, 59, 65-72`

```javascript
const { startNewSession, sendToSession, getManagedProcesses, processEvents } = require('./sender');

// subscribers をセットアップ
setupSubscribers(config.subscribers, watcher, processEvents);

// processEvents のイベントをログに記録
processEvents.on('cancel-initiated', (event) => {
  writeLog('cancel-initiated', event);
});

processEvents.on('process-exit', (event) => {
  writeLog('process-exit', event);
});
```

## 動作確認

### テスト手順

1. セッション作成
```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Please read all files in src/ and summarize."}'
# → {"pid":12616,"sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379"}
```

2. キャンセル実行
```bash
curl -X POST http://localhost:3100/sessions/314b1e61-0dbb-4e7a-a41f-9044757ac379/cancel
# → {"cancelled":true,"sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616}
```

3. ログ確認
```bash
tail logs/server.log | grep -E "(cancel|exit)"
```

### 結果

**logs/server.log**:
```json
{"timestamp":"2026-02-23T13:36:50.454Z","category":"cancel-initiated","data":{"sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:50.451Z"}}
{"timestamp":"2026-02-23T13:36:52.455Z","category":"process-exit","data":{"sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:52.453Z","code":0,"signal":null}}
```

**logs/receiver.log (Webhook配信)**:
```json
{"timestamp":"2026-02-23T13:36:50.454Z","endpoint":"claude-event","data":{"type":"cancel-initiated","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:50.451Z"}}
{"timestamp":"2026-02-23T13:36:50.455Z","endpoint":"claude-status","data":{"type":"cancel-initiated","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:50.451Z"}}
{"timestamp":"2026-02-23T13:36:50.456Z","endpoint":"claude-stream","data":{"type":"cancel-initiated","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:50.451Z"}}
{"timestamp":"2026-02-23T13:36:52.455Z","endpoint":"claude-event","data":{"type":"process-exit","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:52.453Z","code":0,"signal":null}}
{"timestamp":"2026-02-23T13:36:52.455Z","endpoint":"claude-status","data":{"type":"process-exit","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:52.453Z","code":0,"signal":null}}
{"timestamp":"2026-02-23T13:36:52.456Z","endpoint":"claude-stream","data":{"type":"process-exit","sessionId":"314b1e61-0dbb-4e7a-a41f-9044757ac379","pid":12616,"timestamp":"2026-02-23T13:36:52.453Z","code":0,"signal":null}}
```

3つのエンドポイント（`claude-event`, `claude-status`, `claude-stream`）すべてにイベントが配信されました。

## 学び

### EventEmitterパターンの利点

1. **疎結合**: sender.js/canceller.jsはsubscribers.jsの存在を知らなくても良い
2. **拡張性**: 新しいイベントリスナーを簡単に追加できる
3. **標準機能**: Node.jsの標準モジュールで追加依存なし

### イベント駆動アーキテクチャ

```javascript
// イベント発行側（sender.js, canceller.js）
processEvents.emit('event-name', { data });

// イベント受信側（subscribers.js, index.js）
processEvents.on('event-name', (data) => {
  // 処理
});
```

- 1つのイベント発行で複数のリスナーに通知
- リスナーは独立して動作（エラーが波及しない）

### 発行されるイベント

| イベント名 | 発行タイミング | データ |
|-----------|---------------|--------|
| `cancel-initiated` | キャンセル開始 | `{ sessionId, pid, timestamp }` |
| `process-exit` | プロセス終了 | `{ sessionId, pid, code, signal, timestamp }` |

## 今後の改善案

### 追加イベント候補

- `session-started`: セッション開始時（UUID取得成功時）
- `session-error`: エラー発生時
- `session-timeout`: タイムアウト時

### エラーハンドリング

- イベントリスナー内のエラーをキャッチ
- エラーログの記録
- リトライ機構（Webhook配信失敗時）

### パフォーマンス

- イベント発行の頻度制御（throttle/debounce）
- Webhook配信のキューイング

## 関連ドキュメント

- [scriptコマンドによるバッファリング問題の解決](./2026-02-23-13-40-00-script-command-for-cli-buffering.md)
- [PM2とAPIテストの申し送り](../letters/2026-02-23-13-00-00-pm2-and-api-testing.md)

---

**最終更新**: 2026-02-23
**作成者**: Claude Code (AI)
