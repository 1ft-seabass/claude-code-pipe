# シークレットスキャン導入ガイド（ウィザード形式）

**このドキュメントは AI が読み、人間にウィザード形式で案内するための手順書です。**

---

## 🤖 AI への重要な指示

### ウィザード開始時に必ず実行すること

**ステップ1: 全体の流れを提示**

以下のチェックボックスリストをそのまま表示してください:

```
これから以下の流れでセキュリティチェックを導入します：

□ Phase 0: ヘルスチェック（既存設定の確認）
□ Phase 1: 初動スキャン（secretlint + gitleaks で現状把握）
□ Phase 2: 手動運用（npm scripts の追加）
□ Phase 3 または 4: pre-commit 自動化（確認してから進めます）

**重要なルール**:
- AI: コマンドを実行する（1コマンドずつ）
- AI: 実行結果を報告する
- AI: 次のステップを提案する
- ユーザー: 重要な判断時のみ確認する

進めてよろしいですか？「はい」と返信していただければ Phase 0 から開始します。
```

**ステップ2: ユーザーの返信を待つ**

ユーザーが「はい」「進めて」等と返信するまで、Phase 0 を開始しないでください。

**ステップ3: コマンド実行と結果報告のルール**

各 Phase で AI がコマンドを実行し、結果を報告して次の対応を提案します：

- ✅ 良い例:
  1. AIがコマンドを実行
  2. 「実行結果: ○○でした」と報告
  3. 「次は△△を行います」と次のステップを提案
  4. ユーザーの確認を待つ（重要な判断が必要な場合）

- ❌ 悪い例: ユーザーの返信を待たずに複数コマンドを連続実行
- ❌ 悪い例: 結果を報告せずに次のコマンドを実行

**重要**:
- 各ステップは1コマンド単位で実行
- 必ず結果を報告してから次へ進む
- 重要な判断（Phase選択、検出時の対応等）はユーザーに確認

---

## 📋 前提条件

このウィザードは以下を前提としています：

- **Node.js プロジェクト**（package.json が存在する）
- **git リポジトリ**（.git が存在する）
- **`!` コマンド実行が可能な環境**（Claude Code, Cursor 等）または手動実行

---

## 🎯 導入の全体像

| Phase | 内容 | ここで止めてもOK？ |
|-------|------|------------------|
| **Phase 0** | ヘルスチェック（既存設定の確認） | ✅ 10/10 なら完了 |
| **Phase 1** | 初動スキャン（現状把握） | ✅ 問題発見したらまず対処 |
| **Phase 2** | 手動運用（npm scripts） | ✅ ライトに運用したい場合 |
| **Phase 3** | pre-commit 強制（チーム全員） | ✅ チーム開発の場合 |
| **Phase 4** | pre-commit 強制（個人用） | ✅ 個人開発の場合 |

---

## 📚 背景とツール構成

### なぜセキュリティチェックが必要か

- AI がドキュメントを書く際、動作確認時の認証情報が混入するリスクがある
- `docs/notes` に経緯を残す運用では、curl例やAPI設定メモに本物が紛れやすい
- プライベートリポジトリでも「見えにくい」だけで「安全」ではない

### ツール構成

| ツール | 役割 | 得意領域 |
|--------|------|----------|
| **secretlint** | メイン検出エンジン | クラウドサービス特化、Node.js親和、精密検出 |
| **gitleaks** | メイン検出エンジン | 高速、entropy検出、git履歴スキャン |
| **husky** | git hooks 管理 | npm で hooks を共有可能に（Phase 3/4） |
| **lint-staged** | staged ファイル限定実行 | 差分だけ高速チェック（Phase 3/4） |

**二重チェック体制**: secretlint と gitleaks の両方を使うことで、より確実にシークレットを検出します。

---

# Phase 0: ヘルスチェック（既存設定の確認）

**目的**: 既にセキュリティチェックが導入されているか確認する

---

