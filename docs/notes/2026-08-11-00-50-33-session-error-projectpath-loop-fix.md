---
tags: [bug, session-error, projectPath, cwd, spawn, ENOENT, api, viewer, self-amplifying-loop]
---

# session-error/session-timeout の projectPath 汚染自己増殖ループ - 診断・修正記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-08-11
**関連タスク**: `docker-test-ai-dev` セッション `f8f5bbdf-…` が `spawn script ENOENT` で永続失敗した件（先週は `server-control` の `93eadf95-…` でも同症状）

## 問題

特定プロジェクトへの `POST /sessions/:id/send` が突然 `spawn script ENOENT` で失敗し始め、以後そのプロジェクトの送信が永続的にタイムアウトし続ける。サーバを最新版にアップデートしても止まらない。

再現した壊れ方は、プロジェクトディレクトリ名の `-` が全て `/` に変換された形：

- `server-control` → `/home/seigo/tanaka/workspace/server/control`
- `docker-test-ai-dev` → `/home/seigo/tanaka/workspace/docker/test/ai/dev`

## 根本原因

2つの独立した不具合が組み合わさって無限ループ化していた。

### ① claude-code-pipe 側 — cwd 存在確認なし

`src/api.js` の `/sessions/new` / `/sessions/:id/send` は `projectPath` の「文字列が空でないか」しかチェックしておらず、`fs.existsSync` による存在確認がなかった。存在しない cwd でも `startNewSession`/`sendToSession` にそのまま渡り、`spawnClaudeProcess()` で `spawn(..., {cwd})` → cwd が無いと Node.js は `ENOENT` を返す（`script` バイナリ自体は実在するのに `spawn script ENOENT` という紛らわしいエラーになる）。

エラー発生時は `session-error` イベントが emit され、そのイベントにリクエスト由来の **壊れた projectPath がそのまま載って** subscriber へ配信された（`src/subscribers.js:271`）。

### ② node-red-viewer 側 — error イベントの projectPath を無条件上書き

`storage.ts:157` で、イベント種別を問わず `event.projectPath` が存在すれば `primaryProjectPath` を上書きしていた。①で返ってきた壊れたパスがそのまま保存される。

### 自己増殖ループ

```
クライアントが壊れた projectPath で送信
  → cwd 不在 → spawn ENOENT
  → session-error に壊れたパスが載って配信
  → viewer が無条件上書き保存（②）
  → 次回送信でも同じ壊れたパスを使う
  → 以後ずっと ENOENT
```

### 初回汚染源

v0.8.1 時代の `extractProjectPath()` にハイフンをスラッシュに変換するバグがあり、v0.8.2 で修正済み。しかし viewer 側の storage に保存された壊れた値は残り続けるため、サーバを最新版にしても viewer から壊れたパスが送られ続ける。初回汚染は viewer 側の問題として別途対処予定（このセッションのスコープ外）。

## 修正（① claude-code-pipe 側のみ）

`src/api.js` の `/sessions/new`（L717付近）と `/sessions/:id/send`（L821付近）の両方に `fs.existsSync` チェックを追加：

```js
if (!fs.existsSync(workingDirectory)) {
  return res.status(400).json({
    error: 'projectPath does not exist',
    message: `The specified working directory does not exist: ${workingDirectory}`
  });
}
```

`fs` は既にインポート済み。既存の「文字列が空でないか」チェックのすぐ後に追加する形。

**実装場所**: `src/api.js`

**主なポイント**:
1. spawn に到達しないため `session-error` が emit されない → 増幅経路が断ち切られる
2. `ENOENT` という紛らわしいエラーの代わりに `400 + 明示的なメッセージ` を返す
3. `projectPath` / `cwd`（後方互換）どちらのパラメータでも同様に検証される

**②（viewer 側修正）でやること**: `session-error`/`session-timeout` イベントの `projectPath` を `primaryProjectPath` の更新に使わない（信頼できるのは `user-message-received` 系のみ）。現時点では未対応。

## 動作確認

テスト用サーバ（ポート3199）を起動し curl で確認：

| ケース | 期待値 | 結果 |
|---|---|---|
| 存在しないパスを `/sessions/new` に送信 | 400 | ✅ `projectPath does not exist` |
| 存在しないパスを `/sessions/:id/send` に送信 | 400 | ✅ `projectPath does not exist` |
| 存在するパスを `/sessions/:id/send` に送信 | 400 以外（session not found 等） | ✅ 404（cwd チェックを通過） |
| `cwd` パラメータでも同様に検証される | 400 | ✅ |
| prompt なし（既存チェックの順序が壊れていないか） | 400 prompt is required | ✅ |

## 学び

- `spawn ENOENT` は「バイナリが見つからない」に見えるが、実際は「cwd が存在しない」場合にも同じエラーになる。Node.js の spawn の仕様上、cwd の不在は `ENOENT` として返る。
- 外部クライアントから来る `projectPath` は信頼できる入力ではなく、システム境界での検証が必要。今回は「空でないか」だけでは不十分だった。
- エラーイベントに入力値をそのまま載せて返すと、クライアント側が無条件に信用して保存する設計と組み合わさったとき自己増殖ループになる。サーバ側とクライアント側の両方で防御が必要。

## 今後の改善案

- viewer 側（②）の修正：`session-error`/`session-timeout` の `projectPath` で `primaryProjectPath` を上書きしない
- 壊れた stored path を持つ viewer の手動リカバリ手順の整備（今回は手動対処が必要な状態のまま）

## 関連ドキュメント

- viewer 側修正の連絡メモ（チャット内で別途作成予定）

---

**最終更新**: 2026-08-11
**作成者**: AI
