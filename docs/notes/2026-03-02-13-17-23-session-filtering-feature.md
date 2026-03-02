---
tags: [session-filtering, api, rest-api, user-experience, agent-sessions]
---

# セッションフィルタリング機能 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-02
**関連タスク**: セッションフィルタリング機能の実装

## 問題

前回実装した Send API とプロジェクトパス統合機能の検証中、ユーザーから2つの問題が指摘された：

### 問題1: `agent-*` セッションと UUID セッションの混在

`GET /sessions` と `GET /projects` のレスポンスに2種類のセッションIDが含まれていた：

- **`agent-*` 形式**: Claude Code が内部的に起動する専用エージェント（Explore、Plan など）
- **UUID 形式**: ユーザーが `claude -p` で起動した通常のセッション

**ユーザーの指摘**:
> 「ユーザーが触るべきは UUID 形式のセッションだと思う」

### 問題2: 空セッション（`messageCount === 0`）の存在

レスポンスに以下のような空のセッションが含まれていた：

```json
{
  "id": "0872774d-9b53-47f9-bb68-f0d2e13c3baf",
  "createdAt": null,
  "lastModifiedAt": null,
  "messageCount": 0,
  "userMessageCount": 0,
  "assistantMessageCount": 0,
  "totalTokens": 0,
  "projectPath": "/home/node/workspace/repos/claude-code-pipe",
  "projectName": "claude-code-pipe",
  "firstUserMessage": null,
  "lastUserMessage": null,
  "firstAssistantMessage": null,
  "lastAssistantMessage": null
}
```

**ユーザーの指摘**:
> 「`firstUserMessage` などが `null` のケースがある」

これらのセッションは、JSONLファイルにメッセージが記録される前（セッション作成直後など）や、メッセージがない空のセッションの場合に発生する。

### ユーザーの要求

**デフォルトで両方のフィルタを有効にする**:
- `agent-*` セッションを除外
- 空セッション（`messageCount === 0`）を除外
- まだ利用者がいないため、破壊的変更でも問題ない

## 解決策

### 設計方針

**クエリパラメータでフィルタリングを制御**:
- `excludeAgents`: `agent-*` セッションを除外（デフォルト: `true`）
- `excludeEmpty`: 空セッションを除外（デフォルト: `true`）

**後方互換性より UX を優先**:
- 利用者がまだいないため、デフォルトを `true` に設定
- すべてのセッションを見たい場合は `?excludeAgents=false&excludeEmpty=false` で無効化可能

### 実装場所

#### 1. `GET /sessions` エンドポイント

**ファイル**: `src/api.js:197-281`

**主なポイント**:
1. クエリパラメータから `excludeAgents` と `excludeEmpty` を取得（デフォルト: `true`）
2. `agent-*` セッションをフィルタリング（`!s.id.startsWith('agent-')`）
3. シンプル版と詳細版の両方でメタデータを取得後、`messageCount > 0` でフィルタリング

**実装コード（抜粋）**:
```javascript
// クエリパラメータからフィルタ条件を取得（デフォルト: agent セッションと空セッションを除外）
const excludeAgents = req.query.excludeAgents !== 'false'; // デフォルト true
const excludeEmpty = req.query.excludeEmpty !== 'false';   // デフォルト true

// フィルタリング適用
let filteredSessions = sessions;

// agent-* セッションを除外（オプション）
if (excludeAgents) {
  filteredSessions = filteredSessions.filter(s => !s.id.startsWith('agent-'));
}

// シンプル版: メタデータのみ
let metadataList = await Promise.all(
  filteredSessions.map(s => getSessionMetadata(s.id, s.path, s.mtime))
);

// 空セッションを除外（オプション）
if (excludeEmpty) {
  metadataList = metadataList.filter(m => m.messageCount > 0);
}
```

#### 2. `GET /projects` エンドポイント

**ファイル**: `src/api.js:153-218`

**主なポイント**:
1. プロジェクトごとにグルーピングする前に `agent-*` セッションを除外
2. グルーピング後、各プロジェクトのセッションに対して `messageCount > 0` でフィルタリング
3. セッション数が 0 になったプロジェクトを削除

