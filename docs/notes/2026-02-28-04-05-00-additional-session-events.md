---
tags: [event-system, sender, session-lifecycle, webhook, eventEmitter]
---

# 追加セッションイベントシステム - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-28
**関連タスク**: sender.jsに追加イベント実装（session-started, session-error, session-timeout）

## 問題

既存のイベントシステムでは以下のイベントのみ対応していた:
- `cancel-initiated`: キャンセル開始時
- `process-exit`: プロセス終了時

しかし、セッションのライフサイクル全体を把握するには不十分だった。

### 具体的な課題
- セッション開始のタイミングが検知できない
- API経由のセッション起動と、直接CLIからの起動を区別できない
- エラー発生時の通知がない
- タイムアウト時の処理がない

## 解決策

以下の3つの新しいイベントを実装した:
1. `session-started`: セッション開始成功時
2. `session-error`: プロセス起動エラー時
3. `session-timeout`: セッション開始タイムアウト時

### 実装場所
- `src/sender.js`: イベント発行
- `src/subscribers.js`: イベント監視とWebhook配信
- `src/index.js`: イベントのログ記録

## 実装詳細

### 1. session-started イベント

**目的**: セッション開始成功を通知し、API経由か直接CLI起動かを区別する

**発行タイミング**:
- 新規セッション: UUID取得成功時
- 既存セッション再開: `sendToSession` 実行時

**ペイロード**:
```javascript
{
  sessionId: "actual-uuid",
  pid: 12345,
  timestamp: "2026-02-28T04:00:00.000Z",
  resumed: true  // 既存セッション再開の場合のみ
}
```

**実装コード** (`src/sender.js:90-95`):
```javascript
// session-started イベント発行
processEvents.emit('session-started', {
  sessionId: actualSessionId,
  pid,
  timestamp: new Date().toISOString()
});
```

**起動元の判別方法**:
- API経由: `session-started` イベント + watcher の message イベント
- 直接CLI: watcher の message イベントのみ

→ Webhook受信側で `session-started` の有無により起動元を判別可能

### 2. session-error イベント

**目的**: プロセス起動エラーを通知

**発行タイミング**:
- `proc.on('error')` 時
- `startNewSession` と `sendToSession` の両方で発行

**ペイロード**:
```javascript
{
  sessionId: "temp-xxx" or "actual-uuid",
  pid: 12345,
  timestamp: "2026-02-28T04:00:00.000Z",
  error: "Error message"
}
```

**実装コード** (`src/sender.js:140-147`):
```javascript
// session-error イベント発行
const sessionId = actualSessionId || tempSessionId;
processEvents.emit('session-error', {
  sessionId,
  pid,
  timestamp: new Date().toISOString(),
  error: err.message
});
```

### 3. session-timeout イベント

**目的**: セッション開始タイムアウトを通知

**タイムアウト時間**: 60秒（`SESSION_START_TIMEOUT_MS`）

**発行タイミング**:
- セッションID取得に60秒以上かかった場合

**ペイロード**:
```javascript
{
  sessionId: "temp-xxx",
  pid: 12345,
  timestamp: "2026-02-28T04:00:00.000Z",
  error: "Session start timeout: Failed to retrieve session ID"
}
```

**実装コード** (`src/sender.js:64-81`):
```javascript
// タイムアウト設定
sessionStartTimeout = setTimeout(() => {
  if (!firstLineReceived) {
    const timeoutError = new Error('Session start timeout: Failed to retrieve session ID');
    console.error(`[sender] ${timeoutError.message}: pid=${pid}`);

    // session-timeout イベント発行
    processEvents.emit('session-timeout', {
      sessionId: tempSessionId,
      pid,
      timestamp: new Date().toISOString(),
      error: timeoutError.message
    });

    proc.kill();
    managedProcesses.delete(tempSessionId);
    reject(timeoutError);
  }
}, SESSION_START_TIMEOUT_MS);
```

**タイムアウトのクリア**:
- セッションID取得成功時
- エラー発生時

## イベントフロー

### 正常系（新規セッション）
```
1. startNewSession() 呼び出し
2. プロセス起動
3. セッションID取得成功
4. session-started イベント発行 ✅
5. プロセス終了
6. process-exit イベント発行
```

### 正常系（既存セッション再開）
```
1. sendToSession() 呼び出し
2. プロセス起動
3. session-started イベント発行（resumed: true） ✅
4. プロセス終了
5. process-exit イベント発行
```

### エラー系（起動エラー）
```
1. startNewSession() 呼び出し
2. プロセス起動失敗
3. session-error イベント発行 ✅
```

### エラー系（タイムアウト）
```
1. startNewSession() 呼び出し
2. プロセス起動
3. 60秒経過してもセッションID取得できず
4. session-timeout イベント発行 ✅
5. プロセス強制終了
```

## Webhook配信

`src/subscribers.js` で全てのイベントを監視し、Webhook配信を行う:

```javascript
processEvents.on('session-started', (event) => {
  for (const subscriber of subscribers) {
    handleProcessEvent(subscriber, 'session-started', event);
  }
});

processEvents.on('session-error', (event) => {
  for (const subscriber of subscribers) {
    handleProcessEvent(subscriber, 'session-error', event);
  }
});

processEvents.on('session-timeout', (event) => {
  for (const subscriber of subscribers) {
    handleProcessEvent(subscriber, 'session-timeout', event);
  }
});
```

## 学び

### イベント駆動アーキテクチャの拡張性
- EventEmitterパターンにより、新しいイベントを簡単に追加できた
- 既存のコード（subscribers.js）への影響を最小限に抑えられた

### API起動と直接CLI起動の区別
- `session-started` イベントの有無で起動元を判別できる設計
- Webhook受信側で柔軟な処理分岐が可能

### タイムアウト処理の重要性
- 無限待ちを防ぐためのタイムアウトは必須
- タイムアウト後のクリーンアップ（プロセス削除）も重要

### エラー情報の伝播
- イベントペイロードに `error` フィールドを含めることで、詳細なエラー情報を伝達
- Webhook受信側でエラー内容を把握できる

## 今後の改善案

### イベントの追加
- `session-resuming`: セッション再開開始時（現在は `session-started` で resumed フラグで判別）
- `session-paused`: セッション一時停止時
- `session-completed`: セッション正常完了時（process-exitとは別）

### タイムアウト時間の設定
- 環境変数やconfig.jsonでタイムアウト時間を設定可能にする
- セッションタイプごとに異なるタイムアウト時間を設定

### エラーリカバリ
- session-error 発生時に自動リトライする仕組み
- リトライ回数と間隔の設定

### イベントログの強化
- イベントの発生頻度を記録
- イベントチェーン（session-started → process-exit）の追跡

## 関連ドキュメント

- [Webhook配信エラーハンドリング](./2026-02-28-04-00-00-webhook-delivery-error-handling.md)
- [キャンセルイベントシステムの実装](./2026-02-23-13-45-00-cancel-event-system.md)
- [前回の申し送り](../letters/2026-02-23-13-55-00-sender-improvements-and-event-system.md)

---

**最終更新**: 2026-02-28
**作成者**: Claude Code (AI)