## ステップ 0.1: ヘルスチェックを実行

以下のコマンドを実行してください：

```bash
node tmp/security-setup/templates/scripts/security-verify.js
```

### 結果の判断基準

| 結果 | 対応 |
|------|------|
| **10/10 passed** | ✅ 完璧！Phase 1-4 はスキップして終了 |
| **9/10 passed（gitleaks のみ ❌）** | ⚠️ gitleaks をインストールすれば完了（Phase 1.4 へ） |
| **複数の ❌ がある** | 🔧 Phase 1 から導入を開始 |
| **全て ❌** | 🆕 未導入。Phase 1 から導入を開始 |

**10/10 の場合**: おめでとうございます！設定は完璧です。
- `npm run security:verify:simple` - staged ファイルのみテスト（軽量）
- `npm run security:verify:testrun` - 全ファイル + 全履歴テスト（重い）

**それ以外の場合**: Phase 1 から順に導入していきましょう。

---

## Phase 0 完了

既存設定の確認が完了しました。結果に応じて次のステップに進みます。

---

# Phase 1: 初動スキャン（現状把握）

**目的**: いきなり自動化せず、まず何が検出されるか確認する

---

## ステップ 1.1: テンプレートファイルをコピー

以下のコマンドを実行してください：

```bash
cp tmp/security-setup/templates/.secretlintrc.json .
cp tmp/security-setup/templates/gitleaks.toml .
```

これで以下が配置されます：
- `.secretlintrc.json` - secretlint 設定
- `gitleaks.toml` - gitleaks 設定

---

## ステップ 1.2: secretlint をインストール

以下のコマンドを実行してください：

```bash
npm install -D secretlint @secretlint/secretlint-rule-preset-recommend
```

---

## ステップ 1.3: secretlint で初回スキャン

以下のコマンドを実行してください：

```bash
npx secretlint "**/*"
```

### 結果の判断基準

| 状況 | 対応 |
|------|------|
| **本物のシークレット** | ⚠️ **即座に無効化（トークン再発行）** → ファイル修正 |
| **プレースホルダー**（YOUR_API_KEY等） | `.secretlintrc.json` の `ignores` に追加 |
| **サンプル/ダミー値** | 値を明確なダミーに変更、または allowlist 追加 |
| **false positive** | `.secretlintrc.json` の `ignores` に追加 |

**重要**: ファイル修正より**先にトークン側を無効化**する。ファイルを直しても git 履歴に残っている。

**検出があった場合**: 内容を確認して、必要に応じて対処してから次に進みます。

---

## ステップ 1.4: gitleaks のインストール（必須）

以下のコマンドを実行してください：

```bash
node tmp/security-setup/templates/scripts/install-gitleaks.js
```

このスクリプトは OS を自動判定して gitleaks バイナリを `./bin/` にダウンロードします。

**Windows/macOS/Linux すべて対応**しています。

**重要**: gitleaks は secretlint と並ぶメイン検出エンジンです。必ずインストールしてください。

---

## ステップ 1.5: gitleaks で初回スキャン

以下のコマンドを実行してください：

```bash
./bin/gitleaks detect --source . -v --config gitleaks.toml
```

**Windows の場合**:
```bash
.\bin\gitleaks.exe detect --source . -v --config gitleaks.toml
```

**gitleaks の動作について**:
- **git 履歴全体をスキャン**します（現在のファイルだけでなく、過去のコミットも含む）
- ファイルを削除しても、過去のコミットに残っていれば検出されます
- `tmp/` ディレクトリは最初から除外されています（`gitleaks.toml` の allowlist に含まれています）

**検出があった場合**: secretlint と同様に内容を確認して対処します。

---

## Phase 1 完了

ここまでで現状把握が完了しました。

**Phase 1 で止める場合**: 手動でスキャンを走らせる運用も可能です。

**Phase 2 に進む場合**: 続けて npm scripts を追加します。

---

# Phase 2: 手動運用（npm scripts）

