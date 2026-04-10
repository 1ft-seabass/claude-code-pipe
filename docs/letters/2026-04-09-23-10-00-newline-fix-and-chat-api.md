---
tags: [session-handoff, bugfix, newline, watcher, chat-api]
---

# 申し送り（2026-04-09-23-10-00-newline-fix-and-chat-api）

> **⚠️ 機密情報保護ルール**
>
> この申し送りに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない
> - コミット前に git diff で内容を確認
> - プッシュはせずコミットのみ(人間がレビュー後にプッシュ)

---

## 現在の状況（タスク別）

### ✅ 完了: 改行によるセッション分離バグの修正

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**問題**: 改行（`\n`、`\n\n`）を含むメッセージを pipe 経由で送信すると、シェルが改行をコマンド区切りとして解釈し、セッションが分離する。さらに改行位置以降の CLI 引数（`--allowedTools`、`--model` 等）も消失するため、ツール制御やモデル指定が効かない不具合も引き起こしていた。

**修正内容**:
- `src/sender.js`（2箇所）: 改行を含む引数をダブルクォートで囲むようクォート判定を拡張
- 改行自体のエスケープは不要（ダブルクォート内では文字列の一部として安全）

**検証コマンド**:
```bash
# サーバー起動後、改行入りメッセージでセッション分離が起きないことを確認
curl -s -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt":"テスト\n\n観点として\n・項目1\n・項目2","projectPath":"/home/node/workspace"}'
# → sessionId が返り、/managed に余計なプロセスが出ないこと
```

### ✅ 完了: 初手ユーザーメッセージ webhook 検知漏れの修正

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**問題**: 新規セッション作成時、watcher の `add` イベントが `recordCurrentPosition()` で現在のファイルサイズを記録するだけで中身を読まないため、最初のユーザーメッセージが webhook に配信されない。

**修正内容**:
- `src/watcher.js`: `add` イベントで既存ファイル（`start()` で記録済み）と新規ファイルを区別し、新規ファイルは位置0から `processNewLines()` で読む

### ✅ 完了: チャットメッセージ専用エンドポイントの追加

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**追加エンドポイント**:
- `GET /sessions/:id/messages/chat/user/first`
- `GET /sessions/:id/messages/chat/user/latest`
- `GET /sessions/:id/messages/chat/assistant/first`
- `GET /sessions/:id/messages/chat/assistant/latest`

**背景**: 既存の `user/first` 等は `role` のみでフィルタしており、`tool_result`（user role）や `tool_use`（assistant role）が混ざる。chat 版は content type を見て純粋な会話メッセージのみを返す。

**チャット判定ロジック**:
- ユーザーチャット: `role === 'user'` かつ content に `tool_result` を含まない
- アシスタントチャット: `role === 'assistant'` かつ content に `text` があり `tool_use` を含まない

**検証コマンド**:
```bash
# 既存版（tool_result が返りうる）
curl "http://localhost:3100/sessions/SESSION_ID/messages/user/latest"

# chat版（純粋なユーザー発言のみ）
curl "http://localhost:3100/sessions/SESSION_ID/messages/chat/user/latest"
```

---

## 次にやること

### 優先度1: DETAILS.md / DETAILS-ja.md に chat エンドポイントのドキュメント追加

新規4エンドポイントの API ドキュメントを追加する。

### 優先度2: リリース作業（バージョン検討）

今回の修正は fix + feat なので、v0.7.4 としてリリースするか検討。
- CHANGELOG.md / CHANGELOG-ja.md に追加
- package.json のバージョン更新
- `docs/actions/sync_to_main.md` に従って main ブランチへ反映

### 優先度3: `GET /sessions` 一覧のチャットフィルタ検討

`getSessionMetadata` の `firstUserMessage` / `lastUserMessage` も role ベースのため、ツール結果が混ざりうる。chat フィルタを一覧にも適用するか検討。

### 長期持ち越し

- npx 駆動の相談
- `/managed` と `/processes` の重複エンドポイント統合（低優先度）

---

## 注意事項

### ⚠️ 改行バグの影響範囲

