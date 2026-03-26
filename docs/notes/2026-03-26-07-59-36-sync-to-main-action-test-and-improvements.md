---
tags: [sync-to-main, actions, test, improvements, v0.6.1]
---

# sync-to-main アクションの実戦テストと改善 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-26
**関連タスク**: 優先度1: docs/actions/sync_to_main.md の実戦テスト

## 問題

前回のセッション（2026-03-26-07-18-45）で docs/actions/sync_to_main.md を作成したが、実際に動作するか検証されていなかった。また、実戦で使ってみないと改善点が見えてこない。

## 実戦テスト

### 対象リリース
v0.6.1 を develop から main に同期する作業で実戦テスト。

### テスト手順

#### Step 1: 理解チェック
AI が docs/actions/sync_to_main.md を読み、理解チェックを提示。

**結果**: ✅ 成功
- チェックボックスが正しく機能した
- ユーザーから「OK」のゴーサインを得て作業開始

#### Step 2: sync-to-main の実行
AI が `npm run sync-to-main` を実行。

**結果**: ✅ 成功
- develop から main への同期が正常に完了
- package.json のクリーンアップも正常
- 変更がステージングされた

#### Step 3: package.json の確認
AI が main ブランチの package.json を確認。

**結果**: ✅ 成功
- devDependencies が削除されている
- scripts に start と dev のみが残っている
- 開発用スクリプトが削除されている

#### Step 4: commit-main の案内
AI がユーザーに commit-main の実行を案内。

**結果**: ❌ 改善の余地あり

ユーザーから以下の指摘を受けた：

1. **コミットメッセージの計画不足**
   - 「sync: v0.6.1 from develop」だと内容が不明確
   - main に同期されるのは CHANGELOG のみ（DEVELOP.md と sync_to_main.md は develop 専用）
   - commit-main 目線で書くべき → 「sync: v0.6.1 from develop - CHANGELOG 設置」

2. **ウィザードの説明不足**
   - ウィザードで「sync:」は自動付加されることを明記すべき

3. **パス指定の不足**
   - npm コマンドだけだとカレントフォルダでハマる
   - `cd ~/workspace/repos/claude-code-pipe` を明記すべき

### 最終結果

ユーザーが以下を実行して成功：
```bash
cd ~/workspace/repos/claude-code-pipe-develop
npm run commit-main
# プレフィックス: 5 (sync)
# メッセージ: v0.6.1 from develop - CHANGELOG 設置
```

**結果**: ✅ main 同期完了！

## 改善実施

ユーザーの要望により、その場で docs/actions/sync_to_main.md を改善。

### 改善1: Step 2.5 の追加（コミットメッセージの計画）

**追加内容**:
```markdown
### Step 2.5: コミットメッセージの計画

AI が実行します。

main に何が同期されるかを確認し、適切なコミットメッセージを提案します。

**重要**: DEVELOP.md や sync_to_main.md などの develop 専用ファイルは main に同期されません。
sync-to-main.js の `filesToSync` を確認し、実際に main に反映される変更を特定してください。

例：
- v0.6.1: CHANGELOG の追加のみ → `v0.6.1 from develop - CHANGELOG 設置`
- v0.6.2: 新機能追加 → `v0.6.2 from develop - 新機能名`
```

**実装場所**: `docs/actions/sync_to_main.md:57-68`

**ポイント**:
- AI が sync-to-main.js の filesToSync を確認する責務を明記
- develop 専用ファイルは同期されないことを強調
- 具体例でメッセージの書き方を示す

### 改善2: ウィザードの説明改善

**変更内容**:
```markdown
- プレフィックス: 5 (sync) ← ウィザードが自動的に "sync:" を付けます
- メッセージ: "[AI が提案したメッセージ]"（例: "v0.6.2 from develop - 新機能名"）
```

**実装場所**: `docs/actions/sync_to_main.md:85-86`

**ポイント**:
- ウィザードの動作を明記（sync: は自動付加）
- AI が提案したメッセージを使うよう案内

### 改善3: パス指定の具体化

**変更内容**:
```markdown
cd ~/workspace/repos/claude-code-pipe
npm run commit-main
```

**実装場所**: `docs/actions/sync_to_main.md:80-81`

**ポイント**:
- カレントディレクトリ移動を明記
- npm だけだとカレントフォルダでハマる問題を解消

### 改善4: タグ作成の柔軟性

**追加内容**:
```markdown
**注意**: タグ作成をスキップする場合もあるため、ユーザーの判断に委ねてください。
```

**実装場所**: `docs/actions/sync_to_main.md:111`

**ポイント**:
- タグ作成は常に必要とは限らない
- ユーザーの判断を尊重

### 改善5: 理解チェックに Step 2.5 を追加

**変更内容**:
```markdown
- [ ] Step 2.5: コミットメッセージの計画（AI が実行可）
```

**実装場所**: `docs/actions/sync_to_main.md:10`

## 学び

### 学び1: 実戦テストの重要性
指示書は作っただけでは不十分。実際に使ってみることで、細かい改善点が見えてくる。

### 学び2: commit-main 目線の重要性
develop と main では同期される内容が異なる。commit-main のメッセージは「main に何が追加されるか」を基準に書くべき。

### 学び3: パス指定の明示
コンテナ環境では、カレントディレクトリが想定と異なる場合がある。`cd` コマンドを明記することで、ハマりポイントを減らせる。

### 学び4: ウィザードの挙動を明記
commit-main ウィザードは「sync:」を自動付加する。このような自動挙動は明記しないと混乱を招く。

## 検証結果

### ✅ うまくいったこと
- 理解チェックが機能した
- AI が勝手に commit-main を実行しなかった
- AI が勝手にタグ作成・プッシュを実行しなかった
- sync-to-main が正常に動作した
- その場で改善を実施できた

### 📝 改善できたこと
1. コミットメッセージの計画（Step 2.5 追加）
2. ウィザードの説明改善
3. パス指定の具体化
4. タグ作成の柔軟性の明記
5. 理解チェックの更新

## 今後の改善案

### 改善案1: filesToSync の自動表示
Step 2.5 で AI が scripts/sync-to-main.js の filesToSync を読み取り、同期対象を自動表示する仕組みがあると良い。

### 改善案2: CHANGELOG の diff 確認
Step 2.5 で develop と main の CHANGELOG の差分を確認し、メッセージ案に反映する。

### 改善案3: 実戦テストの定期化
次回のリリース（v0.6.2 以降）でも同様にテストを行い、さらなる改善点を洗い出す。

## 関連ドキュメント
- [DEVELOP.md と sync-to-main アクション構築の記録](./2026-03-26-07-13-56-develop-md-and-sync-to-main-action.md)
- [DEVELOP.md と actions 構築セッションの申し送り](../letters/2026-03-26-07-18-45-develop-md-and-actions.md)
- [docs/actions/sync_to_main.md](../actions/sync_to_main.md)

---

**最終更新**: 2026-03-26
**作成者**: Claude Code (AI)
