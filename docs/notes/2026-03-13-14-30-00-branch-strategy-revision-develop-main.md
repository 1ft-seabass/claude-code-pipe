---
tags: [branch-strategy, repository-management, development-environment, user-experience]
---

# ブランチ戦略再転換: develop/main 2ブランチ体制へ - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-13
**関連タスク**: コーディングエージェントの誤解問題とブランチ戦略の再設計

## 問題

### 現在の戦略（2月28日決定）の実害

[2026-02-28-09-45-00-repository-separation-testing-strategy.md](./2026-02-28-09-45-00-repository-separation-testing-strategy.md) で決定した「**main ブランチのみで運用**」戦略には、実際の利用で以下の問題が発生：

**🔥 コーディングエージェント（Claude Code等）が誤解する問題**:
- `docs/notes/` や `.husky/` を見て「開発中のプロジェクト」と判断
- 利用者として使いたいだけなのに、開発者モードで動作してしまう
- 開発記録の更新や husky のセットアップを提案してくる

**具体的なシナリオ**:
```
利用者: 「このプロジェクト（claude-code-pipe）を使いたい」
↓
コーディングエージェント: 「開発中のプロジェクトですね！
                          notes の更新や husky のセットアップをしましょう」
↓
利用者: 「いや、使う側なんだけど…」
```

### なぜこの問題が起きるか

**現在の main ブランチの構成**:
```
claude-code-pipe/
├── src/                    ← 本体コード
├── docs/
│   ├── notes/              ← 50以上の開発記録 🚨
│   ├── letters/            ← 申し送り 🚨
│   └── actions/            ← 開発者向けアクション 🚨
├── .husky/                 ← Git hooks 🚨
├── .secretlintrc.json      ← セキュリティツール 🚨
├── gitleaks.toml           ← セキュリティツール 🚨
├── package.json            ← devDependencies 多数 🚨
└── README.md
```

コーディングエージェントは、これらのファイル（🚨マーク）を見て：
- 「開発中のプロジェクト」
- 「開発ツールが必要」
- 「開発記録を書くべき」

と判断してしまう。

### 2月28日の戦略が失敗した理由

**当時の判断**:
> ブランチ間の同期作業が煩雑
> → main のみで運用
> → 利用者は必要なファイルだけ使う

**実際の問題**:
- ✅ テストコード分離（別リポジトリ）は成功
- ❌ 開発ツールや開発記録の存在が利用者体験を阻害
- ❌ コーディングエージェントが「利用者」と「開発者」を区別できない

## 解決策：develop/main 2ブランチ体制への再転換

### 基本方針

**develop** (開発用・フル装備):
- 開発記録（`docs/notes/`, `docs/letters/`, `docs/actions/`）
- 開発ツール（`.husky/`, `secretlint`, `gitleaks`）
- devDependencies 含む完全な package.json
- **開発者のみが使用**

**main** (公開用・軽量):
- 本体コード（`src/`）
- 利用ドキュメント（`README.md`, `DETAILS.md`）
- 最小限の設定（`config.sample.json`）
- dependencies のみの package.json
- **利用者がクローンするブランチ**

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ GitHub リポジトリ: claude-code-pipe                      │
│                                                           │
│  develop ブランチ (開発用)                                │
│  ├── src/                                                │
│  ├── docs/                                               │
│  │   ├── notes/              ← 開発記録（50以上）       │
│  │   ├── letters/            ← 申し送り                 │
│  │   └── actions/            ← 開発者向けアクション     │
│  ├── .husky/                 ← Git hooks                │
│  ├── .secretlintrc.json      ← セキュリティツール       │
│  ├── gitleaks.toml                                       │
│  ├── package.json            ← devDependencies 含む      │
│  ├── test-receiver.js        ← 簡易テストスクリプト     │
│  ├── test-cancel.sh                                      │
│  └── README.md               ← 開発者向け README         │
│                                                           │
│  main ブランチ (公開用・軽量)                             │
│  ├── src/                    ← 本体コード               │
│  ├── README.md               ← 利用者向け README         │
│  ├── DETAILS.md              ← 詳細ドキュメント         │
│  ├── config.sample.json      ← 設定サンプル             │
│  └── package.json            ← dependencies のみ        │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### デフォルトブランチ

**GitHub のデフォルトブランチ**: `main`

**理由**:
- 利用者が `git clone` した時に軽量版を取得
- GitHub で README を開いた時に利用者向けドキュメントを表示
- 開発者は明示的に `develop` をチェックアウト

### ブランチ間の同期フロー

