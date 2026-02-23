---
tags: [nodejs, express, websocket, jsonl, claude-code]
---

# claude-code-pipe 初期実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: claude-code-pipe プロジェクト初期セットアップ

## プロジェクト概要

Claude Code の `claude -p` と JSONL を使って、入出力を外に流す配管を作成。配管は流すだけで、判断しない。

### 技術スタック
- **言語**: Node.js (CommonJS)
- **Web フレームワーク**: Express
- **WebSocket**: ws（Express と同一ポート相乗り）
- **ファイル監視**: chokidar
- **ライセンス**: MIT

### npm パッケージ情報
- **パッケージ名**: claude-code-pipe
- **カジュアル略称**: cc-pipe
- **バージョン**: 1.0.0

## 実装内容

### Phase 1: Watch（しっかり実装）

#### 1. parser.js - JSONL パーサー
**実装場所**: `src/parser.js`

**機能**:
- JSONL の各行を `JSON.parse`
- パース失敗時はログ出力してスキップ（エラーにしない）
- 既知フィールドのみ抽出:
  - `parentUuid`
  - `sessionId`
  - `uuid`
  - `timestamp`
  - `message.role` (user / assistant)
  - `message.content`
  - `message.usage` (input_tokens, output_tokens, cache_*_tokens)

**主なポイント**:
- 未知のフィールドは無視（将来の拡張に対応）
- 空行はスキップ
- エラーハンドリングで堅牢性を確保

#### 2. watcher.js - JSONL 監視
**実装場所**: `src/watcher.js`

**機能**:
- chokidar で `~/.claude/projects` 配下の `*.jsonl` を再帰監視
- 新しい行が追加されたら `parseLine` でパースして `message` イベントを emit
- sessionId はディレクトリパスから推定（`sessions/<session-id>/` 構造）
- EventEmitter を継承

**主なポイント**:
- 起動時に既存ファイルの末尾位置を記録（過去ログは読まない）
- 追記部分のみを読み取って処理
- awaitWriteFinish オプションで書き込み完了を待機
- ファイル位置を Map で管理

#### 3. api.js - REST API ルート
**実装場所**: `src/api.js`

**エンドポイント**:
- `GET /sessions` - セッション一覧（id, lastModified）
- `GET /sessions/:id` - 指定セッションの全履歴
- `GET /sessions/:id/latest` - 最新の assistant メッセージ

**主なポイント**:
- sessions ディレクトリを再帰的に探索
- パース失敗行はスキップして処理を継続
- 404 エラーハンドリング実装

#### 4. websocket.js - WebSocket サーバー
**実装場所**: `src/websocket.js`

**機能**:
- パス `/ws` で WebSocketServer を起動
- Express の HTTP サーバーに相乗り
- watcher の `message` イベントを全接続クライアントに JSON で配信
- 接続時に `{ type: "connected" }` を送信

**主なポイント**:
- **ローカル Web UI 専用**（外部配信は subscribers が担当）
- クライアント管理に Set を使用
- WebSocket エラー時のクライアント削除

### Phase 2: Send（プロトタイプ）

#### sender.js - claude -p の spawn 管理
**実装場所**: `src/sender.js`

**機能**:
- `managedProcesses` を Map で管理（key: sessionId, value: { proc, pid, startedAt }）
- 新規セッション開始: `claude -p <prompt> --output-format stream-json`
- 既存セッション再開: `claude -p <prompt> --resume <sessionId> --output-format stream-json`
- stdout/stderr をコールバックでリアルタイム配信
- プロセス終了時に Map から自動削除

**主なポイント**:
- spawn の stdout を WebSocket にリアルタイム配信可能
- defaultAllowedTools を `--allowed-tools` オプションとして渡す
- プロンプトは素のテキストをそのまま渡す（`@` `/` `!` は解釈しない）

### Phase 3: Cancel（プロトタイプ）

#### canceller.js - プロセスの kill 管理
**実装場所**: `src/canceller.js`

**機能**:
- managedProcesses から PID を取得して kill
- まず SIGINT を送信
- `cancelTimeoutMs`（デフォルト3000ms）後にまだ生きていれば SIGTERM

**主なポイント**:
- グレースフルシャットダウンを試みる（SIGINT → SIGTERM）
- 自分が spawn したプロセスのみ停止可能
- セッション未発見時は null を返す

### Phase 4: subscribers 配信（プロトタイプ）

#### subscribers.js - HTTP POST 配信
**実装場所**: `src/subscribers.js`

**機能**:
config.subscribers の配列を読み、レベルに応じて HTTP POST で配信

**配信レベル**:

| レベル | タイミング | 送信内容 |
|--------|-----------|---------|
| `status` | 応答完了時に1回 | `{ sessionId, timestamp, status: "completed" }` |
| `summary` | 応答完了時に1回 | `{ sessionId, timestamp, status, lastMessage }` |
| `stream` | メッセージごと（頻繁） | watcher のイベントをそのまま |
| `stream-status` | 状態変化ごと | `{ sessionId, timestamp, status, lastMessage }` |

**主なポイント**:
- **全レベル HTTP POST に統一**（WebSocket は `/ws` のみ）
- authorization ヘッダー対応
- 配信失敗時はログ出力（リトライなし、薄さ優先）
- stream-status はセッションごとの状態変化を検出

