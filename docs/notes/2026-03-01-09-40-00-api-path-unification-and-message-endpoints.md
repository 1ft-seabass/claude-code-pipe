---
tags: [api, refactor, message-endpoints, path-structure]
---

# API パス構造の統一とメッセージ取得機能 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: メッセージ取得 API の充実

## 背景

### なぜこの実装が必要になったか

Webhook によるイベント通知は「点」の情報しか提供しない。例えば：
- `assistant-response-completed` イベントが届く
- しかし、そのセッションの全体的な文脈（過去のメッセージ）は取得できない

ユーザーの要望：
> Webhook だけだと点の情報がパイプ（垣間見える）のはいいと思いまして、ちょい発展です。メッセージを取得できる API を持ちたいです。

必要な機能：
- セッション ID 指定で全メッセージ一覧が取得できる
- セッション ID 指定で最初のユーザーメッセージが取得できる
- セッション ID 指定で最後のユーザーメッセージが取得できる

### 既存 API の問題点

既存の API パスに統一感がなかった：
- `GET /sessions/:id` - 全イベント取得
- `GET /sessions/:id/latest` - 最新の assistant メッセージ

新しいエンドポイントを追加するにあたり、統一感のある構造にリファクタリングすることに。

## 実装内容

### 1. API パス構造の統一

**新しい設計**:

全てのメッセージ関連 API を `/sessions/:id/messages` 配下に統一。

| エンドポイント | 説明 |
|---------------|------|
| `GET /sessions/:id/messages` | 全メッセージ一覧 |
| `GET /sessions/:id/messages/user/first` | 最初のユーザーメッセージ |
| `GET /sessions/:id/messages/user/latest` | 最後のユーザーメッセージ |
| `GET /sessions/:id/messages/assistant/first` | 最初のアシスタントメッセージ |
| `GET /sessions/:id/messages/assistant/latest` | 最後のアシスタントメッセージ |

**移行内容**:
- 旧: `GET /sessions/:id` → 新: `GET /sessions/:id/messages`
- 旧: `GET /sessions/:id/latest` → 新: `GET /sessions/:id/messages/assistant/latest`
- 完全移行（後方互換性なし）- まだ利用者がいないため

### 2. ファイル構造への対応

**問題**:
既存の `getSessionDirectories()` 関数は `sessions/<session-id>/` ディレクトリ構造を想定していた。

しかし、実際の Claude Code のファイル構造は：
```
~/.claude/projects/
  -home-node-workspace/
    fbd6afc6-9030-412f-ba37-5b948023c7f9.jsonl
    agent-03a239e4.jsonl
    agent-6a5026b7.jsonl
```

**解決策**:
`getSessionFiles()` に変更し、直接 JSONL ファイルを検索する構造に。

**修正箇所**: `src/api.js:24-61`

```javascript
async function getSessionFiles() {
  const sessions = [];

  async function findJSONLFiles(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await findJSONLFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const stats = await fs.promises.stat(fullPath);
        const sessionId = path.basename(entry.name, '.jsonl');
        sessions.push({
          id: sessionId,
          path: fullPath,
          lastModified: stats.mtime
        });
      }
    }
  }

  await findJSONLFiles(normalizedWatchDir);
  return sessions;
}
```

### 3. 新しいエンドポイントの実装

**実装箇所**: `src/api.js:137-243`

各エンドポイントの実装パターン：
1. セッション ID から JSONL ファイルパスを取得
2. JSONL ファイルをパース
3. role でフィルタリング（user または assistant）
4. first または latest を返す

**コード例（user/first）**:
```javascript
router.get('/sessions/:id/messages/user/first', async (req, res) => {
  const sessionId = req.params.id;
  const jsonlPath = await getSessionJSONLPath(sessionId);

  if (!jsonlPath) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const events = await parseJSONLFile(jsonlPath);
  const userMessages = events.filter(e => e.message && e.message.role === 'user');

  if (userMessages.length === 0) {
    return res.status(404).json({ error: 'No user messages found' });
  }

  res.json({
    sessionId,
    message: userMessages[0]
  });
});
```

## テスト結果

### テストに使用したセッション
- セッション ID: `9016eae7-2768-4edb-83ba-ac042e5fd6bb`
- 作成: `POST /sessions/new` で作成
- プロンプト: "Hello, this is a test message for API testing"

### 各エンドポイントの動作確認

**✅ GET /sessions/:id/messages/user/first**
```json
{
  "sessionId": "9016eae7-2768-4edb-83ba-ac042e5fd6bb",
  "message": {
    "role": "user",
    "content": "Hello, this is a test message for API testing"
  }
}
```

**✅ GET /sessions/:id/messages/user/latest**
- 同一の結果（このセッションでは user メッセージが1つのみ）

**✅ GET /sessions/:id/messages/assistant/first**
```json
{
  "sessionId": "9016eae7-2768-4edb-83ba-ac042e5fd6bb",
  "message": {
    "role": "assistant",
    "content": [...]
  }
}
```

**✅ GET /sessions/:id/messages/assistant/latest**
- 同一の結果（このセッションでは assistant メッセージが1つのみ）

**✅ GET /sessions/:id/messages**
- 全イベントを返す（user + assistant + メタイベント）

## 設計のポイント

### パス構造の一貫性

**決定**: `/sessions/:id/messages/{role}/{position}` の形式で統一

**理由**:
- RESTful な構造
- 役割（user/assistant）と位置（first/latest）が明確
- 将来的な拡張性（例: `/messages/user/all`、`/messages/system/first` など）

### エラーハンドリング

**パターン1: セッションが見つからない**
```json
{ "error": "Session not found" }
```
HTTP ステータス: 404

**パターン2: メッセージが見つからない**
```json
{ "error": "No user messages found" }
```
HTTP ステータス: 404

### レスポンス形式の統一

全てのメッセージ取得エンドポイントは以下の形式：
```json
{
  "sessionId": "...",
  "message": { ... }
}
```

全メッセージ取得は：
```json
{
  "sessionId": "...",
  "events": [ ... ]
}
```

## 学び

### 学び1: 実装前にファイル構造を確認する重要性

最初、既存の `getSessionDirectories()` を使おうとしたが、実際のファイル構造と異なっていた。
- 想定: `sessions/<session-id>/*.jsonl`
- 実際: `<project-dir>/<session-id>.jsonl`

実装前に `ls` や `find` で実際の構造を確認することが重要。

### 学び2: API 設計の統一感

統一感のある API 構造は：
- ドキュメントが書きやすい
- ユーザーが予測しやすい
- メンテナンスしやすい

今回のリファクタリングで、将来的な拡張も容易になった。

### 学び3: 完全移行の判断

「まだ利用者がいない」という状況では、後方互換性を維持するコストよりも、クリーンな構造を優先する判断が正しい。

## 今後の改善案

### フィルタリング・ページネーション

現在は全メッセージを返すが、以下の機能があると便利：
- タイムスタンプ範囲でフィルタ
- ページネーション（limit/offset）
- メッセージ数のカウント

### キャッシュ

JSONL ファイルのパースは毎回行われる。頻繁にアクセスされる場合、キャッシュを検討。

## 関連ドキュメント

### 前回のセッション
- [README ドキュメント充実化](./2026-03-01-08-10-00-readme-documentation-enhancement.md)

### 関連する申し送り
- [API テストと Webhook イベント統一](../letters/2026-03-01-07-52-00-api-testing-and-webhook-event-unification.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
