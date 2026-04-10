---
tags: [bugfix, session-separation, newline, watcher, chat-api]
---

# 改行によるセッション分離バグの修正と chat エンドポイント追加

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-09
**関連タスク**: セッション分離問題の調査・修正

## 問題

### 問題1: 改行を含むメッセージでセッションが分離する

ユーザーが改行（`\n`、`\n\n`）を含むメッセージを pipe 経由で送信すると、セッションIDの管理が破綻し、別セッションとしてイベントが発生する。

**再現パターン**:
- 空行を含む箇条書き（`\n\n` パターン）
- 数字単体行 + 改行（`1\nコメント\n2\n...`）
- 改行なしの同一内容では再現しない

**影響範囲**: セッション分離だけでなく、改行位置以降の CLI 引数（`--allowedTools`、`--model`、`--disallowedTools` 等）も消失するため、以下の不具合も引き起こしていた:
- 許可ツール・禁止ツールが効かない
- モデル指定が抜ける
- 申し送り文の下部ルールが無視される

### 問題2: 新規セッションの初手ユーザーメッセージが webhook で飛ばない

pipe が新規セッションを作成した際、最初のユーザーメッセージが watcher で検知されず、webhook に配信されない。JSONL ファイルには記録されているため、API でのメッセージ取得やClaude Code UI では正常に見える。

### 問題3: メッセージ取得 API でツール操作が混ざる

既存の `/sessions/:id/messages/user/latest` 等のエンドポイントが `role` のみでフィルタしているため、`tool_result`（user role）や `tool_use`（assistant role）が「最後のメッセージ」として返されてしまう。

## 試行錯誤

### アプローチA: 改行を `\n` リテラルにエスケープ

**試したこと**: `sender.js` のクォート処理で `.replace(/\n/g, '\\n')` を追加し、改行をリテラル文字列に変換

**結果**: セッション分離は解消されたが、Claude CLI にリテラル `\n` が渡されてしまい、JSONL や viewer で改行が `\n` という文字列として表示される

**理由**: シェルのダブルクォート内では実際の改行は文字列の一部として扱われるため、エスケープは不要だった

---

### アプローチB: 改行検知でクォートするだけ（成功）

**試したこと**: 改行文字を含む引数をダブルクォートで囲むだけで、改行自体はエスケープしない

**結果**: 成功

**理由**: `spawn('script', ['-q', '-c', claudeCommand, '/dev/null'])` で渡されるコマンド文字列内のダブルクォート内改行はシェルが文字列の一部として解釈する

## 解決策

### 修正1: sender.js のクォート処理（2箇所）

**実装場所**: `src/sender.js:87` および `src/sender.js:288`

**変更内容**: 引数のクォート判定に `\n` と `\r` のチェックを追加

```javascript
// 修正前
if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
  return `"${arg.replace(/"/g, '\\"')}"`;
}

// 修正後
if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('\n') || arg.includes('\r')) {
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
```

**ポイント**:
- 改行検知を追加してクォートを確実に適用
- バックスラッシュのエスケープも追加（既存バックスラッシュの保護）
- 改行自体はエスケープしない（ダブルクォート内なので安全）

### 修正2: watcher.js の add イベント処理

**実装場所**: `src/watcher.js:143-151`

**変更内容**: `add` イベントで既存ファイルと新規ファイルを区別

```javascript
// 修正前
this.watcher.on('add', async (filePath) => {
  await this.recordCurrentPosition(filePath);  // 中身を読まない
});

// 修正後
this.watcher.on('add', async (filePath) => {
  if (this.filePositions.has(filePath)) {
    return;  // 既存ファイル（start() で記録済み）
  }
  this.filePositions.set(filePath, 0);  // 先頭から
  await this.processNewLines(filePath);  // 中身を読む
});
```

**ポイント**:
- `start()` で既存ファイルは `filePositions` に記録済み → `has()` で判別
- 新規ファイルは位置を0にセットして `processNewLines()` で先頭から読む

### 修正3: chat エンドポイント4つの新規追加

**実装場所**: `src/api.js`（`POST /sessions/new` の直前に追加）

**新規エンドポイント**:
- `GET /sessions/:id/messages/chat/user/first`
- `GET /sessions/:id/messages/chat/user/latest`
- `GET /sessions/:id/messages/chat/assistant/first`
- `GET /sessions/:id/messages/chat/assistant/latest`

**チャット判定ロジック**:
- ユーザーチャット: `role === 'user'` かつ content に `tool_result` を含まない
- アシスタントチャット: `role === 'assistant'` かつ content に `text` があり `tool_use` を含まない

## テスト結果

### セッション分離テスト

| テスト | 修正前 | 修正後 |
|--------|--------|--------|
| Case A: 改行なし | OK | OK |
| Case B: `\n\n` 空行入り | セッション分離 / エラー | OK |
| Case C: 数字単体行 + `\n` | 未テスト（同原因） | OK |

### 初手メッセージ webhook テスト

- 修正前: watcher-message に記録されるが webhook で飛ばない
- 修正後: `add` イベントで検知され webhook 配信される

### chat エンドポイントテスト

| エンドポイント | 既存版の結果 | chat版の結果 |
|---|---|---|
| user/latest | `tool_result` が返る | ユーザーの実際の発言が返る |
| assistant/first | `thinking` が返りうる | テキスト応答が返る |

## 学び

- **シェルのダブルクォート内改行は安全**: コマンド区切りにならない。エスケープではなくクォートが正解
- **改行問題の影響は広範囲**: プロンプトの分断だけでなく、後続の全 CLI 引数（ツール制御・モデル指定等）も消失する
- **chokidar の add イベントの罠**: ファイル作成時に既にコンテンツがある場合、`recordCurrentPosition` すると全コンテンツがスキップされる
- **role だけのフィルタは不十分**: Claude Code の JSONL では `tool_result` が `user` role、`tool_use` が `assistant` role で記録されるため、純粋なチャットメッセージの抽出には content type の判定が必要

## 関連ドキュメント

- [セッション分離問題 調査ノート（ユーザー作成）](../../.tmp/images/) - ユーザーによる再現パターン特定
- [前回の申し送り](../letters/2026-04-07-23-10-00-message-api-projectpath-implementation.md)

---

**最終更新**: 2026-04-09
**作成者**: Claude Code (AI)
