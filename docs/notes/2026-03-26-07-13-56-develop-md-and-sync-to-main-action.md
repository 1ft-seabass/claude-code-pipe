---
tags: [develop-branch, documentation, workflow, actions, worktree, developer-guide]
---

# DEVELOP.md と sync-to-main アクションの構築 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-26
**関連タスク**: develop ブランチの運用ガイドと AI 指示書の整備

## 概要

develop ブランチの運用ガイド（DEVELOP.md）と、AI への指示書（docs/actions/sync_to_main.md）を作成した。

また、sync-to-main.js と commit-main.js を worktree 必須に修正し、安全性を向上させた。

## 背景

### 課題

1. **develop → main への反映フローが文書化されていない**
   - 既存の docs/notes にワークフロー記録はあるが、開発者向けガイドがない
   - DEVELOP.md が存在せず、新しい開発者が運用方法を把握しづらい

2. **AI が勝手にコミット・プッシュしてしまう**
   - commit-main を AI が自動実行してバグる
   - ユーザーが実行すべきステップを AI が実行してしまう

3. **ブランチ切り替えモードが怖い**
   - sync-to-main.js にブランチ切り替え機能があり、main ブランチが存在しなければ自動作成
   - AI のコンテキストが混乱する可能性
   - 意図しないタイミングで main が作られるリスク

## 解決策

### 1. DEVELOP.md の作成

**設計方針**:
- **薄く**: 詳細は既存の docs/notes に任せる
- **メインフォーカス**: develop → main への反映フロー
- **ターゲット**: develop ブランチの開発者

**構成**:
```markdown
# DEVELOP.md

## ブランチの役割
- develop: 開発用（薄く説明）
- main: 公開用（薄く説明）

## 環境セットアップ
- worktree のセットアップ手順（必須）

## develop から main への反映フロー
- Step 0: develop での作業完了（CHANGELOG 更新含む）
- Step 1: sync-to-main
- Step 2: package.json 確認
- Step 3: commit-main（ユーザーが実行）← 重要
- Step 4: タグ作成とプッシュ（ユーザーが実行）← 重要

## よくある質問
- worktree は必須ですか？

## 関連ドキュメント
- docs/notes へのリンク
```

**重要な工夫**:
- Step 3 と Step 4 に「**ユーザーが実行**」を明記
- AI による自動実行を防ぐ

**main ブランチへの同期**:
- DEVELOP.md は `filesToSync` に含まれていないため、main には同期されない ✅
- README.md にリンクを追加しない（main でリンク切れを防ぐ）✅

### 2. docs/actions/sync_to_main.md の作成

**設計方針**:
- 他の actions 指示書（git_commit.md, 00_session_end.md）のパターンに従う
- **理解チェック** のフェーズを追加（伝達度向上）
- commit-main と タグ作成・プッシュは AI が実行しないことを明記

**構成**:
```markdown
# sync-to-main アクション

## 📋 この指示書の理解チェック
- [ ] Step 1: sync-to-main を実行（AI が実行可）
- [ ] Step 2: main の package.json を確認（AI が実行可）
- [ ] Step 3: commit-main の実行をユーザーに案内（**ユーザーが実行**）
- [ ] Step 4: タグ作成とプッシュをユーザーに案内（**ユーザーが実行**）

## 前提条件
- 変更がすべてコミット・プッシュ済みであること

## 詳細手順
（DEVELOP.md を参照）

## 注意事項
- ここでコミット・プッシュはしない
- commit-main は AI が実行せず、ユーザーに案内のみ
```

**ダブル命令**:
- DEVELOP.md と docs/actions/sync_to_main.md の両方で「ユーザーが実行」を明記
- AI が勝手に実行するのを強く抑制

### 3. worktree 必須化

**修正箇所**:
- `scripts/sync-to-main.js`: ブランチ切り替えモードを削除、worktree 必須に
- `scripts/commit-main.js`: worktree 必須に

**変更前**:
```javascript
// worktree が見つからない場合、通常のブランチ切り替え
if (!mainWorktreePath) {
  exec('git checkout main');
  exec('git pull origin main');
}
```

**変更後**:
```javascript
// worktree が見つからない場合はエラー
if (!mainWorktreePath) {
  log('❌ Error: main branch worktree not found', 'red');
  log('To set up a worktree:', 'cyan');
  log('  git worktree add ../claude-code-pipe main', 'cyan');
  process.exit(1);
}
```

**メリット**:
- ブランチ切り替えによる AI のコンテキスト混乱を防止
- main ブランチの自動作成を防止
- 安全性向上

## 実装内容

### ファイル作成

1. **DEVELOP.md**
   - 場所: `/DEVELOP.md`
   - develop ブランチのみに存在（main には同期されない）
   - 開発者向け運用ガイド