### エントリポイント

#### index.js - サーバー起動
**実装場所**: `src/index.js`

**機能**:
- Express + ws を同一ポートで起動
- 各モジュールを統合
- Graceful shutdown 対応（SIGINT/SIGTERM）

**統合されたエンドポイント**:

```
Watch:
  GET  /sessions              - セッション一覧
  GET  /sessions/:id          - セッション履歴
  GET  /sessions/:id/latest   - 最新の応答
  WS   /ws                    - リアルタイム配信（ローカル Web UI 専用）

Send:
  POST /sessions/new          - 新しいセッションを開始
  POST /sessions/:id/send     - 既存セッションに投げる

Cancel:
  POST /sessions/:id/cancel   - 自分が spawn したプロセスを止める

管理:
  GET  /managed               - spawn したプロセスの一覧と状態
```

## ディレクトリ構造

```
claude-code-pipe/
├── package.json              # npm パッケージ設定
├── config.json               # サーバー設定
├── README.md                 # プロジェクトドキュメント
├── src/
│   ├── index.js              # エントリポイント（Express + ws 起動）
│   ├── watcher.js            # JSONL 監視（chokidar）
│   ├── parser.js             # JSONL パーサー
│   ├── api.js                # REST API ルート定義
│   ├── websocket.js          # WebSocket 配信
│   ├── subscribers.js        # subscribers への HTTP POST / WS 配信
│   ├── sender.js             # Send: claude -p の spawn 管理
│   └── canceller.js          # Cancel: spawn したプロセスの kill
└── .gitignore                # Git 除外設定
```

## 設定ファイル（config.json）

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/claude-event",
      "label": "node-red",
      "level": "summary",
      "authorization": ""
    },
    {
      "url": "http://localhost:1880/claude-status",
      "label": "led-trigger",
      "level": "status"
    },
    {
      "url": "http://localhost:3200/claude-stream",
      "label": "dashboard",
      "level": "stream-status"
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "LS", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000
  }
}
```

## 起動確認

### 動作確認項目

1. **起動メッセージ確認**: ✅
   ```
   claude-code-pipe listening on port 3100
   ```

2. **依存関係インストール**: ✅
   ```bash
   npm install
   # added 83 packages, 0 vulnerabilities
   ```

3. **ウォッチャー起動**: ✅
   ```
   [watcher] Starting to watch: /home/node/.claude/projects
   [watcher] Watching started
   ```

4. **WebSocket セットアップ**: ✅
   ```
   [websocket] WebSocket server setup complete on /ws
   ```

5. **subscribers セットアップ**: ✅
   ```
   [subscribers] Setup complete for 3 subscriber(s)
   ```

### 確認済みエンドポイント

- `GET /sessions` - 空配列を返す（watchDir にセッションがない場合）
- `GET /managed` - 空配列を返す（spawn プロセスがない場合）

## 実装上の判断

### DELETE 系エンドポイントは作らない
- JSONL は Claude Code が書いているファイル
- 配管が消しに行かない設計
- 30日の自動削除は Claude Code 側の責務

### WebSocket は /ws のみ
- **ローカル Web UI 専用**
- 外部への配信は subscribers（HTTP POST）が担当
- 同一マシンの Chrome タブが localhost:3100/ws に接続する用途

### プロトタイプとしての実装範囲
- Phase 2-4 は動作するプロトタイプとして実装
- エラーハンドリングは最小限
- リトライ機能なし（薄さ優先）
- セッションID生成は仮実装（`session-${Date.now()}-${pid}`）

## 学び

1. **chokidar の awaitWriteFinish オプション**
   - ファイル書き込み完了を待つことで、不完全な読み取りを防ぐ
   - stabilityThreshold: 100ms で安定性を確保

2. **Express と ws の同一ポート相乗り**
   - http.createServer で Express を起動
   - WebSocketServer に server を渡すことで同一ポートで動作

3. **EventEmitter の活用**
   - watcher から websocket/subscribers へのイベント配信
   - 疎結合な設計でモジュール間の依存を最小化

4. **プロセス管理の基本**
   - SIGINT → SIGTERM のグレースフルシャットダウン
   - spawn の stdout/stderr をリアルタイムで取得

## 今後の改善案

1. **セッションID の正確な取得**
   - 現在はディレクトリパスから推定
   - claude コマンドの出力から正確なセッションIDを取得する仕組み

2. **エラーハンドリングの強化**
   - subscribers への配信失敗時のリトライ機構
   - プロセス異常終了時の通知機能

3. **テストの追加**
   - parser.js の単体テスト
   - API エンドポイントの統合テスト

4. **ログ機能の改善**
   - ログレベルの設定（debug/info/warn/error）
   - ログファイルへの出力オプション

5. **設定の検証**
   - config.json のバリデーション
   - subscribers の URL 形式チェック

6. **ドキュメントの拡充**
   - API 仕様書（OpenAPI/Swagger）
   - 使用例・サンプルコード

## 関連ドキュメント

- [README.md](../../README.md) - プロジェクト概要
- [config.json](../../config.json) - サーバー設定ファイル

---

**最終更新**: 2026-02-23
**作成者**: Claude Code (AI)
