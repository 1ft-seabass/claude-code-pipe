---
tags: [security, simple-git-hooks, migration, git-worktree, pre-commit]
---

# setup-securecheck v1→v2 移行 - 開発記録

**作成日**: 2026-05-03
**関連タスク**: setup-securecheck v1（husky + lint-staged）→ v2（simple-git-hooks）移行

## 問題

setup-securecheck v1 は husky + lint-staged で構成されていた。
v2 は simple-git-hooks に移行し、`package.json` だけで hooks 管理が完結する構成になっている。
クローン直後の状態から v2 へのアップグレードが必要だった。

## 試行錯誤

### アプローチA: migrate-to-v2.sh 実行後にそのまま npx simple-git-hooks

**試したこと**: シェルスクリプトで husky/lint-staged をアンインストール・simple-git-hooks をインストール後、`npx simple-git-hooks` を実行

**結果**: 一見成功（`[INFO] Successfully set the pre-commit with command`）したが、フックが誤った場所に作成された

**理由**: `git config --local core.hooksPath` が `.husky/_` のまま残留していたため、simple-git-hooks が `.husky/_/pre-commit` にフックを作成してしまった

---

### アプローチB: core.hooksPath をアンセット後に npx simple-git-hooks

**試したこと**: `git config --local --unset core.hooksPath` 後に `npx simple-git-hooks` を実行

**結果**: `ENOTDIR: not a directory, mkdir '/home/.../claude-code-pipe-develop/.git/hooks'` エラー

**理由**: このプロジェクトは **git worktree** 環境のため `.git` がディレクトリではなくファイル（`gitdir: ...` へのポインタ）。`simple-git-hooks` のデフォルト処理 `path.join(projectRoot, '.git', 'hooks')` がディレクトリを作れない

---

### アプローチC（成功）: core.hooksPath を共通 git ディレクトリに設定

**試したこと**: `git rev-parse --git-common-dir` で共通 git ディレクトリを取得し、`core.hooksPath` にセット後に `npx simple-git-hooks` を実行

**結果**: 成功

**コード例**:
```bash
COMMON_GIT=$(git rev-parse --git-common-dir)
git config --local core.hooksPath "$COMMON_GIT/hooks"
npx simple-git-hooks
```

## 解決策

**実装場所**: `package.json`、`.git/config`（ローカル設定）

**主なポイント**:
1. `migrate-to-v2.sh` は husky/lint-staged のアンインストールと simple-git-hooks インストールを自動化するが、`core.hooksPath` の残留はクリアしない
2. git worktree 環境では `.git` がファイルのため、`core.hooksPath` を `$(git rev-parse --git-common-dir)/hooks` の絶対パスに設定する必要がある
3. `security-verify.js` は `.git/hooks/pre-commit` を固定パスで確認するため worktree では ❌ と表示されるが、フック自体は正常動作する（現状維持の判断）

## 学び

- **husky の副作用**: husky は `git config core.hooksPath .husky/_` をセットする。アンインストールしてもこの設定は残るため、移行後に必ずアンセットが必要
- **git worktree の罠**: `.git` がファイルになる worktree 環境では、hooks パスを明示的に指定しないとツールが誤動作することがある
- **ヘルスチェックの限界**: `security-verify.js` の固定パスチェックはワークツリー非対応。修正すると汎用性（冪等性）が下がるため、worktree 環境では ❌ 表示を許容するのが妥当

## 今後の改善案

- `migrate-to-v2.sh` に `git config --local --unset core.hooksPath` を追加すると、通常リポジトリでの移行がより確実になる（worktree 対応は別途検討）

## 関連ドキュメント

- [security-check-setup](./2026-02-23-09-28-00-security-check-setup.md)

---

**最終更新**: 2026-05-03
**作成者**: AI（Claude）
