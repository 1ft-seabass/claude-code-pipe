---
tags: [session-handoff, shell-escape, git-api, image-api, security]
---

# 申し送り（2026-05-24-04-15-00-shell-escape-fix-and-git-image-apis）

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

### ✅ 完了: sender.js のシェル引数エスケープ強化

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**完了内容**:
- ✅ `src/sender.js` の `startNewSession` / `sendToSession` 2箇所のクォート処理を修正
- ✅ 全引数を常にダブルクォートで囲む方式に変更
- ✅ ダブルクォート内でも展開される `` ` `` と `$` のエスケープを追加（置換順序: `\` → `"` → `` ` `` → `$`）
- ✅ 実セッション（`e031b267-1288-485b-9df4-6493c7c8fcb0`）で長文 Markdown（コードブロック・水平線・箇条書きを含む26メッセージ）を投げて検証
- ✅ 開発ノート作成（`docs/notes/2026-05-24-04-00-00-backtick-shell-escape-fix.md`）
- ✅ コミット完了（`bac0fc6 fix: sender.js のシェル引数エスケープでバッククォート・$ を escape`）

**判明したイレギュラー**: `- ` 始まりプロンプト（例: `- 1\n- 2\n- 3`）は Claude CLI 側で `error: unknown option` となる。今回は修正しない判断（エラーで弾かれるだけで汚染ゼロ、引数構築の根本変更が必要なため）。

**検証コマンド** (次のセッションのAIが実行):
```bash
# バッククォート含み長文の送信
curl -s -X POST http://localhost:3100/sessions/new \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"```mermaid\ngraph TD\n  A-->B\n```\n$HOME","projectPath":"/tmp"}'
# → sessionId が返ること（init イベント受信できていればOK）
```

### ✅ 完了: Git ステータス・ログ取得 API 追加

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**完了内容**:
- ✅ `src/git-info.js` に `getGitStatus(projectPath)` と `getGitLog(projectPath, limit)` を追加
- ✅ `src/api.js` に `GET /git/status` と `GET /git/log` エンドポイントを追加
- ✅ `/git/status` は既定でカウントのみ、`?files=true` でファイル一覧フル
- ✅ `/git/log` は各コミットに `unpushed` フラグ・`unpushedCount` を含む
- ✅ 副次バグ修正: `execGitCommand` の `.trim()` → `.trimEnd()`（複数行出力の先頭スペース欠落バグを発見）
- ✅ 開発ノート作成（`docs/notes/2026-05-24-04-05-00-git-status-log-api.md`）
- ✅ コミット完了（2つ）
  - `2516eee fix: git-info.js の execGitCommand で複数行出力の先頭スペースを保持`
  - `de37583 feat: Git ステータス・ログ取得 API（/git/status, /git/log）を追加`

**検証コマンド**:
```bash
# カウントのみ（デフォルト）
curl -s "http://localhost:3100/git/status?projectPath=/home/node/workspace/repos/claude-code-pipe-develop"
# → branch, ahead, behind, stagedCount, unstagedCount, untrackedCount, isClean

# ファイル一覧
curl -s "http://localhost:3100/git/status?projectPath=/home/node/workspace/repos/claude-code-pipe-develop&files=true"
# → staged[], unstaged[], untracked[] が含まれる

# ログ
curl -s "http://localhost:3100/git/log?projectPath=/home/node/workspace/repos/claude-code-pipe-develop&limit=5"
# → commits[] と unpushedCount
```

### ✅ 完了: 画像アップロード API 追加

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**完了内容**:
- ✅ `src/api.js` に `POST /images` エンドポイントを追加
- ✅ base64 JSON 方式（新規依存ゼロ、`crypto.randomUUID()` のみ）
- ✅ 拡張子ホワイトリスト: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.txt`, `.md`
- ✅ ファイル名サニタイズ（`path.basename()` + 危険文字を `_` に置換）
- ✅ 保存先: `/tmp/claude-code-pipe/<uuid>-<safeName>`（`.gitignore` 修正不要）
- ✅ 開発ノート作成（`docs/notes/2026-05-24-04-10-00-image-upload-api.md`）
- ✅ コミット完了（`9dbb7ba feat: 画像アップロード API（POST /images）を追加`）

**検証コマンド**:
```bash
# PNG 画像のアップロード
curl -s -X POST http://localhost:3100/images \
  -H 'Content-Type: application/json' \
  -d '{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","filename":"test.png"}'
# → {"path":"/tmp/claude-code-pipe/<uuid>-test.png","filename":"<uuid>-test.png"}

# 拡張子ブロック
curl -s -X POST http://localhost:3100/images \
  -H 'Content-Type: application/json' \
  -d '{"data":"aGVsbG8=","filename":"evil.exe"}'
