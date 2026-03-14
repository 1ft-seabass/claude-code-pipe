---
tags: [git, worktree, upstream-tracking, troubleshooting, claude-code-ui]
---

# upstream tracking 設定 - トラブルシューティング記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-14
**関連タスク**: develop ブランチのプッシュ後に Publish ボタンが表示される問題

## 問題

develop ブランチを `git push origin develop` でプッシュした後も、Claude Code UI に **Publish ボタン**が表示され続けていた。

### 現象

- `git push origin develop` は成功している
- コミットはリモートに反映されている
- しかし Claude Code UI は「まだ publish されていない」と判断している

## 原因

**upstream tracking（上流追跡）が設定されていなかった**

```bash
$ git branch -vv
* develop f0df9c3 refactor: sync-to-main/commit-main で git-info モジュールを利用
+ main    eeb8051 (/home/node/workspace/repos/claude-code-pipe) [origin/main] ...
```

develop ブランチに `[origin/develop]` の表示がない = upstream tracking が未設定

## upstream tracking とは？

### 概念

**ローカルブランチとリモートブランチの関連付け**

ローカルの `develop` ブランチが、リモートの `origin/develop` を「追跡している」という設定。

### upstream tracking がある場合のメリット

```bash
# コマンドがシンプルになる
git pull          # どこから pull するか自動で分かる
git push          # どこへ push するか自動で分かる
git status        # リモートとの差分が表示される

# 例: git status の出力
# Your branch is up to date with 'origin/develop'.
# Your branch is ahead of 'origin/develop' by 2 commits.
```

### upstream tracking がない場合

```bash
# 毎回リモートとブランチを指定する必要がある
git pull origin develop
git push origin develop

# git status ではリモートとの差分が表示されない
git status
# On branch develop
# nothing to commit, working tree clean
```

### Claude Code UI との関係

Claude Code UI は upstream tracking の有無で判断している:

- **tracking あり**: 通常の Commit/Push ボタン
- **tracking なし**: Publish ボタン（初回公開と見なす）

## 解決策

### upstream tracking を設定

```bash
git branch --set-upstream-to=origin/develop develop
```

### 結果

```bash
$ git branch -vv
* develop f0df9c3 [origin/develop] refactor: sync-to-main/commit-main で git-info モジュールを利用
+ main    eeb8051 (/home/node/workspace/repos/claude-code-pipe) [origin/main] ...
```

`[origin/develop]` が表示されるようになり、upstream tracking が設定された。

Claude Code UI の Publish ボタンも消えた。

## なぜ tracking が未設定だったのか？

### 通常の設定方法

```bash
# 初回プッシュ時に -u オプションを使う
git push -u origin develop

# これで自動的に upstream tracking が設定される
```

### 今回のケース

```bash
# -u なしでプッシュしていた
git push origin develop

# プッシュは成功するが、tracking は設定されない
```

worktree 環境で develop ブランチを作成した際、`-u` オプションを使わずにプッシュしていたため。

## 今後の対策

### 新しいブランチを作成してプッシュする場合

```bash
# 方法1: 初回プッシュ時に -u を使う（推奨）
git push -u origin new-branch

# 方法2: 後から設定する
git push origin new-branch
git branch --set-upstream-to=origin/new-branch new-branch
```

### 確認方法

```bash
# upstream tracking の状態を確認
git branch -vv

# 正しく設定されていれば [origin/branch-name] が表示される
* develop f0df9c3 [origin/develop] ...
```

## 学び

### upstream tracking の重要性

- リモートとの同期状態を把握しやすくなる
- コマンドがシンプルになる
- UI ツール（Claude Code、VS Code など）が正しく状態を認識できる

### worktree 環境での注意点

- worktree で新しいブランチを作成した場合も、upstream tracking は必要
- 初回プッシュ時は `-u` オプションを忘れずに

### .git/config の安全性

今回の調査中に `.git/config` に GitHub PAT が含まれていることが判明したが、これは問題ない:

- `.git` ディレクトリは Git の管理対象外
- リモートリポジトリには絶対にプッシュされない
- ローカル環境のみに存在する

## 関連コマンド

```bash
# upstream tracking の確認
git branch -vv

# upstream tracking の設定
git branch --set-upstream-to=origin/branch-name branch-name

# upstream tracking の削除
git branch --unset-upstream branch-name

# リモートの状態を確認
git remote show origin
```

## 関連ドキュメント

- [Git push 前の最終チェック](../actions/01_git_push.md)
- [Webhook Git 情報追加機能の実装記録](./2026-03-14-15-00-00-webhook-git-info-implementation.md)

---

**最終更新**: 2026-03-14
**作成者**: Claude Code (AI)
