---
tags: [config, webhook, design, callback-url, docker-network]
---

# callbackUrl 設定追加の設計 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-16
**関連タスク**: callbackUrl 設定追加機能（計画フェーズ）

## 問題

Webhook 送信先（Node-RED など）から `claude-code-pipe` に対して指示（Send API）を送りたいが、**外から見たこのサーバーの URL** が Webhook ペイロードに含まれていないため、受信側が URL を推測する必要がある。

### 具体的な課題

1. **localhost 環境**: 自明なので問題なし（`http://localhost:3100`）
2. **Docker 内ネットワーク**: 別コンテナから見た URL が不明（例: `http://claude-code-pipe:3100`）
3. **外部サーバー**: 完全に不明（例: `https://api.example.com/claude`）

### 現状の回避策とその問題点

- **ダッシュボード側で URL を記録する**
  - ❌ 密結合: ダッシュボードと claude-code-pipe が設定で縛り合う
  - ❌ 複雑: 設定を2箇所で管理する必要がある

- **Webhook 受信側で決め打ち**
  - ❌ 環境ごとに受信側のコードを変更する必要がある
  - ❌ 柔軟性がない

## 設計方針

### 基本コンセプト

**「未設定でもいい値」として `callbackUrl` を追加する**

- localhost 環境では自明なので未設定でOK
- Docker/外部環境では設定することで、Webhook 受信側が URL を知ることができる
- README.md での簡単な指示送信例は壊れない（後方互換性）

### 調査結果

#### 現在の設定構造（config.json）

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "",           // ← 既存（未設定可）
  "projectTitle": "",       // ← 既存（未設定可）
  "subscribers": [...],
  "send": {...}
}
```

#### 現在の Webhook ペイロード構造（src/subscribers.js:236-254）

```javascript
const payload = {
  type: 'assistant-response-completed',
  sessionId: event.sessionId,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  projectPath: '...',
  projectName: '...',
  projectTitle: '...',  // ← config.projectTitle から取得
  source: 'api'|'cli',
  tools: [...],
  responseTime: 123.45,
  git: {...},
  message: {...}
};
```

#### 環境変数の現状

- 現在、設定値の環境変数対応は行っていない（`HOME` の展開のみ）
- `apiToken`, `projectTitle` なども環境変数からの読み込みなし
- 将来的に必要になれば追加可能

## 設計決定

### 決定1: 設定項目名は `callbackUrl`

**検討した候補**:

| 名前 | 意味 | 評価 |
|------|------|------|
| `callbackUrl` | Webhook文脈で「返信先URL」が明確 | ✅ **採用** |
| `apiUrl` | シンプルだがやや汎用的すぎる | △ |
| `apiEndpoint` | エンドポイント感が強すぎる | △ |
| `externalUrl` | 外から見たURLという意図は明確 | ○ |
| `baseUrl` | APIのベースURLとして一般的 | ○ |
| `fromExternalCallbackUrl` | 意図は明確だが冗長 | △ |

**採用理由**:
- **簡潔さ**: 設定ファイルで短い方が良い
- **文脈の明確さ**: Webhook 文脈では「callback」だけで意味が伝わる
- **一般的な命名**: OAuth, Webhook API などで広く使われるパターン

### 決定2: 未設定時の動作

**仕様**:
- 未設定（空文字列または未定義）の場合: `callbackUrl: null` としてペイロードに含める
- 設定時: そのまま文字列として送信

**例**:

```json
// config.json が "" の場合
{
  "callbackUrl": null,
  // ... 他のフィールド
}

// config.json が "http://claude-code-pipe:3100" の場合
{
  "callbackUrl": "http://claude-code-pipe:3100",
  // ... 他のフィールド
}
```

### 決定3: 設定場所

- **サーバー全体の設定**（プロジェクトごとではない）
- `config.json` のトップレベル
- 環境変数からの上書きは今回対応しない（将来の拡張として残す）

### 決定4: Webhook ペイロードへの追加場所

**追加フィールド**:
```javascript
const payload = {
  type: 'assistant-response-completed',
  sessionId: event.sessionId,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  callbackUrl: config.callbackUrl || null,  // ← NEW!
  // ... 以下既存フィールド
};
```

**追加場所**: `serverInfo` に含めて、全イベントタイプで統一的に送信

## 実装計画

### ステップ1: config.example.json の更新

**ファイル**: `config.example.json`

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "",
  "projectTitle": "",
  "callbackUrl": "",  // ← 追加
  "subscribers": [...],
  "send": {...}
}
```

### ステップ2: src/subscribers.js の修正

**変更箇所1**: `setupSubscribers` 関数（src/subscribers.js:120-132）

```javascript
function setupSubscribers(subscribers, watcher, processEvents, config = {}) {
  // ...
  const cwdPath = process.cwd();
  const cwdName = path.basename(cwdPath);
  const projectTitle = config.projectTitle || null;
  const callbackUrl = config.callbackUrl || null;  // ← 追加

  const serverInfo = { cwdPath, cwdName, projectTitle, callbackUrl };  // ← 追加
  // ...
}
```

**変更箇所2**: `handleSubscriberEvent` 関数（src/subscribers.js:236-256）

