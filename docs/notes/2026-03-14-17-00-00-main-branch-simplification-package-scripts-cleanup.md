---
tags: [sync-script, package-json, branch-strategy, cleanup, main-branch]
---

# main ブランチの package.json 簡素化 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-14
**関連タスク**: main ブランチの利用者向けシンプル化

## 問題

develop/main の2ブランチ運用において、main ブランチには `scripts/` フォルダが同期されないため、開発用の npm スクリプトが実行できない状態になっていた。

### 発見の経緯

ユーザーが develop から main への精査を行っている際に、main ブランチの package.json に以下の問題を発見:

1. **実行不可能なスクリプト**: `scripts/` フォルダがないため、以下のスクリプトが実行できない
   - `dev:tmux:*` 系（start-tmux.js を参照）
   - `security:verify*` 系（security-verify.js を参照）
   - `commit-main`（commit-main.js を参照）

2. **README の不整合**: tmux に関する記述があるが、main ブランチでは tmux スクリプトが使えない

### 問題の本質

**main ブランチの目的**:
- 利用者向けのシンプルなブランチ
- `npm start` または `npm run dev` だけで起動できる

**develop ブランチの目的**:
- 開発者向けの完全な環境
- 開発ツール（tmux、sync-to-main、commit-main など）を含む

main ブランチに開発用スクリプトが残っていることは、この目的に反している。

## 解決策

### 実装1: sync-to-main.js の cleanPackageJson() を強化

**実装場所**: `scripts/sync-to-main.js:220-249`

#### 修正前

```javascript
// 開発用スクリプトを削除
if (pkg.scripts) {
  const scriptsToRemove = [
    'prepare',           // husky
    'sync-to-main',      // このスクリプト自体
  ];

  scriptsToRemove.forEach(script => {
    if (pkg.scripts[script]) {
      log(`   Removing script: ${script}`, 'cyan');
      delete pkg.scripts[script];
    }
  });

  // husky, secretlint, gitleaks 関連のスクリプトを削除
  Object.keys(pkg.scripts).forEach(key => {
    if (key.includes('husky') || key.includes('secretlint') || key.includes('gitleaks')) {
      log(`   Removing script: ${key}`, 'cyan');
      delete pkg.scripts[key];
    }
  });
}
```

#### 修正後

```javascript
// 開発用スクリプトを削除
if (pkg.scripts) {
  const scriptsToRemove = [
    'prepare',           // husky
    'sync-to-main',      // このスクリプト自体
    'commit-main',       // 開発用コミットウィザード
  ];

  scriptsToRemove.forEach(script => {
    if (pkg.scripts[script]) {
      log(`   Removing script: ${script}`, 'cyan');
      delete pkg.scripts[script];
    }
  });

  // 開発用スクリプトのパターンで削除
  Object.keys(pkg.scripts).forEach(key => {
    // husky, secretlint, gitleaks, security, tmux 関連のスクリプトを削除
    if (
      key.includes('husky') ||
      key.includes('secretlint') ||
      key.includes('gitleaks') ||
      key.startsWith('security:') ||
      key.startsWith('dev:tmux:')
    ) {
      log(`   Removing script: ${key}`, 'cyan');
      delete pkg.scripts[key];
    }
  });
}
```

#### 主な変更点

1. **commit-main を明示的に削除**: 開発用ウィザードツールのため
2. **security:* を削除**: scripts フォルダがないため実行不可
3. **dev:tmux:* を削除**: scripts フォルダがないため実行不可
4. **パターンマッチング強化**: `includes()` と `startsWith()` を組み合わせて柔軟に対応

### 実装2: README.md から tmux の記述を削除

**実装場所**: `README.md:37`

#### 修正前

```markdown
- **Watch Mode**: Monitor Claude Code session files and extract structured data
- **Send Mode**: Send prompts to Claude Code via REST API (creates `claude -p` processes)
- **Cancel Mode**: Cancel running sessions programmatically
- **Webhook Distribution**: Send session events to external services (e.g., Node-RED, Slack)
- **Process Management**: Persistent session management with tmux
```

#### 修正後

```markdown
- **Watch Mode**: Monitor Claude Code session files and extract structured data
- **Send Mode**: Send prompts to Claude Code via REST API (creates `claude -p` processes)
- **Cancel Mode**: Cancel running sessions programmatically
- **Webhook Distribution**: Send session events to external services (e.g., Node-RED, Slack)
```

#### 理由

- main ブランチには tmux 起動スクリプトがない
- tmux は開発者が独自に設定できる
- 利用者向けには不要な情報

