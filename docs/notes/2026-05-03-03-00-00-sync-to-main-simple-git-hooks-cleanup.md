---
tags: [sync-to-main, simple-git-hooks, package-json, cleanup, main-branch]
---

# sync-to-main の simple-git-hooks 対応クリーンアップ - 開発記録

**作成日**: 2026-05-03
**関連タスク**: setup-securecheck v1→v2 移行後の sync-to-main 対応

## 問題

setup-securecheck が v1（husky + lint-staged）から v2（simple-git-hooks）に移行したことで、develop の `package.json` に以下が追加された。

```json
{
  "scripts": {
    "postinstall": "npx simple-git-hooks"
  },
  "simple-git-hooks": {
    "pre-commit": "node scripts/pre-commit.js"
  }
}
```

しかし `scripts/sync-to-main.js` の `cleanPackageJson()` 関数はこの2つを削除対象に含んでいなかった。

**影響**: main ブランチに同期した後、エンドユーザーが `npm install` を実行すると `postinstall` 経由で `npx simple-git-hooks` が走り、`simple-git-hooks` 設定に従って git hook のセットアップを試みる。`devDependencies` は削除されているため `simple-git-hooks` パッケージ自体は存在せず、`npx` での解決を試みる動作になる（環境によってはエラーになる可能性）。

## 解決策

**実装場所**: `scripts/sync-to-main.js`

### 1. `postinstall` スクリプトを削除対象に追加

```diff
  const scriptsToRemove = [
    'prepare',           // husky
    'sync-to-main',      // このスクリプト自体
    'commit-main',       // 開発用コミットウィザード
+   'postinstall',       // simple-git-hooks セットアップ（開発用）
  ];
```

### 2. `simple-git-hooks` 設定キーの削除処理を追加

`lint-staged` 削除処理と同様のパターンで追加。

```diff
  if (pkg['lint-staged']) {
    log('   Removing lint-staged config', 'cyan');
    delete pkg['lint-staged'];
  }
+
+ // simple-git-hooks 設定を削除（開発用）
+ if (pkg['simple-git-hooks']) {
+   log('   Removing simple-git-hooks config', 'cyan');
+   delete pkg['simple-git-hooks'];
+ }
```

## 学び

- **git hooks ツール移行時の sync スクリプト更新漏れ**: ツールを乗り換えるたびに `cleanPackageJson()` の削除ルールも合わせて見直す必要がある。今回は v1（husky）→ v2（simple-git-hooks）の移行でルールの更新が抜けた
- **`postinstall` の危険性**: `postinstall` は `npm install` 時に自動実行されるため、開発用の処理を残しておくとエンドユーザーに意図しない副作用を与える。main ブランチへの同期時は必ず除外すべき
- **設定キーも忘れずに**: `devDependencies` を削除してもトップレベルの設定キー（`simple-git-hooks`, `lint-staged` など）は別途削除が必要

## 今後の改善案

- `cleanPackageJson()` のテストを追加して、削除すべきキーが確実に除去されているか検証できるようにする
- git hooks ツールの変更時にチェックリストとして sync-to-main の削除ルール確認を含める

## 関連ドキュメント

- [setup-securecheck v1→v2 移行記録](./2026-05-03-02-17-00-setup-securecheck-v1-to-v2-migration.md)
- [sync-to-main での secret-scan 削除対応](./2026-03-15-13-05-00-sync-to-main-secret-scan-removal.md)

---

**最終更新**: 2026-05-03
**作成者**: AI（Claude）