# → 400 "File type not allowed"
```

### ⚠️ 未実施: main ブランチへの反映と develop プッシュ

**ステータス**: ⚠️ 未実施（v0.7.4 + v0.7.5 + 今回分）

**背景**: ユーザーから「main への sync もする予定」との明示があった。今回の develop コミット5本を含めて、`docs/actions/sync_to_main.md` に従って実施予定。

**次セッションでの作業手順**:
1. `docs/actions/sync_to_main.md` に従って main ブランチへ反映
2. develop ブランチをプッシュ
3. 別セッションで厳正なセキュリティチェックを実施

**注意**: 今回 `package.json` のバージョンは更新していない（修正＋追加のみ）。リリース版番号を上げる場合はユーザーと相談すること。

---

## 次にやること

### 優先度1: main ブランチへの反映と develop プッシュ

`docs/actions/sync_to_main.md` に従って実施。v0.7.4 分 + v0.7.5 分 + 今回（シェルエスケープ・Git API・画像 API）分。

### 優先度2: セキュリティチェック

別セッションでプッシュ前に実施。

### 長期持ち越し

- `-` 始まりプロンプトの対応（必要になったら `--` 区切り or 別経路）
- 画像アップロード周りの拡張
  - 古い tmp ファイルの自動クリーンアップ
  - マジックナンバー検証
  - Send API と画像参照の連携設計
  - 容量制限
- `getGitStatus` の大量ファイル時の限界値処理
- npx 駆動の相談
- `/managed` と `/processes` の重複エンドポイント統合
- `GET /sessions` 一覧のチャットフィルタ検討

---

## 注意事項

### ⚠️ Git コミットルール

- AI 署名なし
- プッシュせず、コミットのみ
- プレフィックス: `feat:`, `fix:`, `docs:`, `chore:`
- 言語: 日本語

### ⚠️ ノート / 申し送り作成ルール

- ノート作成: セッション終了時の申し送りフロー内でのみ
- 申し送り作成: ユーザーが明示的に指示したときのみ
- 機密情報はプレースホルダー（`YOUR_API_KEY` 等）で記載

### ⚠️ `- ` 始まりプロンプトの制約

Send API で `- 1\n- 2\n- 3` のような `- ` 始まりプロンプトは Claude CLI 側で弾かれる（`error: unknown option`）。クリーンに失敗するので副作用はなし。利用者側で「先頭に何か文字を入れる」「`--` 区切りを意識する」などの回避が必要。

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
curl http://localhost:3100/version
```

### テスト手法

正式なテストフレームワークは未導入。手動テストで確認：

```bash
# サーバー起動（tmux）
npm run dev:tmux:start

# 各エンドポイントを curl で叩いて確認（上記「検証コマンド」参照）
```

### 重要ファイル

- `src/sender.js`: Claude CLI プロセス管理・シェル引数エスケープ
- `src/git-info.js`: Git 情報取得（worktree 検出・status・log）
- `src/api.js`: REST API ルート定義（今回 `/git/status`, `/git/log`, `/images` を追加）

### 現在のバージョン

- v0.7.5（`package.json` 未更新、リリース番号付与時に相談）

---

## セッション文脈サマリー

### 核心的な設計決定

**決定1**: シェルエスケープは「全引数を常にダブルクォートで囲んだ上で `\`、`"`、`` ` ``、`$` を漏れなく escape する」方式に統一
- 理由: `script -c` は内部でシェル評価が走るため、ダブルクォート内でも展開される `` ` ``/`$` のエスケープが必須
- 影響範囲: `sender.js` のみ。引数を渡す経路全体が安全になった

**決定2**: `/git/status` はカウントのみをデフォルト、`?files=true` でフル
- 理由: 大量ファイル変更時のレスポンス膨張を抑える。ビューワーのダッシュボード用途では概要カウントで十分
- 影響範囲: API 設計のみ

**決定3**: 画像アップロードは base64 JSON 方式
- 理由: プロジェクトの最小依存方針（multer 不採用）。既存 API と一貫した JSON 形式
- 影響範囲: 新規エンドポイント1本のみ

### 議論の流れ

1. **問題認識**: 長文 Markdown 送信時にバッククォート・`$` がシェル展開され、Mermaid 記法でゴミファイル生成
2. **原因特定**: `sender.js` のクォートロジックが `` ` ``/`$` を判定・エスケープしていない
3. **修正方針**: 引数構造を変えず、エスケープを補完する最小修正を採用
4. **検証**: 実セッションで長文 Markdown 26メッセージを通して問題なし
5. **副次発見**: `- ` 始まりプロンプトは Claude CLI 側で弾かれる（修正コストが大きく今回は回避）
6. **Git API 追加**: ビューワー連携のため status/log を提供。レスポンス軽量化のため `?files=true` 方式採用
7. **bug 発見**: `execGitCommand` の `.trim()` が porcelain 出力の先頭スペースを削っており、`staged: ["rc/api.js"]` という奇妙な誤判定の原因。`.trimEnd()` に1文字修正で解消
8. **画像 API 追加**: 最小依存維持のため base64 JSON 方式。拡張子ホワイトリスト・サニタイズ・UUID プレフィックスでセキュリティ確保

### 次のセッションに引き継ぐべき「空気感」

- **このプロジェクトの優先順位**: CLI 透過性 > 最小依存 > 独自機能
- **重視している価値観**: 既存機能の非破壊性、公式 CLI ドキュメントとの整合性、後方互換性
- **避けるべきアンチパターン**: 大幅な引数構造変更（イレギュラーケースのために本筋を曲げない）、依存追加（base64 JSON で済むなら multer 不要）
- **現在の開発フェーズ**: v0.7.5 リリース完了間近 + 別ビューワー側との連携 API 整備
- **ビューワー連携の文脈**: 別の viewer を開発してつなげる必要があるため、API 拡張は通す必要がある。既存機能が非破壊である限り通す方針

---

## 関連ドキュメント

- [前回の申し送り](./2026-04-16-03-20-00-send-api-init-event-info.md)
- [バッククォート・$ エスケープ修正ノート](../notes/2026-05-24-04-00-00-backtick-shell-escape-fix.md)
- [Git API 追加ノート](../notes/2026-05-24-04-05-00-git-status-log-api.md)
- [画像アップロード API 追加ノート](../notes/2026-05-24-04-10-00-image-upload-api.md)

---

**作成日時**: 2026-05-24 04:15:00
**作成者**: Claude Code (AI)
