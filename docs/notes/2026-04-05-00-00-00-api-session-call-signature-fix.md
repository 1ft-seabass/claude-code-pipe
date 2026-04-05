---
tags: [bugfix, api, sender, options-pattern, v0.7.1]
---

# API セッション呼び出しシグネチャ修正 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-05
**関連タスク**: v0.7.1 バグ修正

## 問題

v0.7.0 で `sender.js` の `startNewSession()` と `sendToSession()` を options オブジェクト形式に変更したが、`api.js` 側の呼び出しが古い個別引数形式のままだった。

### 症状

```
api.js 600行目 で sendToSession を呼んでいるのを見ると：
const result = sendToSession(
  sessionId,
  prompt,
  workingDirectory,  // ← 3番目の引数として string を渡している
  allowedTools || [],
  skipPermissions,
  ...
);
```

しかし **sender.js 246行目** の `sendToSession` のシグネチャは：

```javascript
function sendToSession(sessionId, prompt, options = {})
```

3番目は options オブジェクトを期待しているのに、api.js は workingDirectory の文字列を渡している。

**結果**: `options = "/home/node/workspace/repos/..."` となり、`cwd` が `undefined` になって、spawn の `cwd: undefined` で実行される → claude-code-pipe 自身の作業ディレクトリで新しいセッションが起動してしまう。

これが「違うプロジェクトに届く」原因。

## 解決策

### 1. api.js の関数呼び出しを修正

**変更箇所**: `src/api.js:527-531` (startNewSession)、`src/api.js:597-601` (sendToSession)

**修正前**:
```javascript
const result = await startNewSession(
  prompt,
  workingDirectory,
  allowedTools || [],
  skipPermissions,
  null, // onData
  null, // onError
  null  // onExit
);
```

**修正後**:
```javascript
const result = await startNewSession(prompt, {
  cwd: workingDirectory,
  allowedTools: allowedTools || [],
  dangerouslySkipPermissions: skipPermissions,
  projectPath: workingDirectory
});
```

### 2. process イベントへの projectPath 追加

**問題**: `cancel-initiated` イベントに `projectPath` が含まれていなかった。

**原因**: `managedProcesses` に `projectPath` を保存していなかった。

**修正内容**:

#### sender.js の managedProcesses

**変更箇所**: `src/sender.js:95-99` (startNewSession)、`src/sender.js:282-285` (sendToSession)

```javascript
managedProcesses.set(sessionId, {
  proc,
  pid,
  startedAt: new Date(),
  projectPath: projectPath || null  // ← 追加
});
```

#### canceller.js の cancel-initiated イベント

**変更箇所**: `src/canceller.js:25-35`

```javascript
const { proc, pid, projectPath } = managed;  // ← projectPath を取得

processEvents.emit('cancel-initiated', {
  sessionId,
  pid,
  timestamp: new Date().toISOString(),
  projectPath: projectPath || null  // ← 追加
});
```

## 学び

### 1. シグネチャ変更時の呼び出し箇所の網羅確認が必要

v0.7.0 で `sender.js` を options 形式に変更したとき、呼び出し側の確認が漏れていた。

**教訓**: 関数シグネチャを変更したら、全呼び出し箇所を `grep` で確認する。

```bash
grep -r "startNewSession\(" src/
grep -r "sendToSession\(" src/
```

### 2. options パターンの利点

個別引数形式 → options オブジェクト形式への変更により：
- 引数の順序を気にしなくて良い
- 将来の拡張が容易
- コードの可読性が向上

### 3. process イベントの projectPath 統一

全ての process イベント (`session-started`, `session-timeout`, `session-error`, `process-exit`, `cancel-initiated`) に `projectPath` が含まれるようになった。

## 検証結果

### 確認項目

| 項目 | 結果 |
|------|------|
| 全呼び出し箇所 | ✅ `api.js`, `index.js` すべて正しい options 形式 |
| エクスポート/インポート | ✅ 変更なし、整合性OK |
| 構文チェック | ✅ 全ファイル OK |
| options 未指定時 | ✅ `options = {}` デフォルトで後方互換性あり |
| managedProcesses 利用箇所 | ✅ `subscribers.js` は `.has()` のみ使用、影響なし |

### 実際の Webhook ペイロード確認

```json
{
  "type": "session-started",
  "version": "0.7.1",
  "sessionId": "025717a0-f561-4be4-81ce-f2a9a483cb87",
  "pid": 15798,
  "timestamp": "2026-04-05T00:45:47.686Z",
  "projectPath": "/home/node/workspace",
  "projectName": "workspace"
}
```

✅ `projectPath` が正しく含まれている

## 関連ドキュメント

- [v0.7.0 ノート: user メッセージ Webhook とバージョン情報強化](./2026-04-04-05-00-00-user-message-webhook-and-version-enhancement.md)
- [CHANGELOG v0.7.1](../../CHANGELOG.md)

---

**最終更新**: 2026-04-05
**作成者**: Claude Code (AI)
