---
tags: [security, secretlint, gitleaks, pre-commit, setup]
---

# セキュリティチェック（secretlint + gitleaks）導入 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: シークレットスキャン導入（secretlint + gitleaks）

## 問題

AI協働開発では、以下のリスクが存在する：

- AI がドキュメントを書く際、動作確認時の認証情報が混入するリスク
- `docs/notes` に経緯を残す運用では、curl例やAPI設定メモに本物の認証情報が紛れやすい
- プライベートリポジトリでも「見えにくい」だけで「安全」ではない

このため、コミット前に自動的にシークレットをスキャンする仕組みが必要だった。

## 試行錯誤

### 導入パターンの選択

`1ft-seabass/my-ai-collaboration-patterns` リポジトリの `patterns/setup-pattern/setup_securecheck` パターンを採用。

**取得コマンド**:
```bash
npx degit 1ft-seabass/my-ai-collaboration-patterns/patterns/setup-pattern/setup_securecheck ./tmp/security-setup
```

ウィザード形式で段階的に導入を進めた。

### Phase 0: ヘルスチェック

**実行内容**:
```bash
node tmp/security-setup/templates/scripts/security-verify.js
```

**結果**: 2/11 passed - ほぼ未導入の状態を確認

### Phase 1: 初動スキャン（現状把握）

**実施項目**:

1. **設定ファイルのコピー**:
   ```bash
   cp tmp/security-setup/templates/.secretlintrc.json .
   cp tmp/security-setup/templates/gitleaks.toml .
   ```

2. **secretlint のインストール**:
   ```bash
   npm install -D secretlint @secretlint/secretlint-rule-preset-recommend
   ```

3. **初回スキャン**:
   ```bash
   npx secretlint "**/*"
   ```
   - 結果: 検出なし ✅

4. **gitleaks のインストール**:
   ```bash
   node tmp/security-setup/templates/scripts/install-gitleaks.js
   ```
   - Linux x64 用 gitleaks v8.30.0 を `./bin/` にダウンロード

5. **gitleaks で初回スキャン**:
   ```bash
   ./bin/gitleaks detect --source . -v --config gitleaks.toml
   ```
   - 結果: 検出なし（1 commit をスキャン）✅

### Phase 2: 手動運用（npm scripts）

**実施項目**:

1. **package.json に scripts を追加**:
   ```json
   {
     "scripts": {
       "security:verify": "node scripts/security-verify.js",
       "security:verify:simple": "node scripts/security-verify.js --simple",
       "security:verify:testrun": "node scripts/security-verify.js --test-run",
       "security:install-gitleaks": "node scripts/install-gitleaks.js",
       "secret-scan": "secretlint \"**/*\"",
       "secret-scan:full": "secretlint \"**/*\" && ./bin/gitleaks detect --source . -v --config gitleaks.toml"
     }
   }
   ```

2. **スクリプトファイルのコピー**:
   ```bash
   mkdir -p scripts
   cp tmp/security-setup/templates/scripts/security-verify.js scripts/
   cp tmp/security-setup/templates/scripts/install-gitleaks.js scripts/
   ```

3. **動作確認**:
   - `npm run security:verify` → 8/11 passed
   - `npm run secret-scan` → 検出なし ✅
   - `npm run secret-scan:full` → 検出なし ✅

### Phase 3: pre-commit 強制（チーム全員）

**選択理由**: チーム開発を想定し、全員が同じルールを守れるように Phase 3 を選択。

**実施項目**:

1. **lint-staged 設定を追加**:
   ```json
   {
     "lint-staged": {
       "*": ["secretlint"]
     }
   }
   ```

2. **husky のインストールと初期化**:
   ```bash
   npm install -D husky
   npx husky init
   ```

3. **pre-commit フックの設定**:
   ```bash
   cp tmp/security-setup/templates/scripts/pre-commit.js scripts/
   ```

   `.husky/pre-commit` を編集:
   ```bash
   #!/bin/sh
   node scripts/pre-commit.js
   ```

4. **.gitignore の更新**:
   ```gitignore
   # gitleaks binary (large binary file)
   bin/gitleaks
   bin/gitleaks.exe
   ```

   **注**: Phase 3 では `.husky/` はコミットして共有する（.gitignore に追加しない）

5. **動作確認**:
   ```bash
   git add .
   git commit -m "test: pre-commit hook"
   ```

   **結果**: ✅ 成功
   - lint-staged (secretlint) が49ファイルをスキャン
   - gitleaks が266.79 KB をスキャン
   - 検出なし - コミット成功

6. **最終確認**:
   ```bash
   npm run security:verify:testrun
   ```
   - 結果: 10/11 passed（実質的には完璧）

## 解決策

### ツール構成

