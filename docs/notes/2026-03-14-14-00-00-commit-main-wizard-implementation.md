---
tags: [sync-script, commit-wizard, automation, worktree, git-workflow]
---

# commit-main ウィザードの実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-14
**関連タスク**: sync-to-main スクリプトの自動化改善

## 問題

前回のセッションで worktree 対応の `sync-to-main.js` を実装したが、以下の課題が残っていた:

1. **手動操作が必要**: worktree モード時に `git -C` コマンドを手動で実行している
2. **コミットスタイルの統一が困難**: 手動コミットだとプレフィックスや言語を間違える可能性
3. **プッシュの事故リスク**: 前回は意図せず main ブランチにプッシュしてしまった

### 前回の失敗

前回のセッションで以下のルールを破ってしまった:
- ❌ プッシュ禁止ルールを破り main ブランチにプッシュ
- ❌ コミットスタイル確認前に英語でコミット
- ❌ 指示書 (`docs/actions/00_session_end.md`) を最初に確認すべきだった

## 試行錯誤

### アプローチA: 完全手動のまま（現状維持）

**概要**: スクリプトは変更せず、手動で `git -C` コマンドを実行

**メリット**:
- 事故が起きない
- 完全にコントロール可能

**デメリット**:
- `git -C` コマンドを毎回手入力する手間
- コミットメッセージの統一が困難
- 人的ミスのリスク

**結果**: 却下

**理由**: ユーザー体験が悪く、前回のような事故が再発する可能性

---

### アプローチB: 半自動化（差分確認 → ユーザー承認 → 自動実行）

**概要**: スクリプト内で対話的にコミットメッセージを入力し、確認後に自動コミット・プッシュ

```javascript
// 1. ファイル同期
// 2. 差分を表示
// 3. "コミットしますか？ [y/N]" で確認
// 4. コミットメッセージをユーザーに入力してもらう
// 5. "プッシュしますか？ [y/N]" で確認
```

**メリット**:
- 安全性と効率のバランス
- 各ステップで確認できる

**デメリット**:
- `sync-to-main.js` が複雑化
- スクリプトの責務が増える

**結果**: 却下

**理由**: 単一責任の原則に反する。同期とコミットは分離すべき

---

### アプローチC: コミット準備まで自動化（プッシュは手動） + ウィザードスクリプト分離（採用）

**概要**:
1. `sync-to-main.js`: ファイル同期 + `git add` まで自動化
2. `commit-main.js`: 新規作成、ウィザード式コミット・プッシュツール

**メリット**:
- `git add` までは安全に自動化できる
- コミットメッセージはウィザードで毎回確認・調整できる
- プッシュは任意（確認フローあり）
- 何度実行しても問題ない（冪等性）
- 単一責任の原則に沿っている

**デメリット**:
- スクリプトが2つになる（ただし役割が明確）

**結果**: ✅ 成功

## 解決策

### 実装1: sync-to-main.js の改修

**実装場所**: `scripts/sync-to-main.js`

#### 追加した関数: `stageChanges(mainPath)`

```javascript
function stageChanges(mainPath) {
  log('\n📦 Staging changes...', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    // worktree モード: main ディレクトリで git add を実行
    const addCmd = `git -C ${mainPath} add .`;
    log(`   $ ${addCmd}`, 'cyan');
    execSync(addCmd, { encoding: 'utf8' });
    log('✓ Changes staged in main worktree', 'green');
  } else {
    // 通常モード: カレントディレクトリで git add を実行
    exec('git add .');
    log('✓ Changes staged', 'green');
  }
}
```

#### 更新した関数: `showNextSteps(mainPath)`

次のステップとして `npm run commit-main` の実行を案内するように変更:

```javascript
if (isWorktree) {
  log('   1. Commit and push using the wizard:', 'yellow');
  log('      npm run commit-main', 'cyan');
  log('', 'reset');
  log('   Or manually:', 'yellow');
  log(`      git -C ${mainPath} commit -m "sync: vX.Y.Z from develop"`, 'cyan');
  log(`      git -C ${mainPath} push origin main`, 'cyan');
  log('', 'reset');
}
```

#### main() 関数の更新

```javascript
// 変更をステージング（git add まで実行）
stageChanges(mainPath);

// 次のステップを表示
showNextSteps(mainPath);
```

### 実装2: commit-main.js の新規作成

**実装場所**: `scripts/commit-main.js`

**主な機能**:
1. worktree 自動検出
2. main ブランチの変更確認
3. ステージング済み差分の表示
4. 対話的なコミットメッセージ作成
5. コミット実行
6. プッシュ確認（任意）

#### ウィザードのフロー

```
1. main ブランチの状態確認
   → 変更がない場合は終了
   → 変更がある場合は差分を表示

2. コミットメッセージ入力
   - プレフィックス選択: [1] feat  [2] fix  [3] docs  [4] chore  [5] sync
   - メッセージ本文を入力（日本語）
   - プレビュー表示: "sync: main ブランチを軽量化"

3. コミット実行確認
   [y/N]:

4. プッシュ確認
   [y/N]:

5. 完了メッセージ
```

#### 主要な関数

