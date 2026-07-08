---
tags: [pre-commit, simple-git-hooks, sync-to-main, worktree, regression]
---

# pre-commit hook が main worktree で常に失敗する不具合 - 調査・修正記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-08
**関連タスク**: v0.8.4 develop → main 同期作業（`docs/actions/sync_to_main.md`）

## 問題

v0.8.4 の sync-to-main 作業中、Step 5（`npm run commit-main`）が main worktree で以下のエラーを起こして失敗した。

```
❌ Error: Command failed: git -C /home/node/workspace/repos/claude-code-pipe commit -m "..."
```

エラーメッセージ自体には詳細が出ず、`git commit` を直接実行してもメッセージなしで exit code 1 のみが返る状態だった。

## 試行錯誤

### アプローチA: commit-main ウィザード経由で再実行

**試したこと**: ウィザードをそのまま再実行

**結果**: 失敗（同じエラー）

**理由**: ウィザード自体の問題ではなく、その先で呼ばれる `git commit` が失敗していた

---

### アプローチB: git commit を直接実行してエラー内容を確認

**試したこと**: `git -C <main worktree> commit -m "test"` を直接実行

**結果**: 出力なしで exit code 1

**理由**: pre-commit hook がサイレントに失敗している可能性を疑い、hook の中身を確認する方針に切り替えた

---

### アプローチC（成功）: pre-commit hook の中身を直接検証

**試したこと**:
1. `.git/hooks/pre-commit` の中身を確認 → `[ -f scripts/pre-commit.js ] && node scripts/pre-commit.js`
2. main worktree には（sync-to-main の cleanPackageJson で意図的に）`scripts/pre-commit.js` が存在しないことを確認
3. シェルの `&&` 連結では、`[ -f ... ]` が偽（ファイルなし）の場合、`&&` の右側は実行されないが、**式全体の終了コードは `[ -f ... ]` の失敗（exit 1）がそのまま伝播する**ため、hook 自体が失敗としてコミットをブロックしていたと判明
4. `git log` で `package.json` の `simple-git-hooks.pre-commit` 設定の変遷を確認したところ:
   - `5f3261e`（2026-05-24）: `[ -f scripts/pre-commit.js ] && node scripts/pre-commit.js || true` として、main worktree でファイルが無くても失敗しないよう対応済みだった
   - `d935e3b`（このセッション開始前の別セッション）: secretlint/gitleaks の失敗を握りつぶさないよう `|| true` を除去 → **これが副作用として main worktree の「ファイルなし」ケースの許容も同時に破壊していた**

**結果**: 成功（根本原因を特定）

**コード例**:
```sh
# 修正前（develop の package.json）
"pre-commit": "[ -f scripts/pre-commit.js ] && node scripts/pre-commit.js"

# 修正後
"pre-commit": "if [ -f scripts/pre-commit.js ]; then node scripts/pre-commit.js; fi"
```

## 解決策

`&&`/`||` によるショートサーキットではなく `if/then/fi` に書き換えることで、以下の両方の意図を同時に満たせる:

- **main worktree**（`scripts/pre-commit.js` が存在しない）: if 条件が偽になり何も実行せず exit 0 → コミット可能
- **develop**（`scripts/pre-commit.js` が存在する）: node スクリプトの終了コードがそのまま hook の終了コードになる → secretlint/gitleaks の失敗は引き続きコミットをブロック

**実装場所**: `package.json` の `simple-git-hooks.pre-commit`（develop側のみ。main の package.json は `cleanPackageJson` で `simple-git-hooks` 設定ごと削除されるため対象外）

**主なポイント**:
1. main と develop は `git worktree` で `.git/hooks` を共有しているため、develop 側の `package.json` の設定を直すだけで両方の worktree に反映される（`npx simple-git-hooks` で再生成が必要）
2. 修正後、`npx simple-git-hooks` で hook を再生成し、main worktree でテストコミット→取り消し（`git reset --soft HEAD~1`）で動作確認してから、develop 側で実際の修正をコミットした
3. develop 側のコミット時に pre-commit hook（secretlint/gitleaks）が正常に実行され、ブロック機能自体が生きていることも同時に確認できた

## 学び

- **`|| true` は諸刃の剣**: 「特定の前提条件が満たされない場合に許容する」ためのフォールバックと「本来ブロックすべき失敗を握りつぶす」バグ回避が、同じ `|| true` に混在していた。片方の目的で入れた安全弁が、別の目的の修正で意図せず壊れる典型例
- **シェルの `&&`/`||` の終了コード伝播**: `[ -f X ] && cmd` は、`X` が存在しない場合に「何もしないが exit 1」になる。「ファイルが無ければスキップして成功扱いにしたい」場合は `if/then/fi` を使うべきで、`&&` だけでは代替できない
- **worktree 間で `.git/hooks` が共有される**ことを前提に、hook のロジックは「どの worktree で実行されても安全」であるように書く必要がある
- **サイレントな失敗（出力なし・exit 1 のみ）に遭遇したら hook を疑う**: `git commit` がエラーメッセージなしで失敗する場合、pre-commit hook 自体の失敗を確認する価値が高い

## 今後の改善案

- pre-commit hook の変更（`package.json` の `simple-git-hooks` 設定）を行う際は、develop と main worktree の両方でコミットが通ることを確認してからコミットする運用を徹底する
- 可能であれば `scripts/pre-commit.js` の存在チェックと secretlint/gitleaks 実行を分離せず、hook 定義自体をテストする仕組み（CI等）があると同種の回帰を早期発見できる

## 関連ドキュメント

- [pre-commit secretlint握りつぶし調査ノート](./2026-07-08-07-01-01-precommit-secretlint-bypass-and-server-log-leak.md)
- [申し送り: Windows native Send Mode 実機確認・v0.8.4リリース](../letters/2026-07-08-11-24-03-windows-native-send-mode-verified-v084.md)

---

**最終更新**: 2026-07-08
**作成者**: AI