### 実装3: README-ja.md から tmux の記述を削除

**実装場所**: `README-ja.md:37`

#### 修正前

```markdown
- **Watch Mode**: Claude Code のセッションファイルを監視し、構造化されたデータを抽出
- **Send Mode**: REST API 経由で Claude Code にプロンプトを送信（`claude -p` プロセスを作成）
- **Cancel Mode**: 実行中のセッションをプログラムからキャンセル
- **Webhook 配信**: セッションイベントを外部サービス（Node-RED、Slack など）に送信
- **プロセス管理**: tmux による永続化セッション管理
```

#### 修正後

```markdown
- **Watch Mode**: Claude Code のセッションファイルを監視し、構造化されたデータを抽出
- **Send Mode**: REST API 経由で Claude Code にプロンプトを送信（`claude -p` プロセスを作成）
- **Cancel Mode**: 実行中のセッションをプログラムからキャンセル
- **Webhook 配信**: セッションイベントを外部サービス（Node-RED、Slack など）に送信
```

## 修正後の main ブランチ

### package.json に残るスクリプト

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js"
  }
}
```

### 削除されるスクリプト

- `prepare`: husky のセットアップ（開発環境のみ必要）
- `sync-to-main`: develop → main の同期ツール（開発環境のみ必要）
- `commit-main`: main ブランチ用コミットウィザード（開発環境のみ必要）
- `dev:tmux:start`: tmux セッション起動
- `dev:tmux:stop`: tmux セッション停止
- `dev:tmux:restart`: tmux セッション再起動
- `dev:tmux:status`: tmux セッション状態確認
- `dev:tmux:logs`: tmux ログ表示
- `dev:tmux:logs:realtime`: tmux リアルタイムログ
- `security:verify`: セキュリティスキャン
- `security:verify:full`: 完全セキュリティスキャン
- その他 husky、secretlint、gitleaks 関連

## 学び

### 設計の学び

1. **ブランチごとの役割を明確にする**
   - main = 利用者向け（シンプル、最小限の依存）
   - develop = 開発者向け（ツール完備、開発効率重視）

2. **同期スクリプトでフィルタリングする**
   - ファイルだけでなく、package.json の内容も調整する
   - 環境ごとに不要なスクリプトを削除する

3. **ドキュメントとコードの一貫性**
   - README に書かれた機能は、実際に使えるべき
   - 使えない機能は記載しない

### パターンマッチングの学び

1. **`includes()` vs `startsWith()`**
   - `includes()`: 部分一致（例: `secretlint` を含むすべて）
   - `startsWith()`: 前方一致（例: `dev:tmux:*` を削除）

2. **柔軟な削除ロジック**
   - 明示的リスト + パターンマッチングの組み合わせ
   - 将来的に追加されるスクリプトにも対応

## 今後の改善案

### 改善案1: DEVELOP.md の作成

開発者向けの情報を別ドキュメントにまとめる:

```markdown
# DEVELOP.md

## 開発環境のセットアップ

### tmux での起動

npm run dev:tmux:start

### 同期とデプロイ

npm run sync-to-main
npm run commit-main
```

**メリット**:
- README はシンプルに保つ
- 開発者向け情報を集約
- develop ブランチのみに存在（main には同期しない）

### 改善案2: package.json のバリデーション

sync-to-main.js に検証機能を追加:

```javascript
function validateCleanedPackageJson(pkg) {
  const developOnlyScripts = ['prepare', 'sync-to-main', 'commit-main'];
  const foundScripts = Object.keys(pkg.scripts).filter(key =>
    developOnlyScripts.includes(key) ||
    key.startsWith('dev:tmux:') ||
    key.startsWith('security:')
  );

  if (foundScripts.length > 0) {
    log(`⚠️  Warning: Found develop-only scripts in cleaned package.json:`, 'yellow');
    foundScripts.forEach(script => log(`   - ${script}`, 'yellow'));
  }
}
```

### 改善案3: 自動テスト

main ブランチの package.json に不要なスクリプトが残っていないか自動チェック:

```bash
# CI/CD で実行
node scripts/validate-main-branch.js
```

## 関連ドキュメント

- [sync-to-main worktree 対応の実装記録](./2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装記録](./2026-03-14-14-00-00-commit-main-wizard-implementation.md)
- [前回の申し送り](../letters/2026-03-14-16-00-00-webhook-git-info-and-commit-wizard-test.md)

---

**最終更新**: 2026-03-14
**作成者**: Claude Code (AI)
