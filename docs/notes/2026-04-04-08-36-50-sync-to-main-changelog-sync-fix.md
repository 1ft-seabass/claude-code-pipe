---
tags: [sync-to-main, changelog, bugfix, v0.7.0]
---

# sync-to-main に CHANGELOG 同期を追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-04
**関連タスク**: v0.7.0 リリース時の CHANGELOG 同期漏れ修正

## 問題

v0.7.0 の main ブランチ同期作業中に、CHANGELOG.md と CHANGELOG-ja.md が main に同期されていないことが判明。

`npm run sync-to-main` を実行しても「No changes」となり、CHANGELOG が main に反映されていなかった。

## 原因

v0.6.1 で CHANGELOG.md / CHANGELOG-ja.md を導入した際、`scripts/sync-to-main.js` の `filesToSync` 配列に追加するのを忘れていた。

**該当箇所**: `scripts/sync-to-main.js:52-70`

```javascript
const filesToSync = [
  // ソースコード
  'src/',

  // ドキュメント
  'README.md',
  'README-ja.md',
  'DETAILS.md',
  'DETAILS-ja.md',
  'LICENSE',
  // ← CHANGELOG.md / CHANGELOG-ja.md がなかった

  // 設定ファイル
  'config.example.json',
  '.gitignore',

  // 依存関係
  'package.json',
  'package-lock.json',
];
```

## 解決策

`filesToSync` に CHANGELOG.md と CHANGELOG-ja.md を追加。

**実装場所**: `scripts/sync-to-main.js:61-62`

```javascript
  // ドキュメント
  'README.md',
  'README-ja.md',
  'DETAILS.md',
  'DETAILS-ja.md',
  'CHANGELOG.md',     // 追加
  'CHANGELOG-ja.md',  // 追加
  'LICENSE',
```

## 学び

- **新しいドキュメントファイルを追加したら、同期対象も確認する**: develop 専用でない限り、`filesToSync` への追加を忘れずに
- **sync-to-main の「No changes」は要注意**: 本当に変更がないのか、同期対象から漏れているのかを確認すべき

## 関連ドキュメント

- [v0.6.1 CHANGELOG 整備記録](./2026-03-25-09-00-00-v0-6-1-changelog-documentation.md)
- [sync_to_main 指示書](../actions/sync_to_main.md)

---

**最終更新**: 2026-04-04
**作成者**: Claude Code (AI)