```javascript
const payload = {
  type: 'assistant-response-completed',
  sessionId: event.sessionId,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  callbackUrl: serverInfo.callbackUrl,  // ← 追加
  ...(projectPath && { projectPath }),
  ...(projectName && { projectName }),
  ...(serverInfo.projectTitle && { projectTitle: serverInfo.projectTitle }),
  source: source,
  tools: event.tools || [],
  responseTime: responseTime,
  git: gitInfo
};
```

**変更箇所3**: `handleProcessEvent` 関数（src/subscribers.js:191-205）

```javascript
const payload = {
  type: eventType,
  sessionId: event.sessionId,
  pid: event.pid,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  callbackUrl: serverInfo.callbackUrl,  // ← 追加
  ...(serverInfo.projectTitle && { projectTitle: serverInfo.projectTitle }),
  ...(event.code !== undefined && { code: event.code }),
  ...(event.signal !== undefined && { signal: event.signal }),
  ...(event.error !== undefined && { error: event.error }),
  ...(event.resumed !== undefined && { resumed: event.resumed })
};
```

### ステップ3: ドキュメント更新（DETAILS.md, DETAILS-ja.md）

**設定表への追加**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `callbackUrl` | string | No | `""` | External URL of this server (for Webhook recipients to call back). If not set, `null` is sent in Webhook payload. |

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `callbackUrl` | string | No | `""` | このサーバーの外部URL（Webhook受信側がコールバックするために使用）。未設定の場合、Webhookペイロードに `null` が送信される。 |

### ステップ4: ドキュメント更新（README.md, README-ja.md）

**設定例への追加**:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "",
  "projectTitle": "",
  "callbackUrl": "http://claude-code-pipe:3100",  // ← 追加
  "subscribers": [...]
}
```

**使用例の追加**:

```markdown
#### Docker 環境での設定例

Docker 内ネットワークで Node-RED と連携する場合:

```json
{
  "callbackUrl": "http://claude-code-pipe:3100"
}
```

Webhook 受信側（Node-RED）は、ペイロードの `callbackUrl` を使って Send API を呼び出せます:

```javascript
// Node-RED Function ノードの例
const callbackUrl = msg.payload.callbackUrl;
if (callbackUrl) {
  // callbackUrl を使って /api/send を呼び出す
  msg.url = `${callbackUrl}/api/send`;
}
```
```

### ステップ5: 実装記録の作成

**ファイル**: `docs/letters/2026-03-16-XX-XX-XX-callback-url-config-implementation.md`

- 実装の経緯
- 設計決定の理由
- テスト結果
- 次セッションへの申し送り

## ユースケース例

### ケース1: localhost 開発環境

**config.json**:
```json
{
  "callbackUrl": ""
}
```

**Webhook ペイロード**:
```json
{
  "callbackUrl": null,
  "cwdPath": "/home/node/workspace/repos/claude-code-pipe",
  // ...
}
```

**Node-RED での処理**:
```javascript
const callbackUrl = msg.payload.callbackUrl || 'http://localhost:3100';
msg.url = `${callbackUrl}/api/send`;
```

### ケース2: Docker 内ネットワーク

**config.json**:
```json
{
  "callbackUrl": "http://claude-code-pipe:3100"
}
```

**Webhook ペイロード**:
```json
{
  "callbackUrl": "http://claude-code-pipe:3100",
  "cwdPath": "/home/node/workspace/repos/claude-code-pipe",
  // ...
}
```

**Node-RED での処理**:
```javascript
const callbackUrl = msg.payload.callbackUrl;
msg.url = `${callbackUrl}/api/send`;
```

### ケース3: 外部サーバー

**config.json**:
```json
{
  "callbackUrl": "https://api.example.com/claude"
}
```

**Webhook ペイロード**:
```json
{
  "callbackUrl": "https://api.example.com/claude",
  "cwdPath": "/home/node/workspace/repos/claude-code-pipe",
  // ...
}
```

## 学び

### 設計上の考慮点

1. **未設定でもOK**: localhost 環境では不要、設定しなくても動作する
2. **後方互換性**: 既存の Webhook 受信側も動作する（`callbackUrl` を無視すればOK）
3. **密結合の回避**: ダッシュボード側に設定を持たせず、claude-code-pipe 側で完結

### 命名の重要性

- `callbackUrl` は Webhook 文脈で直感的
- `fromExternalCallbackUrl` は冗長で、設定ファイルが読みにくくなる
- 簡潔さと明確さのバランスが重要

### 環境変数対応は後回し

- 現状、他の設定項目も環境変数対応していない
- 一貫性を保つため、今回は `config.json` のみ対応
- 将来的に必要になれば、一括で環境変数対応を追加

## 今後の改善案

- 環境変数対応（`CALLBACK_URL` など）
- 設定検証機能（URL の形式チェック）
- ダッシュボード側での自動設定機能（Webhook ペイロードから `callbackUrl` を読み取って保存）

## 関連ドキュメント

- [Webhook Git 情報追加機能の実装記録](./2026-03-14-15-00-00-webhook-git-info-implementation.md)
- [API トークン認証の実装記録](./2026-03-01-09-45-00-api-token-authentication.md)

---

**最終更新**: 2026-03-16
**作成者**: Claude Code (AI)
