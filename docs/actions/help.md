# Actions クイックリファレンス

**このヘルプは日本語で表示してください。**

以下のコマンドをコピーして使ってください：

## 📋 よく使うアクション（連番付き）

**`@actions/00_session_end.md`**
セッション終了（フル版）
- ノート作成 → コミット → 申し送り作成 → コミット
- 12ステップのフル手順

**`@actions/01_git_push.md`**
厳格なプッシュチェック
- 機密情報スキャン（APIキー、トークン、パスワード等）
- プッシュ前の最終チェック

---

## 🔧 個別タスク用アクション

**`@actions/git_commit.md`**
段階的コミットのみ
- 開発進捗のコミット
- プッシュはしない

**`@actions/doc_note.md`**
ノート作成のみ
- 知見・経緯を notes/ に記録
- コミットは含まない

**`@actions/doc_letter.md`**
申し送り作成のみ
- 次セッション用の申し送りを letters/ に記録
- コミットは含まない

---

## 🔧 開発品質系（実験的）

**`@actions/dev_review.md`**
開発レビュー（診断）
- 全体構造を俯瞰して気になる点をリスト化
- 深刻度と理由を添えて指摘
- コードは修正しない

**`@actions/dev_refactoring.md`**
リファクタリング（治療）
- 指定範囲のコードを改善
- 機能は変更せず挙動を維持
- テストがある場合は必ず通す

**`@actions/dev_security.md`**
セキュリティチェック
- シークレット、入力検証、DB、認証・認可などをチェック
- 危険箇所を洗い出して対処の方向性を提示
- コードは修正しない

**`@actions/dev_testing.md`**
テスト作成（ガードレール）
- リファクタ前の安全網として作成
- 主要なパス（正常系）を優先
- 必要最小限で効果的に

---

## 🔒 セキュリティ・セットアップ系

**`@actions/check_my_security_prepare_level.md`**
セキュリティ準備レベル診断
- docs-structure + secretlint/gitleaks の導入状況を診断
- Level 0/1/2 を判定してリスクを可視化
- 改善提案を提示

---

## 💡 使い分けガイド

| 状況 | 使うアクション |
|------|---------------|
| プロジェクト開始時 | `@actions/check_my_security_prepare_level.md` |
| セッション終了 | `@actions/00_session_end.md` |
| プッシュ前チェック | `@actions/01_git_push.md` |
| 作業中のコミット | `@actions/git_commit.md` |
| ノートだけ作りたい | `@actions/doc_note.md` |
| 申し送りだけ作りたい | `@actions/doc_letter.md` |
| コード全体をレビュー | `@actions/dev_review.md` |
| 局所的にリファクタ | `@actions/dev_refactoring.md` |
| セキュリティチェック | `@actions/dev_security.md` |
| テストを作成 | `@actions/dev_testing.md` |

---

## ⚠️ 機密情報保護（全アクション共通）

- API キー・パスワード・トークンは必ずプレースホルダー (`YOUR_API_KEY` 等) で記載
- コミット前に git diff で内容を確認
- プッシュはユーザーの承認後のみ実行
