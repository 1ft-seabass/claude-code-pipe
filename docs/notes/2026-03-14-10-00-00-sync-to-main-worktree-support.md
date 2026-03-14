---
tags: [git, worktree, sync-script, branch-strategy, automation]
---

# sync-to-main.js の worktree 対応と初回実行

**作成日**: 2026-03-14

## 背景

develop/main 2ブランチ体制を実現するため、`scripts/sync-to-main.js` を作成していたが、git worktree 環境での動作を想定していなかった。

### 環境

```bash
# worktree 構成
/home/node/workspace/repos/claude-code-pipe          # main ブランチ
/home/node/workspace/repos/claude-code-pipe-develop  # develop ブランチ
```

### 問題

通常の `git checkout main` でブランチ切り替えを試みるため、worktree 環境では以下のエラーが発生:

```
fatal: 'main' is already checked out at '/home/node/workspace/repos/claude-code-pipe'
```

## 解決策

### 1. worktree 環境の自動検出

`detectWorktree()` 関数を追加し、`git worktree list` で main ブランチの worktree パスを取得:

```javascript
function detectWorktree() {
  // worktree のリストを取得
  const worktrees = exec('git worktree list', { silent: true });
  const lines = worktrees.trim().split('\n');

  // main ブランチの worktree を探す
  for (const line of lines) {
    if (line.includes('[main]')) {
      const mainPath = line.split(/\s+/)[0];
      return mainPath;
    }
  }

  return null;
}
```

### 2. ファイルシステムベースの同期

worktree モード時は `git checkout` ではなく、Node.js の `fs` モジュールで直接ファイルをコピー:

```javascript
function syncFiles(mainPath) {
  const isWorktree = mainPath !== null;

  if (isWorktree) {
    // main ディレクトリ内の既存ファイルを削除（.git 以外）
    const itemsToDelete = fs.readdirSync(mainPath).filter(item => item !== '.git');
    itemsToDelete.forEach(item => {
      const itemPath = path.join(mainPath, item);
      fs.rmSync(itemPath, { recursive: true, force: true });
    });

    // develop から指定ファイルをコピー
    const developPath = process.cwd();
    filesToSync.forEach(file => {
      const sourcePath = path.join(developPath, file);
      const targetPath = path.join(mainPath, file);

      if (fs.existsSync(sourcePath)) {
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          fs.cpSync(sourcePath, targetPath, { recursive: true });
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }
      }
    });
  } else {
    // 通常モード: git コマンドで同期
    // （既存のロジック）
  }
}
```

### 3. 関数のパラメータ追加

すべての関数に `mainPath` パラメータを追加し、worktree パスを渡せるようにした:

- `syncFiles(mainPath)` - ファイル同期先のパス
- `cleanPackageJson(mainPath)` - package.json のクリーンアップ先
- `showDiff(mainPath)` - 差分表示の対象ディレクトリ
- `showNextSteps(mainPath)` - worktree モード用の案内

## 初回実行結果

### 実行コマンド

```bash
npm run sync-to-main
```

### 結果

```
✓ Detected worktree: /home/node/workspace/repos/claude-code-pipe
✓ Files synced
✓ package.json cleaned
```

**削除されたファイル**: 82ファイル、17,437行

- 開発記録: `docs/notes/`, `docs/letters/`, `docs/actions/`
- 開発ツール: `.husky/`, `.secretlintrc.json`, `gitleaks.toml`
- 開発スクリプト: `scripts/`
- テストファイル: `test-*.js`, `test-*.sh`

**package.json のクリーンアップ**:
- `devDependencies` を削除
- 開発用スクリプト (`prepare`, `sync-to-main`, `security:*`) を削除

### main ブランチでの git 操作

develop にいながら `git -C` で main のコミット・プッシュを実行:

```bash
git -C /home/node/workspace/repos/claude-code-pipe status
git -C /home/node/workspace/repos/claude-code-pipe add .
git -C /home/node/workspace/repos/claude-code-pipe commit -m "..."
git -C /home/node/workspace/repos/claude-code-pipe push origin main
```

コミットメッセージ（英語で実行してしまった）:
```
chore: create lightweight main branch for end users

- Remove development tools (.husky, secretlint, gitleaks)
- Remove development documentation (docs/notes, docs/letters, docs/actions)
- Remove development scripts (scripts/)
- Remove test files
- Clean package.json (remove devDependencies and dev scripts)
```

コミットハッシュ: `eeb8051`

## 今後の改善案

### 1. worktree モード時の自動コミット・プッシュ機能

現在は手動で `git -C` を使っているが、スクリプト内で自動化できる:

```javascript
function commitAndPush(mainPath, version) {
  if (!mainPath) {
    // 通常モード: 手動コミットを促すメッセージを表示
    return;
  }

  // worktree モード: 自動コミット・プッシュ
  const originalDir = process.cwd();
  process.chdir(mainPath);

  exec('git add .');
  exec(`git commit -m "sync: ${version} from develop"`);

  // プッシュは任意（ユーザーに確認を求めるのも良い）
  const shouldPush = confirm('Push to origin/main? [y/N]');
  if (shouldPush) {
    exec('git push origin main');
  }

  process.chdir(originalDir);
}
```

### 2. バージョン番号の自動提案

package.json から現在のバージョンを読み取り、コミットメッセージに使用:

```javascript
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = `v${pkg.version}`;
```

### 3. コミットメッセージの言語統一

develop ブランチのコミットログスタイルに合わせる（日本語 or 英語）

## 学び

1. **worktree は別ディレクトリで同じブランチをチェックアウトできない**
   - `git checkout` は失敗する
   - ファイルシステムで直接操作する必要がある

2. **`git -C <directory>` で別ディレクトリの git 操作が可能**
   - ブランチ切り替え不要で main の操作ができる
   - worktree 環境での効率的な作業フロー

3. **Node.js の fs モジュールで git を補完できる**
   - `fs.cpSync()`, `fs.rmSync()` で柔軟なファイル操作
   - git コマンドと組み合わせることで、worktree 環境にも対応可能

## 関連ドキュメント

- [ブランチ戦略再転換の方針](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)
- [同期スクリプトの実装記録](./2026-03-13-15-00-00-sync-to-main-script-implementation.md)
- [ブランチ作成方法の方針転換](./2026-03-13-16-00-00-branch-creation-approach-revision.md)

---

**最終更新**: 2026-03-14
**作成者**: AI (Claude Code)
