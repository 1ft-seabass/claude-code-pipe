---
tags: [branch-strategy, automation, script, development-workflow]
---

# develop → main 同期スクリプトの実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-13
**関連タスク**: develop/main 2ブランチ体制の実装
**関連ノート**: [2026-03-13-14-30-00-branch-strategy-revision-develop-main.md](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)

## 背景

ブランチ戦略の再転換（[方針ノート](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)参照）に伴い、develop から main へファイルを同期するスクリプトを実装。

**目的**:
- develop ブランチ（開発用フル装備）から main ブランチ（利用者向け軽量版）への同期を自動化
- 手作業でのミスを防ぐ
- 同期対象ファイルを明示的に管理

## 実装

### 作成したファイル

#### `scripts/sync-to-main.js`

**実装場所**: `scripts/sync-to-main.js`

**主な機能**:
1. **安全性チェック**
   - develop ブランチで実行されているか確認
   - 未コミットの変更がないか確認

2. **ファイル同期**
   - 指定されたファイルのみを develop から main へコピー
   - main ブランチの既存ファイルをクリーンアップ

3. **package.json のクリーンアップ**
   - `devDependencies` を削除
   - 開発用スクリプト（`prepare`, `sync-to-main`, `security:*`, `secret-scan*` など）を削除

4. **差分表示と次のステップ案内**
   - 変更内容を表示
   - コミット・タグ付け・プッシュの手順を案内

### 同期対象ファイル

```javascript
const filesToSync = [
  // ソースコード
  'src/',

  // ドキュメント
  'README.md',
  'README-ja.md',
  'DETAILS.md',
  'DETAILS-ja.md',
  'LICENSE',

  // 設定ファイル
  'config.example.json',
  '.gitignore',

  // 依存関係
  'package.json',
  'package-lock.json',
];
```

**除外されるもの**（develop のみに存在）:
- `docs/notes/`, `docs/letters/`, `docs/actions/` - 開発記録
- `.husky/`, `.secretlintrc.json`, `gitleaks.toml` - 開発ツール
- `bin/` - gitleaks バイナリ
- `scripts/` - 開発スクリプト（sync-to-main.js 含む）
  - ただし `scripts/start-tmux.js` も除外（基本は `npm run dev` を推奨）
- `test-*.js`, `test-*.sh` - テストスクリプト
- `.pm2/`, `logs/`, `tmp/` - ランタイムディレクトリ

### package.json への追加

```json
{
  "scripts": {
    "sync-to-main": "node scripts/sync-to-main.js"
  }
}
```

## 使い方

### 基本的なフロー

```bash
# 1. develop ブランチで開発作業
git checkout develop
# ... 開発作業 ...
git add .
git commit -m "feat: 新機能追加"
git push origin develop

# 2. main に同期
npm run sync-to-main

# 3. 差分を確認
git diff

# 4. 問題なければコミット
git add .
git commit -m "sync: v1.2.3 from develop"
git push origin main

# 5. タグ付け（リリース時）
git tag v1.2.3
git push origin v1.2.3

# 6. develop に戻る
git checkout develop
```

### スクリプトの出力例

```
🔄 Syncing develop → main
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Current branch: develop
✓ No uncommitted changes

📥 Updating develop branch...
$ git pull origin develop
Already up to date.
✓ develop branch updated

🔀 Switching to main branch...
$ git checkout main
Switched to branch 'main'
✓ Switched to main branch

📋 Syncing files from develop...
   Copying: src/
   Copying: README.md
   Copying: README-ja.md
   ...
✓ Files synced

🧹 Cleaning package.json...
   Removing devDependencies
   Removing script: prepare
   Removing script: sync-to-main
✓ package.json cleaned

📊 Changes:
 package.json | 15 ---------------
 src/api.js   |  2 +-
 2 files changed, 1 insertion(+), 16 deletions(-)

✅ Sync completed!

📌 Next steps:
   1. Review changes:
      git diff

   2. Commit and push:
      git add .
      git commit -m "sync: vX.Y.Z from develop"
      git push origin main

   3. Tag release:
      git tag vX.Y.Z
      git push origin vX.Y.Z

   4. Return to develop:
      git checkout develop
```

## 設計判断

### 1. なぜ Node.js？

**選択肢**:
- シェルスクリプト（bash）
- Node.js スクリプト
- GitHub Actions

**決定**: Node.js スクリプト

**理由**:
- ✅ Node.js は既にプロジェクトで使用（依存追加不要）
- ✅ package.json の操作が簡単（JSON パース・整形）
- ✅ クロスプラットフォーム（Windows/Linux/Mac）
- ✅ エラーハンドリングが柔軟
- ✅ 複雑なロジックも書きやすい
- ❌ GitHub Actions は現段階では過剰

### 2. なぜ scripts/start-tmux.js を除外？