セッション分離だけでなく、以下の「効いたり効かなかったり」する不具合の原因でもあった：
- 許可ツール・禁止ツールが効かない
- モデル指定が抜ける
- 申し送りの長文プロンプトの下部ルールが無視される

改行位置次第でどの引数まで生き残るかが変わっていたため、再現が不安定だった。

### ⚠️ Git コミットルール

- AI 署名なし
- プッシュせず、コミットのみ
- プレフィックス: `feat:`, `fix:`, `docs:`, `chore:`
- 言語: 日本語

---

## 技術的な文脈

### プロジェクト起動方法

```bash
# 起動
npm start または npm run dev:tmux:start

# 再起動
npm run dev:tmux:restart

# 停止
npm run dev:tmux:stop

# ステータス確認
npm run dev:tmux:status
curl http://localhost:3100/health
```

### テスト手法

正式なテストフレームワークは未導入。以下の手動テストで確認：
```bash
# サーバー起動（tmux）
tmux new-session -d -s pipe "node src/index.js"

# 改行入りメッセージの送信テスト
curl -s -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt":"テスト\n\n改行入り","projectPath":"/home/node/workspace"}'

# 管理プロセス確認
curl http://localhost:3100/managed

# chat エンドポイント確認
curl "http://localhost:3100/sessions/SESSION_ID/messages/chat/user/latest"
```

### 重要ファイル

- `src/sender.js`: Claude CLI プロセス管理・コマンド構築（改行クォート修正箇所）
- `src/watcher.js`: JSONL ファイル監視（初手メッセージ検知修正箇所）
- `src/api.js`: REST API ルート定義（chat エンドポイント追加箇所）
- `src/parser.js`: JSONL パーサー

### 現在のバージョン

- v0.7.3（次回 v0.7.4 へバージョンアップ検討）

---

## セッション文脈サマリー

### 核心的な設計決定

**決定事項1**: 改行はエスケープではなくクォートで対処する
- **理由**: シェルのダブルクォート内では改行は文字列の一部。エスケープすると Claude CLI にリテラル `\n` が渡され、JSONL や viewer で改行が文字列として表示されてしまう

**決定事項2**: chat フィルタは pipe 側にエンドポイントとして実装する
- **理由**: viewer で content type を見てフィルタするのが本筋だが、最初/最後のチャットメッセージ取得は頻出パターンなのでショートカットとして提供
- **補足**: pipe 側は「生データを正確に返す」が基本。chat エンドポイントは便利機能

**決定事項3**: `GET /sessions` 一覧のフィルタは今回は変更しない
- **理由**: 一覧の messageCount 等は全体の規模感として role ベースで十分。chat フィルタは個別エンドポイントから

### 議論の流れ

1. **改行バグの報告**: ユーザーが再現パターンを詳細に特定（空行・数字単体行）
2. **原因特定**: sender.js のクォート処理で改行をチェックしていない
3. **修正 → テスト**: クォート追加 → セッション分離解消を確認
4. **エスケープ問題**: 最初 `\n` をリテラルにエスケープ → viewer で改行が壊れる → エスケープ不要と判明
5. **watcher バグ発見**: テスト中に初手メッセージが webhook に飛ばない問題を発見・修正
6. **chat エンドポイント**: メッセージ API の role フィルタ問題を議論 → chat 版を実装
7. **影響範囲の分析**: 改行バグがツール制御・モデル指定・申し送りルール欠落にも影響していたことを確認

### 次のセッションに引き継ぐべき「空気感」

- **このプロジェクトの優先順位**: CLI 透過性 > 独自機能
- **重視している価値観**: 公式 CLI ドキュメントとの整合性、後方互換性の維持
- **現在の開発フェーズ**: バグ修正と API 拡充（v0.7.4 リリース準備）
- **避けるべきアンチパターン**: sed での JavaScript 編集、改行のリテラルエスケープ

---

## 関連ドキュメント

- [改行セッション分離バグ 調査・修正ノート](../notes/2026-04-09-23-00-00-newline-session-separation-fix.md)
- [前回の申し送り](./2026-04-07-23-10-00-message-api-projectpath-implementation.md)

---

**作成日時**: 2026-04-09 23:10:00
**作成者**: Claude Code (AI)
