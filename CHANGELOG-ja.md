# 変更履歴

このプロジェクトの主要な変更はすべてこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に基づいており、
このプロジェクトは [セマンティック バージョニング](https://semver.org/lang/ja/spec/v2.0.0.html) に準拠しています。

## [0.8.8] - 2026-09-09

### 追加
- **`POST /attachments`のデフォルト`allowedExtensions`に`.docx`, `.xlsx`, `.csv`を追加**: `config.json`で`config.upload.allowedExtensions`を設定していない場合に使われる組み込みフォールバック値が、既存の`.jpg`, `.jpeg`, `.png`, `.pdf`, `.txt`, `.md`に加えてオフィス文書形式もカバーするようになった。`config.upload.allowedExtensions`を明示指定した場合はこのデフォルトを完全に上書きする(マージではない)点は変わらず

## [0.8.7] - 2026-09-07

### 追加
- **`POST /projects/file`が画像に対応**: `config.viewer.imageExtensions`（デフォルト`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.ico`, `.svg`）の拡張子はブロックされなくなり、base64エンコード＋`mimeType`付きで返す。viewer側は`` `data:${mimeType};base64,${content}` ``でそのまま表示可能な画像を組み立てられる。テキストのレスポンスには`encoding: "utf8"`フィールドが追加される（既存フィールドは無変更）。画像サイズ上限は`config.viewer.maxImageFileSize`で別途設定（デフォルト5MB）
- **`GET /sessions/:id/messages`に`textOnly`・`limit`クエリパラメータを追加**: `?textOnly=true`で`tool_use`/`tool_result`コンテンツブロックと`isMeta`イベントを除いた`{ role, timestamp, text }`の配列に整形（本文が空になるターンは丸ごと除外）。`?limit=N`で（整形後の）配列の末尾N件に絞れる。「引き継ぎ用に直近数十ターンだけ」のような用途向け。どちらのパラメータも未指定時のデフォルト挙動は変更なし

## [0.8.6] - 2026-09-06

### 追加
- **`POST /projects/file`**: プロジェクト内の単一テキストファイルの内容を返すAPIを追加。pipe-viewerのようなビューワーUIが、ノートやドキュメント・ソースをリンク先で開かずその場で表示できるようにするためのものです
  - リクエストボディ: `{ projectPath, filePath }`（`filePath`は`projectPath`からの相対パス。`/git/status` `/git/log`と同じく呼び出し元を信頼するモデル）
  - レスポンス: `{ content, mtime, size }`
  - `projectPath`外へのパストラバーサル・symlink経由の脱出は拒否（`400`）
  - パスのいずれかのセグメントが`.`始まり（`.env`, `.git/`, `.ssh/`等）の隠しファイル・ディレクトリは常にブロック（gitの状態に関係なく）
  - プロジェクトがgitリポジトリの場合、`.gitignore`対象のファイルもブロック（ベストエフォート。`projectPath`がgitリポジトリでない場合はスキップ）
  - バイナリ・非テキスト拡張子は`config.viewer.deniedExtensions`でブロック（画像・アーカイブ・実行ファイル・フォント・メディア等、設定変更可能。デフォルトで一般的なバイナリ形式をカバー）
  - ファイルサイズは`config.viewer.maxFileSize`で上限を設定（デフォルト1MB、超過時は`413`）

## [0.8.5] - 2026-08-11

### 修正
- **プロセス起動前に `projectPath` の存在確認をするよう修正**: `/sessions/new` / `/sessions/:id/send` が、指定された作業ディレクトリがディスク上に実在するか（`fs.existsSync`）を事前にチェックし、存在しない場合は `spawn()` に到達して分かりにくい `ENOENT` を出す前に即座に `400 projectPath does not exist` を返すようになりました。これにより、壊れた `projectPath`（例: 旧 `extractProjectPath` のエンコードバグ由来）が `session-error` イベントで同じ壊れたパスをクライアントに送り返し、クライアント側がそれを保存して以降のリクエストで再送し続けるという自己増幅ループも防止されます

## [0.8.4] - 2026-07-08

### 追加
- **Windows ネイティブの Send Mode 対応**: `POST /sessions/new` / `POST /sessions/:id/send` が WSL だけでなく Windows（ネイティブ）でも動作するようになりました（従来は `501 Not Implemented`）。プロセス起動は `spawnClaudeProcess()` に抽象化され、`claude` プロセスの起動方法のみが分岐します（Windows は配列渡し `spawn()`、Unix は既存の `script`/PTY ラッパーのまま変更なし）

### 修正
- **`extractProjectPath()` が Windows 形式のエンコード済みパスを認識できない不具合**: ドライブレターで始まるディレクトリ名（例: `C--Users-...`）が未対応と判定され `null` を返してしまい、Windows で `projectPath` が webhook ペイロードから欠落したり `GET /projects` / `GET /sessions` から消えたりする不具合を修正
- **pre-commit の secretlint 握りつぶしを修正**: `simple-git-hooks` が `|| true` で `secretlint`/`gitleaks` の失敗を握りつぶしていた問題を修正。失敗時に実際にコミットをブロックするようになりました
- **pre-commit の secretlint が .gitignore 対象ファイルに誤爆する問題を修正**: スキャン対象を全ファイルからステージ済みファイルのみに変更。`logs/server.log` 等が無関係なコミットのたびに警告を出す問題を解消
- **生のセッション内容を server.log に記録しないよう修正**: `watcher` の `message` イベント（実行コマンド全文を含みうる）を `server.log` に記録しないようにしました

### セキュリティ
- webhook ペイロードにはフィルタリング・マスキングなしで生のセッション内容（コマンド全文含む）が含まれるため、`subscribers[].url` は信頼できるネットワーク内のエンドポイントのみを指定すべき旨を DETAILS.md に明記

## [0.8.3] - 2026-06-21

### 追加
- **Webhook ペイロード強化**: すべてのサブスクライバーペイロードに以下を追加:
  - `os`: サーバー OS 種別（`"mac"` / `"linux"` / `"windows"`; WSL は `"linux"` として返す）
  - `isSubagent`: `/subagents/` パス由来のイベントなら `true`
  - `isMeta`: Claude Code ハーネスが自動注入したメッセージ（system-reminder 等）なら `true`
  - `communicationMode`: 現在のモード（`"bidirectional"` / `"webhook-only"` / `"watch-only"`）— viewer が `GET /info` をポーリングしなくても常に pipe の状態を把握できる
  - `mqttCommandTopic`: MQTT が設定されている場合のコマンドトピック名（broker 認証情報は含まない）
- **`GET /info` エンドポイント新設**: pipe の現在の設定状態を返す — `version`, `os`, `communicationMode`, `callbackUrl`, `subscriberCount`, `projectTitle`, `watchDir`

### 変更
- **常時全配信**: `level` / `includeMessage` によるフィルタリングを廃止。すべてのイベント・全メッセージ内容を常時配信するようになりました
  - 既存の config に `level` / `includeMessage` が残っていても動作します（フィールドは無視される）
  - フィルタリングは viewer 側の責務へ移行。`isMeta` ノイズの非表示や subagent 起動の観測など、リッチなクライアントロジックが可能に
- **内部リネーム**: `postToSubscriber` → `deliverToSubscriber`（動作変更なし; 将来の MQTT ディスパッチ追加に向けた準備）

### 削除
- `level` / `includeMessage` サブスクライバー設定オプション（廃止; 設定に残っていても無視）

## [0.8.2] - 2026-06-04

### 修正
- **ハイフン入りパスのプロジェクトパス復元**: `extractProjectPath` が JSONL ファイルの `cwd` フィールドを直接読み取るよう変更し、ユーザー名やディレクトリ名にハイフンを含む環境でも正しくパスを復元できるようになりました
  - 従来のフォールバックは全ハイフンをスラッシュに変換するため（例: `seigo-tanaka` → `seigo/tanaka`）、`existsSync` でパスを検証できない環境（Docker 外で動作するサーバーなど）で `ENOENT` エラーが発生していました
  - JSONL の先頭 2KB を読み取り `cwd` フィールドを取得します。Claude Code がセッション開始時に確実に書き込む値を利用するため曖昧さがありません
  - JSONL が読み取れない場合や `cwd` フィールドがない場合は既存の `existsSync` ベースの候補パス検証にフォールバックします

## [0.7.5] - 2026-04-16

### 追加
- **Send API レスポンスへの init イベント情報追加**: `POST /sessions/new` と `POST /sessions/:id/send` が Claude Code の init イベント情報を返すようになりました
  - `model`: 実際に使用されたモデル（例: `"claude-sonnet-4-6"`, `"claude-opus-4-6[1m]"`）— 指定したモデルが実際に適用されたか観測できます
  - `cwd`: Claude Code が認識した作業ディレクトリ
  - `permissionMode`: 権限モード（例: `"default"`）
  - `claudeCodeVersion`: Claude Code CLI バージョン
  - `apiKeySource`: API キーのソース
  - `tools`: 利用可能なツール一覧（`allowedTools`/`disallowedTools` のフィルタリング結果を反映）
- **`session-started` webhook へのモデル情報追加**: `session-started` webhook ペイロードに `model` フィールドを追加

### 修正
- **送信タイムアウト**: `POST /sessions/:id/send` に 60 秒タイムアウトを追加（`POST /sessions/new` と同様）。Claude Code プロセスが init イベントを送出しない場合に無限待ちになる問題を解消

## [0.7.4] - 2026-04-10

### 修正
- **改行によるセッション分離バグ**: 改行（`\n`）を含むメッセージを送信するとシェルがコマンド区切りとして解釈し、セッションが分離する問題を修正。さらに改行位置以降の CLI 引数（`--allowedTools`、`--model` 等）が消失する問題も解消
  - `src/sender.js` のクォート処理で改行を含む引数をダブルクォートで囲むよう修正
- **初手ユーザーメッセージの webhook 検知漏れ**: watcher の `add` イベントがファイル位置を記録するだけで内容を読まなかったため、最初のユーザーメッセージが webhook に配信されない問題を修正

### 追加
- **チャットメッセージ専用エンドポイント**: ツール操作を除外し、純粋な会話メッセージのみを返す新エンドポイント
  - `GET /sessions/:id/messages/chat/user/first`
  - `GET /sessions/:id/messages/chat/user/latest`
  - `GET /sessions/:id/messages/chat/assistant/first`
  - `GET /sessions/:id/messages/chat/assistant/latest`

### ドキュメント
- DETAILS.md と DETAILS-ja.md にチャットメッセージエンドポイントのドキュメントを追加

## [0.7.3] - 2026-04-07

### 追加
- **projectPath によるメッセージ取得**: すべてのメッセージ取得エンドポイントが `projectPath` クエリパラメータをサポート
  - `GET /sessions/:id/messages?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/user/first?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/user/latest?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/assistant/first?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/assistant/latest?projectPath=/path/to/project`
  - 複数のプロジェクトで同じセッション ID が存在する場合の曖昧さを解消
  - 後方互換性を維持（projectPath パラメータなしでも動作）

### ドキュメント
- DETAILS.md と DETAILS-ja.md に projectPath クエリパラメータのドキュメントを更新

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

[0.7.4]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.4
[0.7.3]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.3
[0.7.2]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.2
[0.7.1]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.1
[0.7.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.0
[0.6.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.6.0
[0.5.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.5.0
