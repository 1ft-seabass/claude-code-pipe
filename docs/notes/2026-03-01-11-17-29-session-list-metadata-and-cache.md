---
tags: [api, session-list, cache, performance, metadata]
---

# セッション一覧API メタデータとキャッシュ実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: セッション群の一覧機能の拡張

## 問題

既存の `GET /sessions` は、セッションID と最終更新日時（ファイルのmtime）のみを返していた：

```json
{
  "sessions": [
    {
      "id": "session-id-1",
      "lastModified": "2026-03-01T10:00:00.000Z"
    }
  ]
}
```

**UIで必要な情報が不足**:
- セッションの作成日時
- メッセージ数（user/assistant別）
- トークン使用量
- 最初/最後のユーザー/アシスタントメッセージ（プレビュー用）

これらの情報を取得するには、個別に `/sessions/:id/messages` を叩く必要があり、UI側で複雑な処理が必要だった。

## 解決策の検討

### パフォーマンスの課題

セッション一覧でメタデータを返すには、**全セッションのJSONL全体をパース**する必要がある。セッション数が多いと遅くなる可能性がある。

### 検討した案

#### 案1: ファイルシステムの情報 + 部分的なJSONLパース

```javascript
// ファイルシステムから取得
stats.mtime  // 最終更新日時
stats.birthtime または stats.ctime  // 作成日時

// JSONL から部分的に取得
- 最初の数行だけ読む → firstUserMessage, firstAssistantMessage
- 最後の数行だけ読む → lastUserMessage, lastAssistantMessage
```

**問題**: メッセージ数・トークン数は全体パースが必要

#### 案2: インメモリキャッシュ

```javascript
const sessionCache = new Map();

// ファイルのmtimeが変わったらキャッシュ無効化
if (cache.mtime !== stats.mtime) {
  // 再パース
}
```

**メリット**: 2回目以降は高速
**デメリット**: メモリ使用量が増える

#### 案3: 効率的なJSONLパース

全行パースするが、必要な情報だけ抽出。

**メリット**: シンプル、確実
**デメリット**: セッション数が多いと遅い（初回）

#### 案4: ハイブリッド（採用）

**案2（キャッシュ）+ 案3（全パース）の組み合わせ**

```javascript
async function getSessionMetadata(sessionId, filePath, mtime) {
  const cached = sessionMetadataCache.get(sessionId);

  // キャッシュがあり、mtimeが同じなら返す
  if (cached && cached.mtime === mtime) {
    return cached.metadata;
  }

  // キャッシュがないか古い場合は再パース
  const metadata = await parseAndExtractMetadata(filePath);

  // キャッシュに保存
  sessionMetadataCache.set(sessionId, { mtime, metadata });

  return metadata;
}
```

**選択理由**:
- 初回は遅いが、2回目以降は高速
- 実装がシンプル
- ファイル変更を自動検知（mtime比較）
- メモリ使用量は許容範囲（メタデータのみ保存）
- セッション一覧APIはそんなに頻繁にヒットしない

## 実装内容

### 1. メタデータ取得関数の追加

**実装箇所**: `src/api.js:57-112`

```javascript
async function getSessionMetadata(sessionId, filePath, mtime) {
  // キャッシュチェック
  const cached = sessionMetadataCache.get(sessionId);
  if (cached && cached.mtime === mtime) {
    return cached.metadata;
  }

  // 全イベントをパース
  const events = await parseJSONLFile(filePath);

  // メッセージをroleでフィルタ
  const userMessages = events.filter(e => e.message && e.message.role === 'user');
  const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

  // トークン使用量を集計
  const totalTokens = assistantMessages.reduce((sum, msg) => {
    if (msg.message && msg.message.usage) {
      return sum + (msg.message.usage.input_tokens || 0)
                 + (msg.message.usage.output_tokens || 0);
    }
    return sum;
  }, 0);

  // メッセージ内容を抽出
  const extractContent = (message) => {
    if (!message || !message.message || !message.message.content) return null;
    const content = message.message.content;
    if (Array.isArray(content)) {
      // content が配列の場合、text タイプのものを連結
      const textParts = content.filter(item => item.type === 'text')
                                .map(item => item.text);
      return textParts.join('\n') || null;
    }
    return content;
  };

  const metadata = {
    id: sessionId,
    createdAt: events.length > 0 ? events[0].timestamp : null,
    lastModifiedAt: events.length > 0 ? events[events.length - 1].timestamp : null,
    messageCount: userMessages.length + assistantMessages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    totalTokens,
    firstUserMessage: userMessages.length > 0 ? extractContent(userMessages[0]) : null,
    lastUserMessage: userMessages.length > 0 ? extractContent(userMessages[userMessages.length - 1]) : null,
    firstAssistantMessage: assistantMessages.length > 0 ? extractContent(assistantMessages[0]) : null,
    lastAssistantMessage: assistantMessages.length > 0 ? extractContent(assistantMessages[assistantMessages.length - 1]) : null,
  };

  // キャッシュに保存
  sessionMetadataCache.set(sessionId, { mtime, metadata });

  return metadata;
}
```

### 2. セッション一覧エンドポイントの拡張

**実装箇所**: `src/api.js:83-155`

#### シンプル版（デフォルト）

```bash
GET /sessions
```

**レスポンス例**:

