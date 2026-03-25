# 変更履歴

このプロジェクトの主要な変更はすべてこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に基づいており、
このプロジェクトは [セマンティック バージョニング](https://semver.org/lang/ja/spec/v2.0.0.html) に準拠しています。

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

[0.6.0]: https://github.com/yourusername/claude-code-pipe/releases/tag/v0.6.0
[0.5.0]: https://github.com/yourusername/claude-code-pipe/releases/tag/v0.5.0
