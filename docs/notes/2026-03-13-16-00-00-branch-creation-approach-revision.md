---
tags: [branch-strategy, git, workflow, revision]
---

# develop ブランチ作成方法の方針転換

**作成日時**: 2026-03-13 16:00:00

## 概要

申し送り `docs/letters/2026-03-13-15-30-00-branch-strategy-and-sync-script.md` に記載されていた「リネーム方式」から、より安全な「複製方式」へ方針転換する。

## 背景

### 申し送りに記載されていた方法（リネーム方式）

```bash
# main を develop にリネーム
git branch -m main develop
git push origin develop

# GitHub でデフォルトブランチを一時的に develop に設定

# リモートの main を削除
git push origin :main

# その後、develop から新しい main を作成して軽量化
```

**問題点**:
- main ブランチを一旦削除する必要がある
- GitHub のデフォルトブランチ設定を2回変更する必要がある
- 手順が複雑で、ミスのリスクが高い

## 新しい方針（複製方式）

### ステップ1: develop ブランチを作成（main のコピー）

```bash
# 現在の main から develop を作成
git checkout -b develop
git push origin develop
```

### ステップ2: main に戻って軽量化

```bash
# main ブランチに戻る
git checkout main

# 不要なファイルを削除
rm -rf docs/notes docs/letters docs/actions
rm -rf .husky .secretlintrc.json gitleaks.toml
rm -rf bin/ scripts/
rm -f test-*.js test-*.sh test-*.log

# package.json から devDependencies と開発用スクリプトを削除
# （手動で編集、または同期スクリプトを流用）

# README.md を利用者向けに調整（必要に応じて）

# 変更をコミット
git add .
git commit -m "chore: create lightweight main branch for users"
git push origin main
```

### ステップ3: GitHub でデフォルトブランチを main に設定（確認）

- GitHub の Settings → Branches → Default branch が `main` になっていることを確認
- すでに `main` なら設定変更不要

### ステップ4: develop ブランチで作業開始

```bash
# develop に切り替え
git checkout develop

# 以降は develop で開発作業を行う
```

### ステップ5: git worktree のセットアップ（推奨）

```bash
# develop を別ディレクトリにチェックアウト
git worktree add ../claude-code-pipe-develop develop

# 以降は develop ディレクトリで作業
cd ../claude-code-pipe-develop

# main への同期が必要な時だけ
npm run sync-to-main
```

## 複製方式の利点

### 1. 安全性
- **main ブランチを削除しない** - 万が一の問題があっても main が残っている
- **リモートブランチの削除操作が不要** - ミスのリスクが低い

### 2. シンプルさ
- **手順が少ない** - ブランチのリネームや削除が不要
- **GitHub 設定変更が最小限** - デフォルトブランチ設定を変更しなくて済む可能性が高い

### 3. 戻りやすさ
- **問題があっても戻せる** - main に元の状態が残っている
- **段階的に進められる** - develop を作成後、main の軽量化を慎重に進められる

## コミット履歴の共有について

### 現状確認

```bash
git log --oneline -5
# 34ab8c7 docs: ブランチ戦略と同期スクリプトの申し送りを追加
# 25690c9 feat: develop から main への同期スクリプトを追加
# 2560c0b docs: develop→main 同期スクリプトの実装記録を追加
# 2922c1f docs: develop/main 2ブランチ体制への戦略転換方針を追加
# 42be078 docs: Windows対応調査と意思決定のノートを追加
```

### 判断

- **問題のあるコミットは含まれていない** - すべて開発記録やスクリプト実装
- **機密情報の漏洩なし** - .env や API キーのコミットはない
- **コミット履歴の共有は問題なし** - develop と main で分岐点まで同じ履歴を持つことに問題はない

### 今後の運用

- **develop**: すべての開発作業、コミット履歴が蓄積される
- **main**: `sync-to-main.js` で同期された内容のみ、軽量なコミット履歴

分岐後は以下のようなコミット履歴になる:

```
develop: A - B - C - D - E - F - G - H - I - J - ...
                        ↓ sync
main:    A - B - C - D - E' - G' - I' - ...
         (共通履歴)  (軽量化)  (同期コミット)
```

## 次のステップ

1. ✅ このノートの作成
2. ⏭️ develop ブランチの作成（複製方式）
3. ⏭️ main ブランチの軽量化
4. ⏭️ git worktree のセットアップ（任意）
5. ⏭️ 同期スクリプトの動作確認

## 関連ドキュメント

- [申し送り: ブランチ戦略と同期スクリプト](../letters/2026-03-13-15-30-00-branch-strategy-and-sync-script.md)
- [ブランチ戦略再転換の方針](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)
- [同期スクリプトの実装記録](./2026-03-13-15-00-00-sync-to-main-script-implementation.md)

---

**備考**:
- リネーム方式から複製方式への変更は、実装前の設計判断
- 同期スクリプト自体には影響なし
- より安全でシンプルな手順を優先