2. **docs/actions/sync_to_main.md**
   - 場所: `/docs/actions/sync_to_main.md`
   - AI への指示書
   - 理解チェック付き

### ファイル修正

1. **scripts/sync-to-main.js**
   - `switchToMain()` 関数を修正
   - ブランチ切り替えモードを削除
   - worktree 必須化

2. **scripts/commit-main.js**
   - worktree チェックを修正
   - worktree が見つからない場合はエラー

3. **DEVELOP.md**（後から修正）
   - Step 3 に「**ユーザーが実行**」を追加
   - Step 4 に「**ユーザーが実行**」を追加

## 対話のポイント

### 良かった対話

1. **README.md のリンク問題**
   - ユーザー: 「README.md って main に公開されるので DEVELOP.md は develop のみのものなのでリンク切れになりますね？」
   - → main でのリンク切れを防ぐため、README.md から DEVELOP.md へのリンクを削除

2. **worktree の必須性**
   - ユーザー: 「main と汎用の関係性って必要ですっけ？」
   - → スクリプトを確認し、worktree がオプションであることを発見
   - ユーザー: 「ブランチ切り替えってやったことないんですが、main ブランチが存在しなければ作成も含めてめちゃ怖い仕様ですね」
   - → A案（worktree 必須）を採用

3. **ユーザー実行の明示**
   - ユーザー: 「npm run commit-main は人間が実行するのを明示で。これかってに AI がやりがちでバグるのでw」
   - → DEVELOP.md と docs/actions/sync_to_main.md の両方で明示

4. **理解チェックの追加**
   - ユーザー: 「actions のほかの指示書を見てほしいのですが、初手で、理解しているかのチェックをこちらに知らせるフェーズがあると、伝達度が増します」
   - → 他の指示書（git_commit.md, 00_session_end.md）を参考に、理解チェックを追加

### 反省点

1. **勝手に進めすぎた**
   - 最初に既存文献を確認せずに新しいノートを作成してしまった
   - ユーザーに計画を確認せずに実装を進めてしまった
   - → 今後は必ず計画を立てて、ユーザーに確認してから実装

2. **コミットルールを意識していなかった**
   - `docs/actions/git_commit.md` を確認していなかった
   - → 常にコミット前にルールを確認する習慣をつける

## 学び

### 1. 対話の重要性

ユーザーからのフィードバック：
> 「ああ、うれしい。ちゃんと「対話」になってきてる！」

- 一方的に実装するのではなく、ユーザーと対話しながら進める
- 疑問点や選択肢をユーザーに提示し、承認を得る
- ユーザーの意図を正確に理解する

### 2. ダブル命令の効果

- DEVELOP.md と docs/actions/sync_to_main.md の両方で「ユーザーが実行」を明記
- AI が勝手に実行するのを強く抑制できる
- 複数の場所で同じルールを明記することで、伝達度が増す

### 3. worktree の安全性

- ブランチ切り替えは AI のコンテキストを混乱させる
- worktree を必須にすることで、安全性が向上
- エラーメッセージでセットアップ方法を案内することで、ユーザビリティを維持

### 4. 理解チェックの効果

- 指示書の冒頭で理解チェックを行うことで、AI が指示を正確に理解しているか確認できる
- ユーザーとの認識齟齬を早期に発見できる
- 他の指示書（git_commit.md, 00_session_end.md）のパターンを踏襲することで、一貫性を保つ

## 今後の展望

### DEVELOP.md の改善

- worktree 以外のセットアップ手順を追加（必要に応じて）
- トラブルシューティングセクションの充実
- よくある質問の追加

### docs/actions/ の拡充

- 他のワークフロー（リリース、テスト、レビューなど）の指示書作成
- 理解チェックのフォーマット統一
- 既存の指示書の見直し

### スクリプトの改善

- sync-to-main の dry-run モード追加
- commit-main のコミットメッセージ履歴表示
- エラーメッセージの改善

## 関連ドキュメント

### 今回作成したドキュメント

- [DEVELOP.md](../../DEVELOP.md) - develop ブランチの運用ガイド
- [docs/actions/sync_to_main.md](../actions/sync_to_main.md) - sync-to-main アクション指示書

### ブランチ戦略

- [ブランチ戦略の変遷](./2026-03-13-14-30-00-branch-strategy-revision-develop-main.md) - develop/main 体制の背景と理由

### 同期ワークフロー

- [sync-to-main と commit-main の併走フロー](./2026-03-15-13-15-00-sync-to-main-commit-main-workflow.md) - 詳細な使い方と AI サポート
- [sync-to-main の worktree 対応](./2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装](./2026-03-14-14-00-00-commit-main-wizard-implementation.md)

---

**最終更新**: 2026-03-26
**作成者**: Claude Code (AI)
