---
tags: [webhook, user-message, version, subscribers, sender, api-enhancement]
---

# user メッセージ Webhook 配信とバージョン情報強化 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-04
**関連タスク**: user メッセージの Webhook 配信、バージョン情報の強化、sender.js の options 形式への移行

## 問題

### 1. user メッセージが Webhook で配信されていない

- `src/subscribers.js` は assistant メッセージのみを処理
- user メッセージ（ユーザー入力、ツール実行結果）は無視されていた

### 2. session-started/process-exit に projectPath がない

- sender.js の `processEvents.emit` 時に projectPath を渡していない

### 3. バージョン情報が不足

- 起動ログにバージョンが表示されない
- `/health` エンドポイントがない
- Webhook ペイロードにバージョンが含まれていない

## 解決策

### 1. user メッセージの Webhook 配信を追加

**実装場所**: `src/subscribers.js:216-261`

- イベントタイプ: `user-message-received`
- 応答時間計算: user メッセージのタイムスタンプを記録
- 共通情報: assistant と同じ構造

### 2. sender.js の options 形式への変更

**変更後**:
```javascript
function startNewSession(prompt, options = {})
function sendToSession(sessionId, prompt, options = {})
// options: { cwd, allowedTools, dangerouslySkipPermissions, projectPath, onData, onError, onExit }
```

**実装場所**:
- `src/sender.js:41-54` (startNewSession)
- `src/sender.js:226-241` (sendToSession)
- 全 processEvents に projectPath を追加

### 3. バージョン情報の追加

- 起動ログ: `claude-code-pipe v0.6.1 listening on port 3100`
- `/health`: `{ status, version, uptime }`
- 全 Webhook ペイロードに version フィールドを追加

## 学び

### JSONL ベースの統一感

- user/assistant メッセージは JSONL ベース（watcher 経由）で処理
- session-started/process-exit は sender.js ベース（processEvents 経由）で処理
- 取得方法が異なるため、CLI 経由では session-started/process-exit は発火しない

### options オブジェクトパターンの利点

- 将来の拡張が容易
- 引数の順序を気にしなくて良い
- 長期的なメンテナンス性が向上

### 慎重な一問一答アプローチの効果

- 誤解や前提のずれを防ぐ
- ユーザーとの認識を合わせながら進められる

## 関連ドキュメント

- [追加セッションイベントシステム](./2026-02-28-04-05-00-additional-session-events.md)
- [Webhook イベント構造の統一](./2026-03-01-07-41-00-webhook-event-structure-unification.md)

---

**最終更新**: 2026-04-04
**作成者**: Claude Code (AI)
