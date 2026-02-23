---
tags: [git, release, branch-strategy, deployment, documentation]
---

# release ブランチ戦略 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: claude-code-pipe プロジェクトのブランチ戦略策定

## 問題

claude-code-pipe プロジェクトにおいて、以下の課題が明らかになった：

1. **開発用ツールの混在**
   - husky/secretlint/gitleaks などのセキュリティチェックツールが含まれている
   - 開発時は便利だが、利用者には不要
   - バイナリやdevDependenciesが増える

2. **設定ファイルの管理**
   - config.json はローカル設定なので .gitignore で除外済み
   - 利用者向けにサンプルファイルが必要

3. **ドキュメントの肥大化**
   - docs/notes/ は開発記録で公開に不要
   - docs/actions/, docs/letters/ は開発者向け
   - 利用者には README とコードだけで十分

4. **開発の自由度**
   - テストコードやアレコレを自由に試したい
   - でも公開リポジトリはクリーンに保ちたい

## 検討した案

### 案1: ブランチ分離（採用）

```
main (開発用)
  ├── すべての開発ツール込み
  ├── docs/notes/ あり
  └── husky/gitleaks 含む

release (公開用)
  ├── 最小限の構成
  ├── config.sample.json のみ
  └── セキュリティツールなし
```

**メリット**:
- 開発の自由度が高い（main で何でも試せる）
- 公開用はクリーン（release で整理された状態）
- ブランチ切り替えで明確に分離
- 利用者は release を clone すればOK

**デメリット**:
- ブランチ間の同期が必要
- main → release への「抜く」作業が発生

### 案2: npm publish 時の除外（.npmignore）

**メリット**:
- npm パッケージとして公開する場合に有効
- ブランチ管理不要

**デメリット**:
- GitHub リポジトリには全部見える
- npm 専用の仕組み

### 案3: 現状維持 + 整理

**メリット**:
- シンプル
- ブランチ管理不要

**デメリット**:
- 利用者が不要なファイルを見る
- 開発用ファイルが混在したまま

## 採用した戦略

**案1: ブランチ分離** を採用

**理由**:
- 開発の自由度と公開時のクリーンさを両立
- まだ利用者がいないので、今のうちに整備
- しばらくはガシガシ開発して、タイミングを見て release を更新

## 解決策

### 方法1: 新規作成 + 選択的コピー（採用）

release ブランチを main から分岐させ、不要なファイルを削除する方法。

#### 手順

##### 1. release ブランチを作成

```bash
# main ブランチから release ブランチを作成
git checkout -b release
```

##### 2. 不要なファイル・ディレクトリを削除

```bash
# 開発記録ディレクトリを削除
rm -rf docs/notes/

# 開発者向けアクションを削除
rm -rf docs/actions/

# 申し送りディレクトリを削除
rm -rf docs/letters/

# 一時ファイルディレクトリを削除（もしあれば）
rm -rf tmp/

# husky フックを削除
rm -rf .husky/

# セキュリティチェック設定を削除
rm .secretlintrc.json
rm gitleaks.toml
```

##### 3. package.json を編集

devDependencies からセキュリティツールを削除：

```bash
# 手動編集が必要
# 以下を削除:
# - @secretlint/secretlint-rule-preset-recommend
# - secretlint
# - husky
# - その他開発用のみのパッケージ

# scripts からも削除:
# - prepare (husky install)
# - secretlint 関連
```

**編集箇所**:
```json
{
  "devDependencies": {
    // 削除: "@secretlint/...", "secretlint", "husky"
  },
  "scripts": {
    // 削除: "prepare": "husky install"
    // 削除: secretlint 関連スクリプト
  }
}
```

##### 4. config.json を config.sample.json にリネーム

```bash
# config.json をサンプルファイルに変更
git mv config.json config.sample.json
```

**config.sample.json の編集**:
- コメントを追加して使い方を説明
- サンプル値をわかりやすく

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/claude-event",
      "label": "example-subscriber",
      "level": "summary",
      "authorization": ""
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "LS", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000
  }
}
```

##### 5. .gitignore を調整

```bash
# config.json の除外設定はそのまま（利用者がコピーして使う）
# gitleaks バイナリの除外設定もそのまま（念のため）
```

##### 6. README.md を公開用に編集

削除する内容：
- 開発者向けの記述
- docs/actions/ への言及
- セキュリティツールのセットアップ手順

追加する内容：
- config.sample.json から config.json を作成する手順
- シンプルな使い方の説明

##### 7. docs/README.md を編集

開発用のディレクトリ説明を削除：
- notes/ への言及を削除
- actions/ への言及を削除
- letters/ への言及を削除

##### 8. 変更をコミット

```bash
# すべての変更をステージング
git add -A