**目的**: npm scripts で手動スキャンを簡単に実行できるようにする

---

## ステップ 2.1: package.json に scripts を追加

`tmp/security-setup/templates/package.json.example` の内容を確認し、以下の scripts を既存の `package.json` に追加してください：

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

**注**: 既存の scripts とマージしてください（上書きではなく追加）。

---

## ステップ 2.2: スクリプトファイルをコピー

以下のコマンドを実行してください：

```bash
cp tmp/security-setup/templates/scripts/security-verify.js scripts/
cp tmp/security-setup/templates/scripts/install-gitleaks.js scripts/
```

これで以下が `scripts/` に配置されます：
- `security-verify.js` - ヘルスチェック + テストラン
- `install-gitleaks.js` - gitleaks インストーラー

---

## ステップ 2.3: ヘルスチェックを実行

以下のコマンドを実行してください：

```bash
npm run security:verify
```

**期待する結果**: 10 項目のヘルスチェックが実行され、✅ または ⚠️ が表示されます。

---

## ステップ 2.4: テストラン（実際のスキャン）

**シンプルテスト**（staged ファイルのみ、軽量）:

```bash
npm run security:verify:simple
```

**フルテスト**（全ファイル + 全履歴、重い）:

```bash
npm run security:verify:testrun
```

**期待する結果**:
- ヘルスチェック完了（10/10 ✅）
- simple: staged ファイルのみスキャン（pre-commit相当）
- testrun: secretlint で全ファイルスキャン + gitleaks で全履歴スキャン
- 検出があれば詳細表示

---

## Phase 2 完了

ここまでで以下が可能になりました：

- `npm run secret-scan` - secretlint で全ファイルスキャン
- `npm run secret-scan:full` - secretlint + gitleaks で全スキャン
- `npm run security:verify` - 設定のヘルスチェック
- `npm run security:verify:simple` - ヘルスチェック + staged ファイルスキャン（軽量）
- `npm run security:verify:testrun` - ヘルスチェック + 全ファイル + 全履歴スキャン（重い）

**Phase 2 で止める場合**: コミット前に手動で `npm run secret-scan` を走らせる運用です。ピュアなコミット履歴を保ちたい場合に適しています。

**Phase 3 または 4 に進む場合**: pre-commit フックで自動化します。

---

# Phase 3 vs Phase 4 の選択

**ここで人間に確認してください**:

## Phase 3: pre-commit 強制（チーム全員）

- **対象**: チーム全員がセキュリティチェックを強制される
- **.husky/ をコミット**: Git で共有し、全員の環境で自動実行
- **適している**: チーム開発、全員で同じルールを守りたい場合

## Phase 4: pre-commit 強制（個人用）

- **対象**: 自分だけセキュリティチェックを使う
- **.husky/ を .gitignore**: 自分のローカルのみで動作
- **適している**: 個人開発、または「自分だけ使いたい」場合

**どちらを選びますか？** Phase 3 / Phase 4

---

# Phase 3: pre-commit 強制（チーム全員）

---

## ステップ 3.1: lint-staged をインストール

以下のコマンドを実行してください：

```bash
npm install -D lint-staged
```

---

## ステップ 3.2: package.json に lint-staged 設定を追加

既存の `package.json` に以下を追加してください：

```json
{
  "lint-staged": {
    "*": ["secretlint"]
  }
}
```

---

## ステップ 3.3: husky をインストール

以下のコマンドを実行してください：

```bash
npm install -D husky
npx husky init
```

---

## ステップ 3.4: pre-commit フックをコピー

以下のコマンドを実行してください：

```bash
cp tmp/security-setup/templates/scripts/pre-commit.js scripts/
```

`.husky/pre-commit` を編集して、以下の内容に置き換えてください：

```bash
#!/bin/sh
node scripts/pre-commit.js
```

---

## ステップ 3.5: .gitignore を更新