**worktree 検出**:
```javascript
function detectWorktree() {
  const worktrees = execSync('git worktree list', { encoding: 'utf8', stdio: 'pipe' });
  const lines = worktrees.trim().split('\n');

  for (const line of lines) {
    if (line.includes('[main]')) {
      const mainPath = line.split(/\s+/)[0];
      return mainPath;
    }
  }

  return null;
}
```

**プレフィックス選択**:
```javascript
async function selectPrefix() {
  log('\n📝 Select commit prefix:', 'blue');
  log('   [1] feat    - 新機能', 'cyan');
  log('   [2] fix     - バグ修正', 'cyan');
  log('   [3] docs    - ドキュメント', 'cyan');
  log('   [4] chore   - その他（ビルド、設定など）', 'cyan');
  log('   [5] sync    - develop からの同期', 'cyan');

  const answer = await question('\nSelect number [1-5]: ');

  const prefixMap = {
    '1': 'feat',
    '2': 'fix',
    '3': 'docs',
    '4': 'chore',
    '5': 'sync',
  };

  const prefix = prefixMap[answer.trim()];

  if (!prefix) {
    log('❌ Invalid selection', 'red');
    return selectPrefix(); // 再帰的に再入力を促す
  }

  return prefix;
}
```

**コミット実行**:
```javascript
function commitChanges(mainPath, prefix, message) {
  log('\n💾 Committing changes...', 'blue');

  const commitMessage = `${prefix}: ${message}`;
  const isWorktree = mainPath !== null;

  if (isWorktree) {
    const cmd = `git -C ${mainPath} commit -m "${commitMessage}"`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    const cmd = `git commit -m "${commitMessage}"`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  }

  log('✓ Committed successfully', 'green');
}
```

**プッシュ実行**:
```javascript
function pushChanges(mainPath) {
  log('\n📤 Pushing to origin/main...', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    const cmd = `git -C ${mainPath} push origin main`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    const cmd = 'git push origin main';
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  }

  log('✓ Pushed successfully', 'green');
}
```

### 実装3: package.json への npm スクリプト追加

**実装場所**: `package.json:22`

```json
"commit-main": "node scripts/commit-main.js"
```

### 使い方

```bash
# ステップ1: ファイル同期 + git add まで自動実行
npm run sync-to-main

# ステップ2: ウィザードでコミット・プッシュ
npm run commit-main
```

### 動作確認

#### テスト1: 変更がない状態での実行

```bash
$ node scripts/commit-main.js
🧙 Main Branch Commit Wizard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Detected worktree: /home/node/workspace/repos/claude-code-pipe

🔍 Checking main branch status...
ℹ️  No changes to commit in main branch

ℹ️  Nothing to commit. Run `npm run sync-to-main` first.
```

✅ 正常に動作（適切なメッセージを表示して終了）

#### テスト2: 構文チェック

```bash
$ node -c scripts/sync-to-main.js && node -c scripts/commit-main.js
✓ Syntax check passed
```

✅ 構文エラーなし

## 学び

### 設計の学び

1. **単一責任の原則を守る**: 同期とコミットを別スクリプトに分離したことで、保守性が向上
2. **冪等性の重要性**: `git add` は何度実行しても問題ないので、安全に自動化できる
3. **確認フローの重要性**: 各ステップで確認を入れることで、事故を防げる

### Git の学び

1. **`git -C` の活用**: worktree 環境で develop から main を操作するのに便利
2. **ステージングの分離**: `git add` と `git commit` を分離することで、安全性が向上
3. **プレフィックスの統一**: ウィザードで選択式にすることで、コミットスタイルを統一できる

### Node.js の学び

1. **readline の活用**: 対話的な入力を受け取るのに便利
2. **Promise ベースの質問関数**: async/await で読みやすいコードになる
3. **再帰的な入力検証**: 不正な入力時に再入力を促す

## 今後の改善案

### 改善案1: バージョン番号の自動提案

package.json からバージョン番号を読み取り、コミットメッセージに自動挿入:

```javascript
const pkg = require('../package.json');
const suggestedMessage = `v${pkg.version} from develop`;
```

### 改善案2: タグ付けの自動化

コミット後、タグ付けを提案:

```javascript
const shouldTag = await question('\nCreate tag? [y/N]: ');
if (shouldTag) {
  const tag = await question('Tag name (e.g., v1.0.0): ');
  exec(`git -C ${mainPath} tag ${tag}`);
  exec(`git -C ${mainPath} push origin ${tag}`);
}
```

### 改善案3: commit-main.js の汎用化

main ブランチ専用ではなく、任意のブランチでも使えるようにする:

```bash
npm run commit-main -- --branch feature/foo
```

### 改善案4: テンプレートの追加

よく使うコミットメッセージをテンプレート化:

```javascript
const templates = {
  '1': 'vX.Y.Z from develop',
  '2': 'main ブランチを軽量化',
  '3': 'ドキュメントを更新',
};
```

## 関連ドキュメント

- [前回の実装記録: sync-to-main worktree 対応](./2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [前回の申し送り](../letters/2026-03-14-10-30-00-worktree-sync-implementation.md)
- [ブランチ戦略](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)

---

**最終更新**: 2026-03-14
**作成者**: Claude Code (AI)
