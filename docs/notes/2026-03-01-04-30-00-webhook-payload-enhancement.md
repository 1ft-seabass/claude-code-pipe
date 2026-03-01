---
tags: [webhook, payload, parser, subscribers, enhancement, tools, response-time]
---

# Webhook ペイロード拡張 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: Webhook配信時のペイロードに追加情報を含める

## 問題

従来のWebhookペイロードは以下の情報のみを配信していた：

```json
{
  "sessionId": "xxx",
  "timestamp": "xxx",
  "status": "completed",
  "lastMessage": {...}
}
```

**不足していた情報**:
- どこから来たセッションか（API経由 vs CLI直接実行）
- どのツールを使ったか
- 応答にかかった時間

これらの情報は、受信側（Node-RED等）で以下のような処理を行う際に有用：
- API経由のセッションのみLED点灯
- 特定のツール（Bash、Writeなど）使用時に通知
- 応答時間が長い場合にアラート

## 検討した情報

### 1. セッションの発信元（source）

**JSONLに記録されている情報**:
```json
{
  "userType": "external"  // 外部入力を示すが、API/CLIの区別はない
}
```

**問題点**:
- API経由も直接CLI実行も `userType: "external"`
- JSONLだけでは判別不可能

**解決策**:
- sender.js で管理している `managedProcesses` Map を活用
- このMapに存在するセッションID = API経由
- 存在しないセッションID = CLI直接実行

### 2. 使用ツール（tools）

**JSONLに記録されている情報**:
```json
{
  "message": {
    "content": [
      {"type": "text", "text": "..."},
      {"type": "tool_use", "name": "Bash", "input": {...}},
      {"type": "tool_use", "name": "Read", "input": {...}}
    ]
  }
}
```

**抽出方法**:
- `content` 配列から `type: "tool_use"` を抽出
- `name` フィールドを収集してツール名配列を作成

### 3. 応答時間（responseTime）

**JSONLに記録されている情報**:
```json
{
  "timestamp": "2026-03-01T04:20:15.123Z"
}
```

**計算方法**:
- 前のメッセージの timestamp と現在の timestamp を比較
- 差分を秒単位で計算（小数点2桁）

**注意点**:
- 最初のメッセージは前のタイムスタンプがないため `null`
- 再起動後の最初のメッセージも `null`

## 解決策

### 実装ステップ

#### 1. sender.js で managedProcesses を公開

**実装場所**: `src/sender.js:320-327`

```javascript
module.exports = {
  startNewSession,
  sendToSession,
  getManagedProcesses,
  getManagedProcess,
  processEvents,
  managedProcesses  // セッション判定用に公開
};
```

#### 2. parser.js にツール抽出を追加

**実装場所**: `src/parser.js:28, 46-52`

```javascript
const event = {
  parentUuid: data.parentUuid || null,
  sessionId: data.sessionId || null,
  uuid: data.uuid || null,
  timestamp: data.timestamp || null,
  message: {},
  tools: []  // 使用ツール一覧
};

// message フィールドの抽出
if (data.message) {
  // ... 既存処理 ...

  // content から tool_use を抽出してツール名を収集
  if (Array.isArray(data.message.content)) {
    const toolNames = data.message.content
      .filter(item => item.type === 'tool_use')
      .map(item => item.name);
    event.tools = toolNames;
  }
}
```

#### 3. subscribers.js にペイロード拡張を実装

**実装場所**: `src/subscribers.js:11, 32, 37, 99, 119-140`

```javascript
// managedProcesses をインポート
const { managedProcesses } = require('./sender');

// セッションごとの最終タイムスタンプ（応答時間計算用）
const sessionTimestamps = new Map();

// handleSubscriberEvent に sessionTimestamps を渡す
watcher.on('message', (event) => {
  for (const subscriber of subscribers) {
    handleSubscriberEvent(subscriber, event, sessionStates, sessionTimestamps);
  }
});

// summary レベルの処理を拡張
case 'summary':
  if (event.message && event.message.role === 'assistant') {
    // 応答時間を計算
    let responseTime = null;
    const lastTimestamp = sessionTimestamps.get(event.sessionId);
    if (lastTimestamp && event.timestamp) {
      const diff = new Date(event.timestamp) - new Date(lastTimestamp);
      responseTime = parseFloat((diff / 1000).toFixed(2)); // 秒単位（数値型）
    }
    sessionTimestamps.set(event.sessionId, event.timestamp);

    // source を判定（API経由かどうか）
    const source = managedProcesses.has(event.sessionId) ? 'api' : 'cli';

    const payload = {
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      status: 'completed',
      source: source,           // ← 追加
      tools: event.tools || [], // ← 追加
      responseTime: responseTime, // ← 追加
      lastMessage: event.message
    };
    postToSubscriber(url, payload, authorization, label);
  }
  break;
```