```json
{
  "sessions": [
    {
      "id": "session-id-1",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "lastModifiedAt": "2026-03-01T10:30:00.000Z",
      "messageCount": 12,
      "userMessageCount": 6,
      "assistantMessageCount": 6,
      "totalTokens": 15000,
      "firstUserMessage": "プロジェクトの構造を教えて",
      "lastUserMessage": "ありがとう",
      "firstAssistantMessage": "プロジェクト構造を確認します...",
      "lastAssistantMessage": "完了しました！"
    }
  ]
}
```

#### 詳細版（オプション）

```bash
GET /sessions?detail=true
```

**レスポンス例**:

```json
{
  "sessions": [
    {
      "id": "session-id-1",
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
        "usage": { "input_tokens": 100, "output_tokens": 50 }
      },
      "lastAssistantMessage": {
        "content": "完了しました！",
        "timestamp": "2026-03-01T10:30:00.000Z",
        "usage": { "input_tokens": 200, "output_tokens": 30 }
      }
    }
  ]
}
```

### 3. インメモリキャッシュの実装

**実装箇所**: `src/api.js:22`

```javascript
// セッションメタデータのインメモリキャッシュ
const sessionMetadataCache = new Map();
```

**キャッシュ構造**:

```javascript
Map {
  "session-id-1" => {
    mtime: 1709284800000,  // ファイルの最終更新時刻（Unix timestamp）
    metadata: {
      id: "session-id-1",
      createdAt: "...",
      // ... その他のメタデータ
    }
  }
}
```

**キャッシュ無効化の仕組み**:
- ファイルの `mtime` が変わったら再パース
- サーバー再起動時はキャッシュがクリアされる（インメモリなので）

## 主なポイント

### 1. メッセージ内容の抽出

Claude Code の JSONL では、`message.content` が配列形式：

```json
{
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "Hello!" },
      { "type": "tool_use", "name": "Read", ... }
    ]
  }
}
```

**抽出ロジック**:
- `type === 'text'` のものだけを抽出
- 複数のテキストパートがある場合は改行で連結

### 2. トークン使用量の集計

アシスタントメッセージの `usage` フィールドを集計：

```javascript
const totalTokens = assistantMessages.reduce((sum, msg) => {
  if (msg.message && msg.message.usage) {
    return sum + (msg.message.usage.input_tokens || 0)
               + (msg.message.usage.output_tokens || 0);
  }
  return sum;
}, 0);
```

**注意**: トークン最大量の情報はJSONLに含まれていない（総使用量のみ）

### 3. 日時の取得

- `createdAt`: 最初のイベントの `timestamp`
- `lastModifiedAt`: 最後のイベントの `timestamp`

ファイルの `mtime` ではなく、JSONL内のタイムスタンプを使用。

### 4. シンプル版 vs 詳細版

**シンプル版**:
- メッセージ内容は文字列で返す
- UI側でプレビュー表示しやすい

**詳細版**:
- メッセージ内容をオブジェクト形式で返す
- `timestamp` と `usage` を含む
- より詳細な情報が必要な場合に使用

## 学び

### 1. パフォーマンス最適化の考え方

**トレードオフ**:
- メモリ vs 速度
- シンプルさ vs 効率

**選択基準**:
- API のヒット頻度
- データサイズ
- 実装の複雑さ

このケースでは「セッション一覧はそんなに頻繁にヒットしない」ため、シンプルなインメモリキャッシュで十分と判断。

### 2. キャッシュ無効化の仕組み

ファイルの `mtime` を使うことで：
- ファイル変更を自動検知
- キャッシュの一貫性を保つ
- 複雑なキャッシュ管理ロジック不要

### 3. UI向けAPIの設計

**UIで必要な情報を考慮**:
- メタデータ（件数、日時、トークン）
- プレビュー用のメッセージ内容
- シンプル版/詳細版の使い分け

**メッセージ内容の全文提供**:
- UI側で切り詰め処理を実装
- API側は完全なデータを返す
- 柔軟性を確保

### 4. content が配列形式の場合の処理

Claude Code の JSONL では `content` が配列形式。テキスト以外（tool_use など）を除外する処理が必要。

```javascript
const textParts = content.filter(item => item.type === 'text')
                         .map(item => item.text);
return textParts.join('\n') || null;
```

## 今後の改善案

### パフォーマンス面

- [ ] **永続化キャッシュ**: Redis や SQLite でキャッシュを永続化（サーバー再起動後も有効）
- [ ] **部分パース**: 最初/最後の数行だけ読んで、メッセージプレビューを高速化
- [ ] **バックグラウンド更新**: ファイル監視で自動的にキャッシュを更新

### 機能面

- [ ] **ページネーション**: セッション数が多い場合の対応（`?page=1&limit=50`）
- [ ] **ソート**: 日時、メッセージ数、トークン数でソート（`?sort=createdAt&order=desc`）
- [ ] **フィルタ**: 日付範囲、メッセージ数でフィルタ（`?from=2026-03-01&to=2026-03-31`）
- [ ] **統計情報**: 総セッション数、総トークン数など

### UI連携面

- [ ] **セッション削除**: DELETE /sessions/:id の実装
- [ ] **セッションメタデータ更新**: PATCH /sessions/:id でタイトルやタグを付与

## 関連ドキュメント

### 今回のセッション
- [README/DETAILS ドキュメント分離](./2026-03-01-10-55-45-readme-details-documentation-split.md)

### 関連する過去のノート
- [API パス構造の統一とメッセージ取得機能](./2026-03-01-09-40-00-api-path-unification-and-message-endpoints.md)
- [API トークン認証の実装](./2026-03-01-09-45-00-api-token-authentication.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
