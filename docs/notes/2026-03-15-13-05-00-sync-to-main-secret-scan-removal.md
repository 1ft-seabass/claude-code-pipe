---
tags: [sync-to-main, package-json, cleanup, secret-scan, main-branch]
---

# sync-to-main での secret-scan 削除対応 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-15
**関連タスク**: main ブランチ簡素化の継続作業

## 問題

前回のセッション（2026-03-14）で main ブランチの package.json を簡素化する作業を行ったが、`secret-scan` と `secret-scan:full` のスクリプトが main ブランチに残っていた。

**残っていた理由**:
- `scripts/sync-to-main.js` の `cleanPackageJson()` 関数で削除ルールに含まれていなかった
- 既存の削除ルールは以下の通り:
  - `key.includes('secretlint')` → ◯ これは secretlint 関連だが、`secret-scan` は引っかからない
  - `key.includes('gitleaks')` → ◯ gitleaks 関連
  - `key.startsWith('security:')` → ✗ `secret-scan` は `security:` プレフィックスではない

**問題点**:
- `secret-scan` と `secret-scan:full` は secretlint と gitleaks を呼び出すスクリプト
- main ブランチには secretlint や gitleaks の設定ファイル（gitleaks.toml など）が同期されない
- 実行できないスクリプトが main ブランチに残っていると利用者が混乱する

## 解決策

`scripts/sync-to-main.js` の `cleanPackageJson()` 関数に削除ルールを追加。

**実装場所**: `scripts/sync-to-main.js:242`

**変更内容**:
```diff
     // 開発用スクリプトのパターンで削除
     Object.keys(pkg.scripts).forEach(key => {
       // husky, secretlint, gitleaks, security, tmux 関連のスクリプトを削除
       if (
         key.includes('husky') ||
         key.includes('secretlint') ||
         key.includes('gitleaks') ||
+        key.startsWith('secret-scan') ||
         key.startsWith('security:') ||
         key.startsWith('dev:tmux:')
       ) {
         log(`   Removing script: ${key}`, 'cyan');
         delete pkg.scripts[key];
       }
     });
```

**削除されるスクリプト**:
- `secret-scan` → `secretlint "**/*"`
- `secret-scan:full` → `secretlint "**/*" && ./bin/gitleaks detect ...`

## 主なポイント

1. **`key.startsWith('secret-scan')` を追加**
   - `secret-scan` と `secret-scan:full` の両方にマッチ
   - 将来的に `secret-scan:xxx` が追加されても自動的に削除される

2. **main ブランチの完全なシンプル化**
   - main ブランチに残るスクリプトは `start` と `dev` のみ
   - 利用者は `npm start` または `npm run dev` だけで起動可能

3. **develop ブランチには影響なし**
   - `sync-to-main.js` は main ブランチへの同期時のみ動作
   - develop ブランチでは引き続き `secret-scan` を利用可能

## 学び

- **スクリプト削除ルールの設計**:
  - `includes()` は部分一致なので広範囲に削除される可能性がある
  - `startsWith()` はプレフィックスベースなので明示的で安全
  - 今回は `secret-scan` という特定のスクリプト名を削除したかったので `startsWith()` が適切

- **main ブランチの役割の明確化**:
  - main ブランチは利用者向け（最小限のスクリプトのみ）
  - develop ブランチは開発者向け（開発ツール完備）
  - この方針に沿って段階的に整理中

## 今後の改善案

- 削除ルールが増えてきたら、配列で管理する方が見通しが良いかもしれない:
  ```javascript
  const prefixesToRemove = ['security:', 'dev:tmux:', 'secret-scan'];
  const includesPatterns = ['husky', 'secretlint', 'gitleaks'];
  ```

## 関連ドキュメント

- [main ブランチ簡素化の実装記録](./2026-03-14-17-00-00-main-branch-simplification-package-scripts-cleanup.md)
- [main ブランチ簡素化の申し送り](../letters/2026-03-14-17-30-00-main-branch-package-json-simplification.md)

---

**最終更新**: 2026-03-15
**作成者**: Claude Code (AI)
