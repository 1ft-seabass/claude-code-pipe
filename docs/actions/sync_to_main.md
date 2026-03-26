develop ブランチから main ブランチへの同期作業を行います。

## 📋 この指示書の理解チェック

作業を開始する前に、以下の内容を理解したことをチェックボックスで提示してください：

### 実行手順の理解
- [ ] Step 1: sync-to-main を実行（AI が実行可）
- [ ] Step 2: main の package.json を確認（AI が実行可）
- [ ] Step 3: commit-main の実行をユーザーに案内（**ユーザーが実行**）
- [ ] Step 4: タグ作成とプッシュをユーザーに案内（**ユーザーが実行**）

### 重要ルール
- [ ] この指示書の前提は「変更がすべてコミット・プッシュ済み」なので、ここでコミット・プッシュはしない
- [ ] commit-main は AI が実行せず、ユーザーに案内のみ
- [ ] タグ作成とプッシュも AI が実行せず、ユーザーに案内のみ

理解できましたか？ゴーサインをください。

---

## 前提条件

- develop ブランチで作業していること
- **変更がすべてコミット・プッシュ済みであること**
- worktree がセットアップされていること

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

### Step 3: commit-main の実行をユーザーに案内

**ユーザーが実行します。AI は実行しないでください。**

ユーザーに以下を案内してください：

```
main ブランチへの同期が完了しました。
次のステップとして、以下のコマンドを実行してください：

  npm run commit-main

ウィザードに従ってコミットメッセージを入力してください。
通常は以下を選択します：
- プレフィックス: 5 (sync)
- メッセージ例: "sync: v0.6.2 from develop"
```

### Step 4: タグ作成とプッシュをユーザーに案内

**ユーザーが実行します。AI は実行しないでください。**

バージョンアップを伴うリリースの場合、ユーザーに以下を案内してください：

```
コミットが完了しました。
リリースタグを作成する場合は、以下のコマンドを実行してください：

  cd /path/to/claude-code-pipe
  git tag v0.6.2
  git push origin main
  git push origin v0.6.2

または develop ブランチから：

  git -C /path/to/claude-code-pipe tag v0.6.2
  git -C /path/to/claude-code-pipe push origin main
  git -C /path/to/claude-code-pipe push origin v0.6.2
```

## 注意事項

- **この指示書の前提は「変更がすべてコミット・プッシュ済み」** なので、ここでコミット・プッシュはしない
- AI 署名は付けない（commit-main ウィザードが自動で対応）
- commit-main と タグ作成・プッシュは必ずユーザーが実行する