```bash
# 開発フロー（develop で作業）
git checkout develop
# ... 開発作業 ...
git add .
git commit -m "feat: 新機能追加"
git push origin develop

# 定期的に main へ同期（必要なファイルのみ）
git checkout main
git checkout develop -- src/
git checkout develop -- README.md DETAILS.md
git checkout develop -- package.json  # 後で devDependencies を削除
# package.json から devDependencies を削除
# config.sample.json を更新
git add .
git commit -m "sync: develop からの同期 (v1.2.0)"
git push origin main
git tag v1.2.0
git push origin v1.2.0
```

## メリット

### 1. 利用者体験の向上

**main ブランチのクリーンさ**:
```
claude-code-pipe/ (main)
├── src/              ← 本体コードのみ
├── README.md         ← 利用方法
├── DETAILS.md        ← 詳細ドキュメント
├── config.sample.json
└── package.json      ← dependencies のみ
```

**コーディングエージェントの挙動**:
- ✅ 「利用するプロジェクト」として認識
- ✅ 開発記録の更新を提案しない
- ✅ husky のセットアップを提案しない
- ✅ 本体機能の利用に集中できる

### 2. 開発者体験の維持

**develop ブランチの充実**:
- ✅ すべての開発記録（docs/notes/）
- ✅ すべての開発ツール（husky, secretlint, gitleaks）
- ✅ テストスクリプト（test-receiver.js, test-cancel.sh）
- ✅ 開発者向けの詳細な情報

**開発フロー**:
```bash
# 新規開発者
git clone git@github.com:USER/claude-code-pipe.git
git checkout develop
npm install  # husky など自動セットアップ

# 既存開発者
git checkout develop
git pull origin develop
# ... 開発作業 ...
```

### 3. テストリポジトリとの併用

**変更なし**: テスターリポジトリ（`claude-code-pipe-tester-node-red`）は引き続き別リポジトリで管理

```
/home/node/workspace/repos/
├── claude-code-pipe/              ← 本体（develop/main）
└── claude-code-pipe-tester-node-red/  ← テスター（プライベート）
```

## 実装手順

### ステップ1: 現在の main を develop にリネーム

```bash
# ローカルで現在の main を develop にリネーム
git checkout main
git branch -m main develop
git push origin develop

# GitHub でデフォルトブランチを一時的に develop に設定
# （GitHub の Settings → Branches → Default branch）

# リモートの main を削除
git push origin :main
```

### ステップ2: 新しい main ブランチを作成（軽量版）

```bash
# develop から main を作成
git checkout develop
git checkout -b main

# 不要なファイルを削除
rm -rf docs/notes docs/letters docs/actions
rm -rf .husky .secretlintrc.json gitleaks.toml
rm -f test-receiver.js test-cancel.sh test-with-script.js test-without-script.js

# package.json から devDependencies を削除
# （手動で編集、または後述のスクリプトで自動化）

# README.md を利用者向けに調整
# （開発者向けの記述を削除、利用方法に集中）

git add .
git commit -m "chore: create lightweight main branch for users"
git push origin main
```

### ステップ3: GitHub でデフォルトブランチを main に設定

**GitHub の Settings → Branches → Default branch**: `main` に変更

### ステップ4: 同期スクリプトの作成（オプション）

`scripts/sync-to-main.sh` を develop ブランチに作成:

```bash
#!/bin/bash
# develop から main へ同期するスクリプト

set -e

echo "Syncing develop to main..."

# 現在のブランチを保存
CURRENT_BRANCH=$(git branch --show-current)

# develop に移動して最新化
git checkout develop
git pull origin develop

# main に移動
git checkout main
git pull origin main

# 必要なファイルのみ develop から取得
git checkout develop -- src/
git checkout develop -- README.md DETAILS.md
git checkout develop -- package.json

# TODO: package.json から devDependencies を削除する処理を追加
# （jq コマンドなどで自動化可能）

echo "Files synced. Please review changes and commit manually."
echo "After commit: git push origin main && git tag vX.Y.Z && git push origin vX.Y.Z"

# 元のブランチに戻る
git checkout "$CURRENT_BRANCH"
```

### ステップ5: README の調整

**develop ブランチの README.md**:
```markdown
# claude-code-pipe (開発者向け)

このブランチは開発用です。利用者は main ブランチを使用してください。

## 開発者向けセットアップ

```bash
git clone git@github.com:USER/claude-code-pipe.git
git checkout develop
npm install
```

...（開発者向けの詳細）
```

**main ブランチの README.md**:
```markdown
# claude-code-pipe

Claude Code の出力を他ツールに連携するパイプライン。

## インストール

```bash
git clone https://github.com/USER/claude-code-pipe.git
cd claude-code-pipe
npm install
```

...（利用者向けの詳細のみ）
```

## 比較：戦略の変遷

