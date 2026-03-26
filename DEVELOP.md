# DEVELOP.md

このドキュメントは **develop ブランチで開発を行う開発者向け** のガイドです。

## ブランチの役割

このプロジェクトは **develop/main の2ブランチ体制** で運用しています。

- **develop**: 開発用ブランチ（開発記録、開発ツール、devDependencies を含むフル装備）
- **main**: 公開用ブランチ（本体コードと利用ドキュメントのみの軽量版）

### なぜ2ブランチに分けるのか？

main ブランチに `docs/notes/` や `.husky/` があると、コーディングエージェント（Claude Code など）が「開発中のプロジェクト」と誤解し、利用者に開発者向けの提案をしてしまいます。

ブランチを分離することで：
- 利用者は軽量な main ブランチをクローン
- 開発者はフル装備の develop ブランチで作業
- AI エージェントが適切に「利用者」と「開発者」を区別できる

詳細: [docs/notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md](./docs/notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)

## 環境セットアップ

### 前提条件

- Node.js v18 以上
- Git v2.30 以上（worktree サポート）

### 1. リポジトリをクローン

```bash
git clone git@github.com:YOUR_USERNAME/claude-code-pipe.git claude-code-pipe-develop
cd claude-code-pipe-develop
git checkout develop
```

### 2. worktree をセットアップ（必須）

develop ブランチと main ブランチを同時に操作できるように、worktree を作成します。

```bash
# 親ディレクトリに main ブランチの worktree を作成
git worktree add ../claude-code-pipe main
```

ディレクトリ構成:
```
/path/to/parent/
├── claude-code-pipe-develop/  ← develop ブランチ（作業場所）
└── claude-code-pipe/          ← main ブランチ（worktree）
```

### 3. 依存関係をインストール

```bash
npm install
```

### 4. 設定ファイルを作成

```bash
cp config.example.json config.json
# config.json を編集（最低限 watchDir を設定）
```

## develop から main への反映フロー

develop ブランチの変更を main ブランチに反映する手順です。

### Step 0: develop での作業を完了させる

```bash
# develop ブランチで作業
cd /path/to/claude-code-pipe-develop

# コミット・プッシュを完了
git add .
git commit -m "feat: 新機能の追加"
git push origin develop
```

**バージョンアップを伴うリリースの場合**:
```bash
# CHANGELOG を更新
vim CHANGELOG.md
vim CHANGELOG-ja.md

# package.json のバージョンを更新
vim package.json
# "version": "0.6.2"

# コミット
git add CHANGELOG*.md package.json
git commit -m "docs: v0.6.2 CHANGELOG を追加"
git push origin develop
```

### Step 1: sync-to-main

develop ブランチから main ブランチに必要なファイルを同期します。

```bash
# develop ブランチで実行
npm run sync-to-main
```

**このスクリプトがやること**:
- 本体コード（`src/`）を main に同期
- ドキュメント（`README.md`, `DETAILS.md`, `CHANGELOG.md` など）を main に同期
- `package.json` をコピーして、`devDependencies` と開発用スクリプトを削除
- 変更を main ブランチにステージング（コミットはしない）

### Step 2: package.json 確認（オプション）

同期後、main ブランチの package.json が正しくクリーンアップされたか確認できます。

```bash
cat /path/to/claude-code-pipe/package.json
```

確認ポイント:
- `devDependencies` が削除されている
- `scripts` に `start` と `dev` のみが残っている

### Step 3: commit-main（ユーザーが実行）

main ブランチの変更をコミットします。

```bash
# develop ブランチで実行
npm run commit-main
```

**⚠️ 重要**: このステップは **ユーザーが実行** してください。AI による自動実行は推奨されません。

**ウィザードの流れ**:
1. コミットプレフィックスを選択（通常は `5: sync`）
2. コミットメッセージを入力（例: `sync: v0.6.2 from develop`）
3. 確認して実行

### Step 4: タグ作成とプッシュ（ユーザーが実行）

**⚠️ 重要**: このステップは **ユーザーが実行** してください。AI による自動実行は推奨されません。

```bash
# main ブランチでタグを作成
cd /path/to/claude-code-pipe
git tag v0.6.2
git push origin main
git push origin v0.6.2
```

または develop ブランチから実行:
```bash
git -C /path/to/claude-code-pipe tag v0.6.2
git -C /path/to/claude-code-pipe push origin main
git -C /path/to/claude-code-pipe push origin v0.6.2
```

## よくある質問

### Q: worktree は必須ですか？

**A**: はい、必須です。`sync-to-main` と `commit-main` は worktree 環境を前提としています。

### Q: worktree のセットアップに失敗した場合は？

**A**: 以下を確認してください:

```bash
# worktree の状態を確認
git worktree list

# 既存の worktree を削除（必要に応じて）
git worktree remove /path/to/old/worktree

# 再作成
git worktree add ../claude-code-pipe main
```

### Q: sync-to-main で「worktree not found」エラーが出る

**A**: worktree が正しくセットアップされていません。Step 2 の手順を実行してください。

## 関連ドキュメント

### ブランチ戦略

- [ブランチ戦略の変遷](./docs/notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md) - develop/main 体制の背景と理由

### 同期ワークフロー

- [sync-to-main と commit-main の併走フロー](./docs/notes/2026-03-15-13-15-00-sync-to-main-commit-main-workflow.md) - 詳細な使い方と AI サポート
- [sync-to-main の worktree 対応](./docs/notes/2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装](./docs/notes/2026-03-14-14-00-00-commit-main-wizard-implementation.md)

## ライセンス

MIT