**議論の経緯**:
- tmux はサーバー運用時に便利
- 推奨ツールとして main に含めるべきか？

**決定**: 除外する

**理由**:
- ✅ 基本は `npm run dev` で十分（フォアグラウンド起動）
- ✅ VSCode のターミナルで起動するのが最もシンプル
- ✅ tmux は「知ってる人向けのオプション」
- ✅ 必要な人は自分で tmux を使える
- ✅ main ブランチをよりシンプルに保てる

### 3. main ブランチの既存ファイルをクリーンアップ

**実装**:
```javascript
// main ブランチの既存ファイルをすべて削除（.git 以外）
exec('git rm -rf . 2>/dev/null || true', { silent: true });

// develop から指定ファイルをコピー
filesToSync.forEach(file => {
  exec(`git checkout develop -- ${file}`);
});
```

**理由**:
- develop でファイルが削除された場合、main にも反映される
- 「追加のみ」の同期だと、削除が反映されない
- クリーンな状態から同期することで整合性を保つ

### 4. package.json のクリーンアップ

**削除対象**:
- `devDependencies` - 開発専用の依存関係
- `scripts.prepare` - husky の自動セットアップ
- `scripts.sync-to-main` - このスクリプト自体
- `scripts.security:*` - セキュリティチェック関連
- `scripts.secret-scan*` - secretlint 関連
- `lint-staged` - husky と連携する設定

**理由**:
- 利用者には不要な依存関係・スクリプトを削除
- npm install 時の余計なツールインストールを防ぐ
- package.json をシンプルに保つ

## 今後の改善案

### 1. 自動バージョン番号の提案

現在は手動で `vX.Y.Z` を入力しているが、package.json の version を読み取って自動提案できる。

```javascript
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log(`Suggested tag: v${pkg.version}`);
```

### 2. 対話的なコミット・タグ付け

スクリプト実行後に、そのままコミット・タグ付けまで対話的に実行できると便利。

```javascript
const readline = require('readline');
const rl = readline.createInterface({ input, output });

rl.question('Commit and push? (y/n): ', (answer) => {
  if (answer === 'y') {
    exec('git add .');
    exec(`git commit -m "sync: ${version} from develop"`);
    exec('git push origin main');
  }
});
```

### 3. CHANGELOG.md の自動生成

develop の commit log から CHANGELOG.md を生成して main に含める。

### 4. ドライランモード

実際には同期せず、どのファイルが同期されるか確認するだけのモード。

```bash
npm run sync-to-main -- --dry-run
```

## 注意事項

### ⚠️ develop ブランチで実行すること

スクリプトは develop ブランチで実行することを前提としている。main ブランチで実行するとエラーになる。

### ⚠️ 未コミットの変更がないこと

スクリプト実行前に、すべての変更をコミットしておく必要がある。

### ⚠️ main ブランチの手動変更は避ける

main ブランチで直接変更を加えると、次回の同期で上書きされる。すべての変更は develop で行う。

### ⚠️ リモートとの同期

スクリプトは `git push` まで自動実行しない。手動で確認してからプッシュすること。

## 次のステップ

### 1. develop ブランチの作成

現在の main ブランチを develop にリネーム、または develop ブランチを作成。

### 2. git worktree のセットアップ（推奨）

```bash
# develop を別ディレクトリにチェックアウト
git worktree add ../claude-code-pipe-develop develop

# 普段は develop で作業
cd ../claude-code-pipe-develop

# main への同期が必要な時だけ
npm run sync-to-main  # これが元の main ディレクトリを操作
```

### 3. GitHub のデフォルトブランチ設定

GitHub の Settings → Branches → Default branch を `main` に設定。

### 4. スクリプトの動作確認

develop ブランチでスクリプトを実行し、正しく同期されるか確認。

## 学び

### 1. 自動化の価値

- 手作業での同期は「何を含めるか」の判断ミスが発生しやすい
- スクリプト化することで、同期対象が明示的に管理される
- コードレビューできる形で同期ロジックが残る

### 2. シンプルさの追求

- `scripts/start-tmux.js` を除外する判断は、「利用者にとって本当に必要か？」を問い直す良い機会
- 基本は `npm run dev` で十分、というシンプルな使い方を推奨

### 3. Node.js スクリプトの柔軟性

- シェルスクリプトよりも複雑なロジックが書きやすい
- JSON 操作が簡単
- カラフルな出力でユーザー体験が向上

### 4. git worktree の有効性

- develop と main を物理的に分離できる
- ブランチ切り替え不要で作業効率が上がる
- コーディングエージェントも混乱しない

## 関連ドキュメント

### 関連ノート

- [ブランチ戦略再転換の方針](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)

---

**最終更新**: 2026-03-13
**作成者**: Claude Code (AI)
