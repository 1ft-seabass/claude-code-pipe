---
tags: [security, setup-securecheck, sync-to-main, worktree, verification]
---

# setup-securecheck v3 の sync-to-main 影響確認・worktree 動作確認 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: `setup-securecheck` パターンの v2 → v3 移行（別セッションで実施・コミット済み）を受けて、このセッションで「main への影響」と「worktree 構成での動作」の2点を確認

## 問題

v3 移行（`.security-check/cli.js` 構成の導入）が別セッションで完了し、develop にコミット・push 済みだった。このセッションでは実装はせず、以下2点をユーザーと一緒に検証した：

1. v3 移行が `sync-to-main`（develop → main の同期処理）に悪影響を与えないか
2. worktree 構成（main/develop が git worktree で hooks を共有する特殊な環境）で v3 が正しく動作しているか

## 確認①: sync-to-main への影響

`scripts/sync-to-main.js` の `filesToSync` を確認：

```js
const filesToSync = [
  'src/',
  'README.md', 'README-ja.md', 'DETAILS.md', 'DETAILS-ja.md',
  'CHANGELOG.md', 'CHANGELOG-ja.md', 'LICENSE',
  'config.example.json', '.gitignore',
  'package.json', 'package-lock.json',
];
```

`.security-check/` はこのリストに含まれていないため、main には一切コピーされない。v2 のときに `scripts/security-verify.js` 等の devDependencies 関連ファイルが sync-to-main の対象外だったのと同じ構造で、影響なしと判断した。

## 確認②: worktree 構成での動作確認

`node .security-check/cli.js verify` を実行し、実際にヘルスチェックが通るか確認した。

**結果**: 15/15 passed, 0 failed, 0 warning

特筆すべき点：v2 時代は `.git/hooks/pre-commit` の存在チェックが worktree 構成（`.git` がディレクトリではなくポインタファイル）で常に❌になる誤検知があった（[[2026-07-10-10-22-20-secretlint-gitleaks-setup-securecheck-wizard]] 参照）。v3 ではこのチェックも ✅ になっており、誤検知が解消されていることを確認した。

## 学び

- パターンやツールをバージョンアップする際、「動くようになった」だけでなく「以前あった既知の誤検知が直っているか」も明示的に再確認する価値がある
- リリースパイプライン（sync-to-main のような devDependencies を除外する仕組み）がある場合、開発ツール側の変更（今回でいう secretlint/gitleaks 関連ディレクトリの構成変更）は同期対象リストに入っていない限り本番導線に影響しないと機械的に判断できる

## 今後の改善案

- 旧 v2 スクリプト（`scripts/pre-commit.js`, `scripts/security-verify.js`, `scripts/install-gitleaks.js`）は pre-commit フックから呼ばれなくなった残骸。将来的に削除可能（[[project_worktree_precommit_hook]] メモリ参照）

## 関連ドキュメント

- [secretlint + gitleaks 導入（setup-securecheckウィザード） - 開発記録](./2026-07-10-10-22-20-secretlint-gitleaks-setup-securecheck-wizard.md)

---

**最終更新**: 2026-09-06
**作成者**: AI