| 項目 | 2月23日（当初案） | 2月28日（現行） | 3月13日（新戦略） |
|------|------------------|----------------|------------------|
| **ブランチ構成** | main (開発) / release (公開) | main のみ | develop (開発) / main (公開) |
| **デフォルトブランチ** | release | main | main |
| **テストコード** | 本体に混在 | 別リポジトリ | 別リポジトリ（継続） |
| **開発記録** | main に存在 | main に存在 | develop のみに存在 |
| **利用者体験** | release をクローン | main をクローン（開発記録含む） 🚨 | main をクローン（軽量） ✅ |
| **同期作業** | main → release | 不要 | develop → main |
| **実害** | なし | コーディングエージェントの誤解 🚨 | 解決済み ✅ |

## 学び

### 1. 理論と実践のギャップ

**理論（2月28日）**:
> 利用者は必要なファイルだけ使えばいい

**実践（3月13日）**:
> コーディングエージェントは「存在するファイル」から判断する
> → 開発記録があれば「開発中」と判断してしまう

### 2. ブランチ分離の本質的な価値

**同期作業の手間** < **利用者体験の向上**

- ブランチ間の同期は定期的な作業として管理可能
- 利用者の混乱は日常的に発生する実害
- 同期の手間を避けるために利用者体験を犠牲にするのは本末転倒

### 3. コーディングエージェントとの共存

**AI 時代の開発では**:
- リポジトリの構成がコーディングエージェントの挙動を左右する
- 「利用者」と「開発者」の区別を構造的に示す必要がある
- ブランチ分離は人間だけでなく AI にも有効な区別手段

### 4. テストリポジトリ分離の正しさ

**2月28日の判断で正しかった部分**:
- ✅ テストコードの別リポジトリ化
- ✅ 統合テストの物理的分離

**間違っていた部分**:
- ❌ 開発記録や開発ツールも本体に含める判断
- ❌ 「利用者は必要なファイルだけ使う」という楽観的想定

### 5. 2段階の分離戦略

**第1段階（2月28日）**: テストコードの分離
- 統合テスト → 別リポジトリ（`claude-code-pipe-tester-node-red`）

**第2段階（3月13日）**: 開発環境の分離
- 開発記録・開発ツール → develop ブランチ
- 本体コード → main ブランチ

## 今後の運用

### 開発フロー

1. **日常開発**: develop ブランチで作業
2. **機能完成**: develop でコミット・プッシュ
3. **定期リリース**: develop → main へ同期（月1回程度）
4. **タグ付け**: main でバージョンタグを作成

### 同期タイミング

**いつ同期するか**:
- 新機能の追加時
- バグ修正の完了時
- 月次の定期リリース

**同期しないケース**:
- 開発記録のみの更新
- テストスクリプトのみの変更
- 開発ツールの設定変更

### ドキュメント管理

**develop ブランチ**:
- `docs/notes/`: すべての開発記録
- `docs/letters/`: すべての申し送り
- `docs/actions/`: 開発者向けアクション
- `README.md`: 開発者向け（セットアップ、開発フロー）

**main ブランチ**:
- `README.md`: 利用者向け（インストール、使い方）
- `DETAILS.md`: 詳細ドキュメント
- `docs/notes/`, `docs/letters/` は存在しない

## 注意事項

### ⚠️ GitHub のデフォルトブランチ設定

- **必ず main をデフォルトに設定**
- PR の作成時も main をベースに設定
- 開発者は明示的に develop をチェックアウト

### ⚠️ package.json の管理

**develop**:
```json
{
  "dependencies": { /* 本体の依存関係 */ },
  "devDependencies": {
    "husky": "...",
    "secretlint": "...",
    "gitleaks": "..."
  }
}
```

**main**:
```json
{
  "dependencies": { /* 本体の依存関係のみ */ }
}
```

### ⚠️ .gitignore の管理

**develop と main で同じ .gitignore を使用**
- node_modules/
- .env
- config.json (config.sample.json は含める)

### ⚠️ テスターリポジトリは継続

`claude-code-pipe-tester-node-red` は引き続きプライベートリポジトリで管理

## 関連ドキュメント

### 過去のブランチ戦略

- [2026-02-23: release ブランチ戦略（当初案）](./2026-02-23-10-00-00-release-branch-strategy.md)
- [2026-02-28: リポジトリ分離テスト戦略（現行）](./2026-02-28-09-45-00-repository-separation-testing-strategy.md)

### 関連する開発記録

- [Node-RED テスター導入とテスト分離](./2026-03-01-05-00-00-node-red-tester-integration-and-test-separation.md)

---

**最終更新**: 2026-03-13
**作成者**: Claude Code (AI)