| ツール | 役割 | 得意領域 |
|--------|------|----------|
| **secretlint** | メイン検出エンジン | クラウドサービス特化、Node.js親和、精密検出 |
| **gitleaks** | メイン検出エンジン | 高速、entropy検出、git履歴スキャン |
| **husky** | git hooks 管理 | npm で hooks を共有可能に |
| **lint-staged** | staged ファイル限定実行 | 差分だけ高速チェック |

**二重チェック体制**: secretlint と gitleaks の両方を使うことで、より確実にシークレットを検出。

### 導入されたファイル

**設定ファイル**:
- `.secretlintrc.json` - secretlint 設定
- `gitleaks.toml` - gitleaks 設定（`tmp/` ディレクトリは除外済み）
- `.husky/pre-commit` - pre-commit フック
- `scripts/security-verify.js` - ヘルスチェックスクリプト
- `scripts/pre-commit.js` - pre-commit 実行スクリプト
- `scripts/install-gitleaks.js` - gitleaks インストーラー

**package.json の変更**:
- セキュリティ関連の npm scripts を追加
- lint-staged 設定を追加
- husky の prepare スクリプトが自動追加

**.gitignore の変更**:
- `bin/gitleaks` と `bin/gitleaks.exe` を除外

### 自動化の仕組み

**pre-commit フックの動作**:
1. `git commit` 実行
2. `.husky/pre-commit` が `node scripts/pre-commit.js` を実行
3. `pre-commit.js` が以下を順次実行:
   - `lint-staged` (secretlint) - staged ファイルのみスキャン
   - `gitleaks detect` - staged ファイルをスキャン
4. 検出があればコミット失敗、なければコミット成功

## 主なポイント

1. **段階的導入**: Phase 0 → 1 → 2 → 3 と段階的に進めることで、各ステップで確認しながら導入
2. **二重チェック**: secretlint と gitleaks 両方を使うことで検出精度向上
3. **チーム全体で共有**: `.husky/` をコミットすることで、`npm install` 後に全員の環境で自動有効化
4. **軽量スキャン**: lint-staged により staged ファイルのみスキャンすることで高速化

## 利用可能なコマンド

### 手動スキャン
```bash
npm run secret-scan              # secretlint のみ
npm run secret-scan:full         # secretlint + gitleaks
```

### ヘルスチェック
```bash
npm run security:verify          # 設定確認
npm run security:verify:simple   # 軽量テスト
npm run security:verify:testrun  # フルテスト（全ファイル + 全履歴）
```

### gitleaks 再インストール
```bash
npm run security:install-gitleaks
```

## 学び

1. **ウィザード形式の有効性**: ステップバイステップで進めることで、問題発生時に切り戻しやすい
2. **Phase の選択**: チーム開発なら Phase 3、個人開発なら Phase 4、手動運用なら Phase 2 で止めることも可能
3. **git 履歴もスキャン**: gitleaks はファイルを削除しても過去のコミットから検出可能
4. **除外設定の重要性**: `tmp/` ディレクトリは `gitleaks.toml` の allowlist で最初から除外されている

## 検出時の対応フロー

シークレットが検出された場合：

1. **トークンを無効化（最優先）**:
   - API キーの再発行、トークンの削除、パスワードの変更
   - **理由**: git 履歴に残っているため、ファイルを直しても過去のコミットから取得可能

2. **ファイルを修正**:
   - プレースホルダーの場合: `.secretlintrc.json` の `ignores` に追加
   - サンプル/ダミー値: 明確なダミーに変更
   - false positive: allowlist に追加

3. **git 履歴から削除（必要な場合）**:
   - BFG Repo-Cleaner または git filter-branch を使用
   - **警告**: 履歴書き換えは強制プッシュが必要

## 今後の改善案

- 定期的に `npm run security:verify:testrun` を実行して動作確認
- false positive が多い場合は `.secretlintrc.json` や `gitleaks.toml` を調整
- チームメンバーに導入内容を共有し、検出時の対応フローを周知

## 関連ドキュメント

- [.secretlintrc.json](../../.secretlintrc.json) - secretlint 設定
- [gitleaks.toml](../../gitleaks.toml) - gitleaks 設定
- [scripts/security-verify.js](../../scripts/security-verify.js) - ヘルスチェック
- [scripts/pre-commit.js](../../scripts/pre-commit.js) - pre-commit スクリプト

## 参考リンク

- [1ft-seabass/my-ai-collaboration-patterns](https://github.com/1ft-seabass/my-ai-collaboration-patterns)
- [patterns/setup-pattern/setup_securecheck](https://github.com/1ft-seabass/my-ai-collaboration-patterns/tree/main/patterns/setup-pattern/setup_securecheck)
- [secretlint](https://github.com/secretlint/secretlint)
- [gitleaks](https://github.com/gitleaks/gitleaks)
- [husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)

---

**最終更新**: 2026-02-23
**作成者**: AI (Claude Sonnet 4.5)
