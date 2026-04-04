develop ブランチから main ブランチへの同期作業を行います。

## 📋 この指示書の理解チェック

作業を開始する前に、以下の内容を理解したことをチェックボックスで提示してください：

### 実行手順の理解
- [ ] Step 1: sync-to-main を実行（AI が実行可）
- [ ] Step 2: main の package.json を確認（AI が実行可）
- [ ] Step 3: セキュリティチェック（AI が実行可）
- [ ] Step 4: コミットメッセージの計画（AI が実行可）
- [ ] Step 5: commit-main の実行をユーザーに案内（**ユーザーが実行**）
- [ ] Step 6: タグ作成とプッシュ（AI が実行可）

### 重要ルール
- [ ] この指示書の前提は「変更がすべてコミット・プッシュ済み」なので、ここでコミット・プッシュはしない
- [ ] commit-main は AI が実行せず、ユーザーに案内のみ
- [ ] タグ作成とプッシュは AI が実行する
- [ ] CHANGELOG.md が最新バージョンで更新されているか確認する

理解できましたか？ゴーサインをください。

---

## 前提条件

- develop ブランチで作業していること
- **変更がすべてコミット・プッシュ済みであること**
- worktree がセットアップされていること
- **CHANGELOG.md が更新されていること**（バージョンアップを伴うリリースの場合）

## 詳細手順

詳細は DEVELOP.md を参照してください。以下は概要です。

### Step 1: sync-to-main を実行

AI が実行します。

```bash
npm run sync-to-main
```

このスクリプトがやること：
- 本体コード（`src/`）を main に同期
- ドキュメント（`README.md`, `DETAILS.md`, `CHANGELOG.md` など）を main に同期
- `package.json` をコピーして、`devDependencies` と開発用スクリプトを削除
- 変更を main ブランチにステージング（コミットはしない）

### Step 2: main の package.json を確認

AI が実行します。

main ブランチの package.json が正しくクリーンアップされたか確認します。

確認ポイント：
- `devDependencies` が削除されている
- `scripts` に `start` と `dev` のみが残っている
- 開発用スクリプト（`sync-to-main`, `dev:tmux:*`, `security:*`, `secret-scan*`）が削除されている
- `lint-staged` が削除されている

### Step 3: セキュリティチェック

AI が実行します。

main ブランチにデプロイする内容に機密情報が含まれていないか確認します。

**チェック対象**:
```bash
git -C [main worktree path] diff --cached
```

**検出パターン**:
- APIキー形式：`sk-`, `pk-`, `AIza`, `ghp_`, `xoxb-`, `AKIA`
- パスワード、トークン、シークレット
- データベース接続文字列（実際の認証情報含む）
- プライベートなURL、IPアドレス
- 実際のメールアドレス
- JWTトークン（`eyJ` で始まる）

**除外（これらはOK）**:
- プレースホルダー：`YOUR_API_KEY`, `***`, `sk-...`
- example.com, test.com のメールアドレス
- 説明文中の用語（「APIキーを設定」など）

**報告形式**:
- 問題検出時：📄 ファイル名、行番号、問題の種類、危険度
- 問題なしの場合：「✅ セキュリティチェック完了。デプロイ安全。」

### Step 4: コミットメッセージの計画

AI が実行します。

main に何が同期されるかを確認し、適切なコミットメッセージを提案します。

**重要**: DEVELOP.md や sync_to_main.md などの develop 専用ファイルは main に同期されません。
sync-to-main.js の `filesToSync` を確認し、実際に main に反映される変更を特定してください。

例：
- v0.6.1: CHANGELOG の追加のみ → `v0.6.1 from develop - CHANGELOG 設置`
- v0.7.0: 新機能追加 → `v0.7.0 from develop - user メッセージ Webhook・バージョン情報追加`

### Step 5: commit-main の実行をユーザーに案内

**ユーザーが実行します。AI は実行しないでください。**

ユーザーに以下を案内してください：

```
main ブランチへの同期が完了しました。
次のステップとして、以下のコマンドを実行してください：

  cd [develop worktree path]
  npm run commit-main

ウィザードに従ってコミットメッセージを入力してください。
通常は以下を選択します：
- プレフィックス: 5 (sync) ← ウィザードが自動的に "sync:" を付けます
- メッセージ: "[AI が提案したメッセージ]"（例: "v0.7.0 from develop - 新機能名"）

完了したら教えてください。次は Step 6 でタグ作成・プッシュを行います。
```

**注意**: パスは worktree の実際のパスに置き換えてください（例: `~/workspace/repos/claude-code-pipe-develop`）

### Step 6: タグ作成とプッシュ

**AI が実行します。**

ユーザーから完了報告を受けたら、タグを作成してプッシュします。

```bash
# develop から実行
git -C [main worktree path] tag vX.Y.Z
git -C [main worktree path] push origin vX.Y.Z
```

**注意**:
- バージョン番号は package.json から取得
- main の push は commit-main ウィザードで完了しているはずなので、タグのみプッシュ

## 注意事項

- **この指示書の前提は「変更がすべてコミット・プッシュ済み」** なので、ここでコミット・プッシュはしない
- AI 署名は付けない（commit-main ウィザードが自動で対応）
- commit-main は必ずユーザーが実行する
- タグ作成・プッシュは AI が実行する