`tmp/security-setup/templates/gitignore.example` の内容を確認し、以下を既存の `.gitignore` に追加してください：

```gitignore
# gitleaks binary (large binary file)
bin/gitleaks
bin/gitleaks.exe
```

**注**: Phase 3 では `.husky/` は**コミットする**ため、.gitignore に追加**しません**。

---

## ステップ 3.6: 動作確認

以下のコマンドを実行してください：

```bash
git add .
git commit -m "test: pre-commit hook"
```

**期待する結果**:
- lint-staged (secretlint) が実行される
- gitleaks が実行される
- 問題なければコミット成功
- 検出があればコミット失敗

**テストコミットなので、コミットを取り消してもOKです**：

```bash
git reset HEAD~1
```

---

## ステップ 3.7: 最終確認

以下のコマンドを実行してください：

```bash
npm run security:verify:testrun
```

**全て ✅ なら Phase 3 完了です！**

---

## Phase 3 完了

セキュリティチェックが pre-commit フックで自動実行されるようになりました。

**チーム全員に共有**: `.husky/` がコミットされているため、`npm install` 後に全員の環境で自動的に有効化されます。

---

# Phase 4: pre-commit 強制（個人用）

---

## ステップ 4.1: lint-staged をインストール

以下のコマンドを実行してください：

```bash
npm install -D lint-staged
```

---

## ステップ 4.2: package.json に lint-staged 設定を追加

既存の `package.json` に以下を追加してください：

```json
{
  "lint-staged": {
    "*": ["secretlint"]
  }
}
```

---

## ステップ 4.3: husky をインストール

以下のコマンドを実行してください：

```bash
npm install -D husky
npx husky init
```

---

## ステップ 4.4: pre-commit フックをコピー

以下のコマンドを実行してください：

```bash
cp tmp/security-setup/templates/scripts/pre-commit.js scripts/
```

`.husky/pre-commit` を編集して、以下の内容に置き換えてください：

```bash
#!/bin/sh
node scripts/pre-commit.js
```

---

## ステップ 4.5: .gitignore を更新

`tmp/security-setup/templates/gitignore.example` の内容を確認し、以下を既存の `.gitignore` に追加してください：

```gitignore
# gitleaks binary (large binary file)
bin/gitleaks
bin/gitleaks.exe

# Phase 4（個人用）の場合のみ以下を追加:
.husky/
```

**注**: Phase 4 では `.husky/` を **.gitignore に追加**します。自分のローカルのみで動作します。

---

## ステップ 4.6: 動作確認

以下のコマンドを実行してください：

```bash
git add .
git commit -m "test: pre-commit hook"
```

**期待する結果**:
- lint-staged (secretlint) が実行される
- gitleaks が実行される
- 問題なければコミット成功
- 検出があればコミット失敗

**テストコミットなので、コミットを取り消してもOKです**：

```bash
git reset HEAD~1
```

---

## ステップ 4.7: 最終確認

以下のコマンドを実行してください：

```bash
npm run security:verify:testrun
```

**全て ✅ なら Phase 4 完了です！**

---

## Phase 4 完了

セキュリティチェックが pre-commit フックで自動実行されるようになりました。

**個人用**: `.husky/` が .gitignore に追加されているため、自分のローカルのみで動作します。

---

# 検出時の対応フロー

シークレットが検出された場合の対応手順：

## 1. トークンを無効化（最優先）

**ファイル修正より先に、トークン側を無効化してください。**

- API キーの再発行
- トークンの削除
- パスワードの変更

**理由**: git 履歴に残っているため、ファイルを直しても過去のコミットから取得可能。

---

## 2. ファイルを修正

以下のいずれかの方法で対処：

### パターンA: allowlist に追加（プレースホルダーの場合）

`.secretlintrc.json` に `ignores` を追加：

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend"
    }
  ],
  "ignores": [
    "**/YOUR_API_KEY_HERE"
  ]
}
```

`gitleaks.toml` に `allowlist` を追加：

```toml
[allowlist]
paths = [
    '''docs/examples/.*'''
]