# コミット
git commit -m "chore: release ブランチ用に整理

- 開発用ツール（husky, secretlint, gitleaks設定）を削除
- 開発記録（docs/notes/, docs/actions/, docs/letters/）を削除
- config.json を config.sample.json にリネーム
- README を公開用に調整
- package.json から開発用依存関係を削除"
```

##### 9. release ブランチをプッシュ

```bash
# release ブランチをリモートにプッシュ
git push -u origin release
```

##### 10. GitHub でデフォルトブランチを変更（オプション）

利用者向けに release ブランチをデフォルトにする場合：
1. GitHub リポジトリの Settings → Branches
2. Default branch を `release` に変更

### 削除対象ファイル一覧

```
docs/notes/                          # 開発記録
docs/actions/                        # 開発者向けアクション
docs/letters/                        # 申し送り
tmp/                                 # 一時ファイル（もしあれば）
.husky/                              # Git hooks
.secretlintrc.json                   # secretlint 設定
gitleaks.toml                        # gitleaks 設定
```

### 編集対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | devDependencies から開発用ツールを削除 |
| `config.json` → `config.sample.json` | リネーム + サンプル値に調整 |
| `README.md` | 公開用に簡素化 |
| `docs/README.md` | 開発用ディレクトリへの言及を削除 |

### 保持するファイル

```
src/                                 # ソースコード（すべて）
config.sample.json                   # 設定サンプル
package.json                         # 最小限の依存関係
package-lock.json                    # ロックファイル
README.md                            # 公開用README
LICENSE                              # ライセンス
.gitignore                           # Git除外設定
docs/README.md                       # ドキュメント説明（簡略版）
```

## 運用方針

### main ブランチ
- 開発用
- 自由に試行錯誤
- 開発記録（docs/notes/）を蓄積
- セキュリティツール有効

### release ブランチ
- 公開用
- クリーンな状態を維持
- 利用者が clone するブランチ
- 定期的に main から同期（手動）

### 同期のタイミング
- 新機能追加時
- バグ修正時
- バージョンアップ時

### 同期の流れ

```bash
# 1. main で開発・テスト
git checkout main
# ... 開発作業 ...
git commit -m "feat: 新機能追加"

# 2. release ブランチに切り替え
git checkout release

# 3. main から src/ と必要なファイルを取り込む
git checkout main -- src/
git checkout main -- README.md
git checkout main -- package.json
# ... 必要なファイルのみ選択的に取り込む

# 4. 不要な変更を元に戻す
# package.json の devDependencies を再度削除
# config.json → config.sample.json を確認

# 5. コミット
git commit -m "sync: main から変更を取り込み（新機能追加）"

# 6. プッシュ
git push origin release
```

## 学び

1. **ブランチ戦略の重要性**
   - 開発環境と公開環境の分離は、プロジェクトの成長に必要
   - 初期段階で決めておくと後が楽

2. **選択的コピーの有用性**
   - git checkout <branch> -- <file> で特定ファイルだけ取り込める
   - 履歴を残しつつ、クリーンな状態を維持可能

3. **設定ファイルの扱い**
   - ローカル設定は .gitignore で除外
   - サンプルファイル（.sample, .example）を提供する

4. **ドキュメントの使い分け**
   - 開発記録（notes/）は内部用
   - 利用者向けドキュメントは最小限に

## 今後の改善案

1. **自動化スクリプトの作成**
   - main → release の同期を半自動化
   - 削除対象ファイルをスクリプトで管理

2. **GitHub Actions での自動化**
   - main にプッシュ時、release へ自動同期
   - ただし、手動確認の方が安全

3. **タグ運用**
   - release ブランチでバージョンタグを付ける
   - v1.0.0, v1.1.0 など

4. **CHANGELOG.md の追加**
   - リリースごとの変更履歴を記録
   - 利用者に分かりやすく

## 注意事項

⚠️ **AI によるブランチ操作のリスク**
- ブランチ作成・削除は慎重に
- AI が誤認して暴走する可能性がある
- 手動実行 or 人間による確認を推奨

⚠️ **force push は避ける**
- release ブランチでの force push は禁止
- 履歴を保持する

⚠️ **main ブランチの保護**
- GitHub で main ブランチを保護設定
- 直接プッシュを制限

## 関連ドキュメント

- [README.md](../../README.md) - プロジェクト概要
- [2026-02-23-09-30-00-claude-code-pipe-initial-implementation.md](./2026-02-23-09-30-00-claude-code-pipe-initial-implementation.md) - 初期実装記録

---

**最終更新**: 2026-02-23
**作成者**: Claude Code (AI)
