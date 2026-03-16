---
tags: [sync-to-main, commit-main, workflow, ai-support, worktree]
---

# sync-to-main → commit-main ウィザード併走フロー - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-15
**関連タスク**: main ブランチへの同期とコミットのワークフロー確立

## 概要

develop ブランチから main ブランチへの同期とコミットを行う際の、AI サポート付きワークフローを確立した。

**対象スクリプト**:
- `npm run sync-to-main`: develop → main へのファイル同期と package.json クリーンアップ
- `npm run commit-main`: main ブランチ用のインタラクティブコミットウィザード

## 前提条件

### 実行場所
- **必ず develop ブランチで実行すること**
- worktree 環境を想定（main ブランチは別ディレクトリに存在）

### 環境
```
/home/node/workspace/repos/claude-code-pipe-develop  ← develop ブランチ
/home/node/workspace/repos/claude-code-pipe          ← main ブランチ (worktree)
```

## ワークフロー全体

### Step 1: sync-to-main の実行

**実行方法**:
- **パターンA**: ユーザーが実行 → AI に結果ログを貼り付け
- **パターンB**: AI が実行 → AI がログを見て併走

**実行コマンド** (develop ブランチで):
```bash
npm run sync-to-main
```

**AI のサポート内容**:
1. ログ出力を確認し、削除されたスクリプトをユーザーに報告
2. 同期が成功したかどうかを確認
3. 次のステップ（package.json 確認、commit-main 実行）を案内

**ログ例**:
```
🧹 Cleaning package.json...
   Removing devDependencies
   Removing script: prepare
   Removing script: sync-to-main
   Removing script: commit-main
   Removing script: dev:tmux:start
   Removing script: dev:tmux:restart
   Removing script: dev:tmux:status
   Removing script: dev:tmux:logs
   Removing script: dev:tmux:logs:realtime
   Removing script: dev:tmux:stop
   Removing script: security:verify
   Removing script: security:verify:simple
   Removing script: security:verify:testrun
   Removing script: security:install-gitleaks
   Removing script: secret-scan
   Removing script: secret-scan:full
✓ package.json cleaned

📊 Changes:
M package.json

📦 Staging changes...
   $ git -C /home/node/workspace/repos/claude-code-pipe add .
✓ Changes staged in main worktree
```

### Step 2: main ブランチの package.json 確認

**AI が実行するコマンド**:
```bash
cd /home/node/workspace/repos/claude-code-pipe && cat package.json
```

**確認ポイント**:
- `scripts` に `start` と `dev` のみが残っているか
- 開発用スクリプト（tmux、security、secret-scan など）が削除されているか
- `devDependencies` が削除されているか

**期待される結果**:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js"
  },
  "dependencies": {
    "chokidar": "^3.5.3",
    "express": "^4.18.2",
    "ws": "^8.14.2"
  }
}
```

### Step 3: commit-main ウィザードの実行

**実行方法**: ユーザーが操作、AI が併走サポート

**実行コマンド** (develop ブランチで):
```bash
cd /home/node/workspace/repos/claude-code-pipe-develop
npm run commit-main
```

**ウィザードの流れ**:

#### 3-1. コミットプレフィックスの選択
```
📝 Select commit prefix:
   [1] feat    - 新機能
   [2] fix     - バグ修正
   [3] docs    - ドキュメント
   [4] chore   - その他（ビルド、設定など）
   [5] sync    - develop からの同期

Select number [1-5]:
```

**AI のサポート**:
- 今回の変更内容を分析
- 適切なプレフィックスを提案（通常は `5 (sync)`）

#### 3-2. コミットメッセージの入力
```
Enter commit message:
```

**AI のサポート**:
- 変更内容に基づいたコミットメッセージを提案
- 例:
  - `sync: main ブランチの package.json と README を簡素化`
  - `sync: 開発用の secret-scan スクリプトを main から削除`
  - `sync: vX.Y.Z from develop`

#### 3-3. コミットの実行
ウィザードが自動的に以下を実行:
```bash
git -C /home/node/workspace/repos/claude-code-pipe commit -m "sync: ..."
```

## ポイント

### 1. develop ブランチから実行する理由

**sync-to-main**:
- `scripts/sync-to-main.js` は develop ブランチにのみ存在
- main ブランチには `scripts/` フォルダ自体が同期されない
- worktree のパス検出は develop ブランチから行う

**commit-main**:
- `scripts/commit-main.js` も develop ブランチにのみ存在
- main ブランチへの git 操作を `git -C <path>` で実行
- ユーザーは develop ブランチから離れずに main ブランチをコミットできる

### 2. worktree 環境での動作

**検出ロジック**:
```javascript
const mainWorktreePath = detectMainWorktree();
// → /home/node/workspace/repos/claude-code-pipe
```

**git 操作**:
- 通常の `git add .` ではなく `git -C <mainPath> add .` を使用
- カレントディレクトリを変更せずに main ブランチを操作

**メリット**:
- develop ブランチで作業中に main ブランチをコミットできる
- ブランチ切り替えが不要
- 誤って develop ブランチにコミットするリスクを回避

### 3. AI がサポートできること

**sync-to-main 実行時**:
- ログを解析して削除されたスクリプトを報告
- 同期の成功/失敗を確認
- 次のステップを案内

**package.json 確認時**:
- main ブランチの package.json を表示
- シンプル化が正しく行われたかを確認

**commit-main ウィザード時**:
- 変更内容を分析
- 適切なプレフィックスを提案（通常は sync）
- コミットメッセージを提案
- 次のステップ（プッシュなど）を案内

## 実際の使用例

### 今回のセッション（2026-03-15）

**変更内容**: `secret-scan` と `secret-scan:full` を main ブランチから削除

**フロー**:
1. ユーザー: 「sync-to-main やりましょう」
2. AI: `npm run sync-to-main` を実行
3. AI: ログから `secret-scan` と `secret-scan:full` が削除されたことを確認
4. AI: main ブランチの package.json を確認し、シンプル化を報告
5. ユーザー: 「はい！実行してきます！」（commit-main を起動）
6. AI: 「5 (sync) を選択してください」と提案
7. AI: コミットメッセージを提案「sync: 開発用の secret-scan スクリプトを main から削除」
8. ユーザー: ウィザードで選択・入力してコミット完了

## 学び

### ワークフローの確立
- develop ブランチから main ブランチへの同期・コミットのフローが確立
- AI サポートにより、ユーザーは判断に集中できる
- ウィザード形式により、誤操作を防止

### AI とユーザーの役割分担
- **AI**: ログ解析、提案、確認、次ステップの案内
- **ユーザー**: 最終判断、ウィザード操作、承認

### worktree のメリット
- ブランチ切り替え不要で効率的
- develop での作業中に main をコミット可能
- 誤操作のリスク低減

## 今後の改善案

### ウィザードの改善
- コミットメッセージの履歴を表示（前回の sync メッセージを参考にできる）
- プッシュまで一気に実行するオプション（オプトイン）

### AI サポートの改善
- sync-to-main のログから変更ファイル数を自動カウント
- commit-main の前に git status を自動表示
- コミット後に git log を表示して確認

## 関連ドキュメント

- [sync-to-main worktree 対応の実装記録](./2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装記録](./2026-03-14-14-00-00-commit-main-wizard-implementation.md)
- [sync-to-main での secret-scan 削除対応](./2026-03-15-13-05-00-sync-to-main-secret-scan-removal.md)
- [main ブランチ簡素化の申し送り](../letters/2026-03-14-17-30-00-main-branch-package-json-simplification.md)

---

**最終更新**: 2026-03-15
**作成者**: Claude Code (AI)
