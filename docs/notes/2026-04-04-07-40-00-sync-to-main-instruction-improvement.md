---
tags: [sync-to-main, instruction, security-check, workflow, v0.7.0]
---

# sync_to_main 指示書の改善 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-04
**関連タスク**: v0.7.0 リリースと sync_to_main 指示書の改善

## 問題

v0.7.0 リリース作業中に、`docs/actions/sync_to_main.md` 指示書に以下の問題が見つかった:

1. **Step 3 のパスが間違っている**: `cd ~/workspace/repos/claude-code-pipe` と案内していたが、`npm run commit-main` は develop 側で実行するスクリプト
2. **Step 3 で次のステップが見えない**: Step 4 の予告がなく、AI が勝手にコミットしそうな印象
3. **Step 4 のタグ作成**: ユーザー実行と書いてあったが、実際には AI が実行すべき
4. **セキュリティチェックがない**: main にデプロイする前に機密情報をチェックすべき
5. **lint-staged 削除の確認漏れ**: package.json の確認項目に含まれていなかった

## 解決策

### 1. sync-to-main.js の修正

`lint-staged` 設定を main の package.json から削除するよう修正。

**実装場所**: `scripts/sync-to-main.js:249-253`

```javascript
// lint-staged 設定を削除（開発用）
if (pkg['lint-staged']) {
  log('   Removing lint-staged config', 'cyan');
  delete pkg['lint-staged'];
}
```

### 2. sync_to_main.md 指示書の改善

Step を以下のように再構成:

| Step | 内容 | 実行者 |
|------|------|--------|
| 1 | sync-to-main 実行 | AI |
| 2 | main の package.json 確認 | AI |
| 3 | **セキュリティチェック（新規）** | AI |
| 4 | コミットメッセージの計画 | AI |
| 5 | commit-main の案内 + 次ステップ予告 | ユーザー |
| 6 | **タグ作成とプッシュ（AI 実行に変更）** | AI |

**主な変更点**:

1. **Step 3 セキュリティチェック追加**: `docs/actions/01_git_push.md` を参考に機密情報チェックを追加
2. **Step 5 パス修正**: develop ディレクトリから `npm run commit-main` を実行するよう案内
3. **Step 5 次ステップ予告追加**: 「完了したら教えてください。次は Step 6 でタグ作成・プッシュを行います。」
4. **Step 6 AI 実行に変更**: タグ作成・プッシュは AI が実行
5. **package.json 確認項目に `lint-staged` 追加**

### 3. DEVELOP.md の同期

`DEVELOP.md` の「develop から main への反映フロー」も同様に更新:
- Step 3 にセキュリティチェック追加
- Step 4 を commit-main（番号変更）
- Step 5 をタグ作成とプッシュ（AI が実行）に変更

## 学び

- **指示書は実戦投入して初めて問題が見つかる**: 机上で作った指示書は実際に使うと想定外の問題が出る
- **パスの抽象化**: `[develop worktree path]` のようにプレースホルダーを使うことで、環境依存を減らせる
- **次ステップの予告**: AI が先走らないよう、各ステップで次の流れを明示することが重要

## 関連ドキュメント

- [docs/actions/sync_to_main.md](../actions/sync_to_main.md) - 改善後の指示書
- [docs/actions/01_git_push.md](../actions/01_git_push.md) - セキュリティチェックの参考
- [DEVELOP.md](../../DEVELOP.md) - 同期ワークフローの概要

---

**最終更新**: 2026-04-04
**作成者**: Claude Code (AI)