## 新しいペイロード構造

### API経由のセッション

```json
{
  "sessionId": "c17be9a0-812a-4679-8c37-ea4a7988b53f",
  "timestamp": "2026-03-01T04:20:15.123Z",
  "status": "completed",
  "source": "api",
  "tools": ["Bash", "Read"],
  "responseTime": 5.23,
  "lastMessage": {
    "role": "assistant",
    "content": [...],
    "usage": {...}
  }
}
```

### CLI直接実行のセッション

```json
{
  "sessionId": "c8fa4d17-cfaf-4283-a7ee-bcb68a17ec09",
  "timestamp": "2026-03-01T04:20:15.123Z",
  "status": "completed",
  "source": "cli",
  "tools": [],
  "responseTime": 3.45,
  "lastMessage": {
    "role": "assistant",
    "content": [...],
    "usage": {...}
  }
}
```

### 最初のメッセージ（responseTime が null）

```json
{
  "sessionId": "xxx",
  "timestamp": "2026-03-01T04:20:15.123Z",
  "status": "completed",
  "source": "cli",
  "tools": ["Bash"],
  "responseTime": null,
  "lastMessage": {...}
}
```

## テスト結果

### Node-RED での検証

**環境**:
- 本体: `http://localhost:3100` (claude-code-pipe)
- テスター: `http://localhost:1880` (claude-code-pipe-tester-node-red)
- エンドポイント: `POST /ccpipe/webhook`

**config.json**:
```json
{
  "subscribers": [
    {
      "url": "http://localhost:1880/ccpipe/webhook",
      "label": "tester-node-red",
      "level": "summary"
    }
  ]
}
```

**受信したペイロード例**:
```json
{
  "sessionId": "c8fa4d17-cfaf-4283-a7ee-bcb68a17ec09",
  "timestamp": "2026-03-01T04:24:32.456Z",
  "status": "completed",
  "source": "cli",
  "tools": ["Bash", "Read"],
  "responseTime": 6.45,
  "lastMessage": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "完了しました！"}
    ],
    "usage": {
      "input_tokens": 5,
      "output_tokens": 1,
      "cache_creation_input_tokens": 375,
      "cache_read_input_tokens": 81233
    }
  }
}
```

**検証項目**:
- ✅ `source` が正しく判定される（cli/api）
- ✅ `tools` 配列にツール名が含まれる
- ✅ `responseTime` が数値型で計算される
- ✅ 最初のメッセージでは `responseTime: null`

## 学び

### 1. managedProcesses の活用

- sender.js で管理しているセッションIDのMapを公開することで、API経由かCLI直接実行かを簡単に判定できる
- グローバルな状態管理は避けるべきだが、この用途では適切
- セッションが終了してもMapから削除されないため、メモリリークに注意（将来的にクリーンアップ機構が必要かも）

### 2. JSONLのパース拡張

- `content` 配列から特定の `type` を抽出する汎用的なパターン
- `filter` + `map` の組み合わせで簡潔に記述できる
- 将来的に他の情報（tool_resultなど）も抽出しやすい

### 3. 応答時間の計算

- セッションごとに最終タイムスタンプを保持する必要がある
- `sessionTimestamps` Map で管理
- 再起動時にリセットされるため、最初のメッセージは必ず `null`
- 数値型にするには `parseFloat()` が必要（`toFixed()` は文字列を返す）

### 4. 関数の引数管理

- `handleSubscriberEvent` に `sessionTimestamps` を渡す必要があった
- 最初の実装でエラーが発生（`sessionTimestamps is not defined`）
- クロージャーを使う方法もあるが、明示的に引数で渡す方が分かりやすい

## 今後の拡張案

### 優先度: 中

1. **tool_result の情報も含める**
   - ツールの実行結果（成功/失敗）
   - エラーメッセージ

2. **メモリ管理の改善**
   - `sessionTimestamps` のクリーンアップ
   - 古いセッションの自動削除（例: 24時間以上前）

3. **統計情報の追加**
   - トータルトークン数
   - キャッシュヒット率
   - ツール使用回数

### 優先度: 低

1. **カスタムフィールドの追加**
   - config.json で追加するフィールドを設定可能に
   - 特定のセッションにタグ付け

2. **バッチ配信**
   - 複数のイベントをまとめて送信
   - Webhook受信側の負荷軽減

## 関連ドキュメント

- [Webhook配信エラーハンドリング](./2026-02-28-04-00-00-webhook-delivery-error-handling.md)
- [追加セッションイベントシステム](./2026-02-28-04-05-00-additional-session-events.md)
- [リポジトリ分離テスト戦略](./2026-02-28-09-45-00-repository-separation-testing-strategy.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
