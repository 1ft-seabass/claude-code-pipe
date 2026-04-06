# 変更履歴

このプロジェクトの主要な変更はすべてこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に基づいており、
このプロジェクトは [セマンティック バージョニング](https://semver.org/lang/ja/spec/v2.0.0.html) に準拠しています。

## [0.7.2] - 2026-04-06

### 追加
- **CLI オプションパススルー**: Send API が追加の Claude Code CLI オプションをサポート
  - `disallowedTools`: 禁止するツールの配列（例: `["Edit", "Write", "Bash(rm *)"]`）
  - `model`: モデル選択（例: `"sonnet"`, `"opus"`）
- **プロセス管理 API**:
  - `GET /processes`: 管理中の全プロセスを一覧表示
  - `DELETE /processes/:sessionId`: セッション ID で特定のプロセスを終了
  - `DELETE /processes`: 管理中の全プロセスを終了
- **Claude バージョン API**: `GET /claude-version` で Claude Code CLI のバージョンを取得

### ドキュメント
- DETAILS.md と DETAILS-ja.md に新しい API エンドポイントを追加
- Send API ドキュメントに `disallowedTools` と `model` パラメータを追加

## [0.7.1] - 2026-04-05

### 修正
- **API セッション呼び出し**: api.js の `startNewSession()` と `sendToSession()` が正しい options オブジェクト形式を使用するよう修正
  - シグネチャの不一致により、セッションが間違った作業ディレクトリで起動していた問題を修正
- **cancel-initiated イベント**: プロジェクト識別のための `projectPath` フィールドを追加
- **managedProcesses**: canceller で使用するために `projectPath` を保存するよう修正

## [0.7.0] - 2026-04-04

### 追加
- **User メッセージ Webhook**: ユーザープロンプトを追跡する `user-message-received` イベントを追加
- **Health エンドポイント**: `GET /health` でステータス、バージョン、稼働時間を返却
- **Webhook ペイロードにバージョン**: すべての Webhook イベントに `version` フィールドを追加
- **セッションイベントにプロジェクト情報**: `session-started` と `process-exit` に `projectPath` と `projectName` を追加

### 変更
- **sender.js の options 形式**: `startNewSession()` と `sendToSession()` が options オブジェクトパラメータを使用するよう変更
- **起動ログ**: バージョンを表示するよう変更（例: `claude-code-pipe v0.7.0 listening on port 3100`）

## [0.6.0] - 2026-03-25

### 破壊的変更
- **パラメータ名の変更**: Send API の `cwd` → `projectPath`
  - `cwd` は非推奨ですが、後方互換性のため引き続きサポートされます
  - 両方が指定された場合、`projectPath` が優先されます
  - **`cwd` と `projectPath` の両方が必須になりました** - どちらも指定されていない場合は 400 エラーを返します

### 追加
- Send API に `projectPath` パラメータを追加（`POST /sessions/new`, `POST /sessions/:id/send`）
- `config.example.json` に `callbackUrl` の具体例を追加（`"http://localhost:3100"`）

### 変更
- `cwd`/`projectPath` のデフォルト値を削除 - 明示的な指定が必須になりました
- DETAILS-ja.md と DETAILS.md の `callbackUrl` ドキュメントを強化し、使用例を追加

### ドキュメント
- callbackUrl 設定例セクションを追加
- projectPath パラメータのドキュメントを追加
- 双方向通信の例を追加（Node-RED ↔ claude-code-pipe）

## [0.5.0] - 2026-03-17

### 追加
- バージョン API エンドポイント（`GET /version`）
  - package.json からパッケージ名、バージョン、説明を返します
  - ヘルスチェックやバージョン確認に有用です

## [0.4.0 以前] - 初期開発フェーズ

### コア機能
- **Watch Mode**: Claude Code セッションファイルの監視と構造化データ抽出
- **Send Mode**: REST API 経由で Claude Code にプロンプト送信
- **Cancel Mode**: 実行中セッションのキャンセル
- **Webhook Distribution**: 外部サービスへのセッションイベント配信

### API
- セッション/メッセージ取得（`GET /sessions`, `/messages`）
- セッション作成/送信（`POST /sessions/new`, `/:id/send`）
- キャンセル（`POST /sessions/:id/cancel`）
- プロジェクト/プロセス管理（`GET /projects`, `/managed`）
- WebSocket（`WS /ws`）

### 設定
- Bearer Token 認証
- Webhook レベル設定（basic/full）
- ツール制限とキャンセルタイムアウト

---

[0.7.2]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.2
[0.7.1]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.1
[0.7.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.0
[0.6.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.6.0
[0.5.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.5.0