regexes = [
    '''YOUR_TOKEN_HERE''',
    '''EXAMPLE_API_KEY'''
]
```

---

### パターンB: 値を明確なダミーに変更

```bash
# Before
API_KEY=sk-1234567890abcdef

# After
API_KEY=sk-DUMMY_KEY_REPLACE_WITH_YOUR_ACTUAL_KEY
```

---

## 3. git 履歴から削除（必要な場合）

**本物のシークレットがコミット済みの場合**、履歴から削除する必要があります。

### 方法A: BFG Repo-Cleaner（推奨）

```bash
# BFG のインストール（https://rtyley.github.io/bfg-repo-cleaner/）
brew install bfg  # macOS
# または jar を直接ダウンロード

# シークレットを含むファイルを削除
bfg --delete-files secrets.txt

# または特定の文字列を置換
bfg --replace-text passwords.txt

# git 履歴を書き換え
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 方法B: git filter-branch

```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/secrets.txt" \
  --prune-empty --tag-name-filter cat -- --all

git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

**警告**: 履歴書き換えは**強制プッシュが必要**になります。チーム開発の場合は注意してください。

---

## 4. リモートに強制プッシュ（履歴書き換えした場合）

```bash
git push origin --force --all
git push origin --force --tags
```

**チームメンバーに通知**: 全員が re-clone または reset が必要です。

---

# よくある検出パターンと対処

| 検出内容 | 判断 | 対処 |
|---------|------|------|
| `aws_access_key_id = AKIAIOSFODNN7EXAMPLE` | サンプル | allowlist 追加 |
| `password: "test1234"` | ダミー（明らかに弱い） | そのままでOK or 明確なダミーに変更 |
| `token: "ghp_xxxxxxxxxxxxxxxxxxxx"` | 本物の GitHub PAT | ⚠️ **即座に無効化** |
| `YOUR_API_KEY_HERE` | プレースホルダー | allowlist 追加 |
| `mongodb://localhost:27017` | ローカル接続 | allowlist 追加 or そのまま |
| `SECRET=xxxxxxxx` | 不明 | 確認が必要 |

---

# トラブルシューティング

## gitleaks がインストールできない

**症状**: `install-gitleaks.js` でエラー

**対処**:
1. プラットフォームが対応しているか確認（Windows x64, macOS x64/arm64, Linux x64/arm64）
2. ネットワーク接続を確認
3. 手動でインストール: https://github.com/gitleaks/gitleaks/releases

---

## pre-commit が動かない

**症状**: コミットしても secretlint が実行されない

**対処**:
1. `.husky/pre-commit` が存在するか確認
2. `.husky/pre-commit` が実行可能か確認（`chmod +x .husky/pre-commit`）
3. `npm run security:verify` でヘルスチェック

---

## secretlint の false positive が多い

**症状**: 明らかに問題ないのに検出される

**対処**:
1. `.secretlintrc.json` の `ignores` に追加
2. `@secretlint/secretlint-rule-pattern` でカスタムルールを追加
3. 特定のディレクトリを除外（`docs/examples/**` 等）

---

# セキュリティチェック完了！

導入が完了しました。以下のコマンドでいつでも確認できます：

```bash
# ヘルスチェック
npm run security:verify

# ヘルスチェック + 実際のスキャン
npm run security:verify:testrun

# 手動スキャン
npm run secret-scan
npm run secret-scan:full
```

**重要**: 定期的に `npm run security:verify:testrun` を実行して、設定が正しく動作しているか確認してください。

---

## クリーンアップ（任意）

ウィザード導入に使用した `tmp/security-setup/` ディレクトリは、導入完了後は不要です。

以下のコマンドで削除できます：

```bash
rm -rf tmp/security-setup/
```

**注**: 削除しても問題ありません。再度ヘルスチェックが必要な場合は、`npx degit` で再取得できます。