**実装コード（抜粋）**:
```javascript
// クエリパラメータからフィルタ条件を取得（デフォルト: agent セッションと空セッションを除外）
const excludeAgents = req.query.excludeAgents !== 'false'; // デフォルト true
const excludeEmpty = req.query.excludeEmpty !== 'false';   // デフォルト true

for (const session of sessions) {
  // agent-* セッションを除外（オプション）
  if (excludeAgents && session.id.startsWith('agent-')) {
    continue;
  }
  // ... グルーピング処理
}

// excludeEmpty が有効な場合、空セッションを除外
if (excludeEmpty) {
  for (const [projectPath, project] of projectsMap.entries()) {
    // 各セッションのメタデータを取得してフィルタ
    const filteredSessions = [];
    for (const session of project.sessions) {
      const metadata = await getSessionMetadata(session.id, sessionFile.path, sessionFile.mtime);
      if (metadata.messageCount > 0) {
        filteredSessions.push(session);
      }
    }
    project.sessions = filteredSessions;
    project.sessionCount = filteredSessions.length;
  }

  // セッション数が0のプロジェクトを削除
  for (const [projectPath, project] of projectsMap.entries()) {
    if (project.sessionCount === 0) {
      projectsMap.delete(projectPath);
    }
  }
}
```

### 検証結果

#### `/sessions` エンドポイント

**デフォルト（フィルタ有効）**:
```bash
curl http://localhost:3100/sessions
```
- セッション数: 40件
- `agent-*` セッション: 0件 ✅
- 空セッション: 0件 ✅

**フィルタ無効化**:
```bash
curl "http://localhost:3100/sessions?excludeAgents=false&excludeEmpty=false"
```
- セッション数: 1573件
- `agent-*` セッション: 1185件
- 空セッション: 351件

#### `/projects` エンドポイント

**デフォルト（フィルタ有効）**:
```bash
curl http://localhost:3100/projects
```
- `claude-code-pipe`: 32セッション ✅
- `claude-code-pipe-tester-node-red`: 7セッション
- `workspace`: 1セッション

**フィルタ無効化**:
```bash
curl "http://localhost:3100/projects?excludeAgents=false&excludeEmpty=false"
```
- `claude-code-pipe`: 1341セッション
- `claude-code-pipe-tester-node-red`: 229セッション
- `workspace`: 3セッション

**ユーザーからのフィードバック**:
> 「ばっちりです！意図通りの出力になりました！」（Node-RED で確認）

## ドキュメント更新

DETAILS.md と DETAILS-ja.md に以下を追記：

1. **`GET /sessions` のクエリパラメータ**:
   - `excludeAgents` (boolean, デフォルト: `true`)
   - `excludeEmpty` (boolean, デフォルト: `true`)

2. **`GET /projects` のクエリパラメータ**:
   - `excludeAgents` (boolean, デフォルト: `true`)
   - `excludeEmpty` (boolean, デフォルト: `true`)

3. **使用例**:
   ```bash
   # すべて表示
   curl "http://localhost:3100/sessions?excludeAgents=false&excludeEmpty=false"

   # agent-* のみ除外
   curl "http://localhost:3100/sessions?excludeEmpty=false"

   # 空セッションのみ除外
   curl "http://localhost:3100/sessions?excludeAgents=false"
   ```

## 学び

### 学び1: デフォルト値の設計

**クエリパラメータのデフォルト値は UX を最優先**:
- `req.query.excludeAgents !== 'false'` という実装により、デフォルトで `true` になる
- 明示的に `?excludeAgents=false` を指定した場合のみ無効化される
- 後方互換性より、ユーザーにとって使いやすい挙動を優先した

### 学び2: フィルタリングのタイミング

**`/projects` エンドポイントでは段階的にフィルタリング**:
1. グルーピング前に `agent-*` を除外（軽量）
2. グルーピング後に空セッションを除外（メタデータ取得が必要）

この順序により、不要なメタデータ取得を避けることができる。

### 学び3: ユーザーフィードバックの重要性

**実装前の検証で問題を発見**:
- Send API の実装後、すぐにユーザーと一緒に検証を実施
- Node-RED でのテストにより、実際の使用感を確認
- ユーザーの「agent-* は触らない」という気づきから、UX 改善につながった

## 今後の改善案

### 改善案1: パフォーマンス最適化

現在の `/projects` エンドポイントの `excludeEmpty` 処理は、各セッションごとにメタデータを取得している。大量のセッションがある場合、パフォーマンスが低下する可能性がある。

**最適化案**:
- `getSessionFiles()` の結果をキャッシュする
- メタデータ取得を並列化する

### 改善案2: フィルタの組み合わせ拡張

将来的に以下のようなフィルタも有用かもしれない:
- `minMessageCount`: 最小メッセージ数でフィルタ
- `projectPath`: 特定プロジェクトのみ表示
- `dateFrom` / `dateTo`: 日付範囲でフィルタ

## 関連ドキュメント

- [Send API とプロジェクトパス統合](./2026-03-02-14-30-00-send-api-with-project-path-integration.md)
- [前回の申し送り](../letters/2026-03-02-14-50-00-send-api-project-path-integration.md)

---

**最終更新**: 2026-03-02
**作成者**: Claude Code (AI)
