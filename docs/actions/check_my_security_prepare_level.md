# セキュリティ準備レベルチェック

このプロジェクトの機密情報保護体制を診断します。

## 📊 セキュリティレベル

| レベル | 状態 | リスク | 説明 |
|--------|------|--------|------|
| **Level 0** | docs-structure のみ | 🔴 高 | 手動チェックのみ、うっかり漏洩リスク大 |
| **Level 1** | ツールはあるが手動実行 | 🟡 中 | npm scripts で手動実行可能、忘れるリスク |
| **Level 2** | pre-commit 自動化済み | 🟢 低 | コミット時に自動チェック、安全（推奨） |

**注意:** AI の勝手プッシュは全力ブロック済み。プッシュ前は `@actions/01_git_push.md` で人力の厳格チェックを実施します。

---

## 🔍 診断内容

以下の項目を順番にチェックします:

1. **docs-structure の有無**
   - `docs/notes/` と `docs/letters/` ディレクトリの存在確認
   - AI がドキュメントを生成する環境か判定

2. **secretlint のインストール状況**
   - `npx secretlint --version` で確認
   - または `package.json` の devDependencies を確認

3. **gitleaks のインストール状況**
   - `gitleaks version` で確認
   - または `./bin/gitleaks version` で確認（Docker 環境）

4. **npm scripts の設定状況**
   - `package.json` に `secret-scan` スクリプトがあるか
   - 手動実行用のコマンドが用意されているか

5. **husky pre-commit フックの設定状況**
   - `.husky/pre-commit` ファイルの存在確認
   - secretlint と gitleaks が含まれているか確認

---

## 実行手順

1. 環境を診断
   - 上記の診断内容を順番に実行
   - 各項目の結果を記録

2. レベルを判定
   - **Level 0:** docs-structure のみ存在、ツール未導入
   - **Level 1:** secretlint/gitleaks はあるが、husky 未設定
   - **Level 2:** husky pre-commit で自動化済み

3. 診断結果を報告
   ```
   🔒 セキュリティ準備レベル診断結果

   現在のレベル: Level X (リスク: 高/中/低)

   ✅ または ❌ docs-structure 導入済み
   ✅ または ❌ secretlint インストール済み
   ✅ または ❌ gitleaks インストール済み
   ✅ または ❌ npm scripts 設定済み
   ✅ または ❌ pre-commit フック設定済み
   ```

4. 改善提案を提示（Level 0, 1 の場合）
   - **Level 0 の場合:**
     - secretlint + gitleaks の導入を強く推奨
     - シークレットスキャン導入ガイドへの参照を提示

   - **Level 1 の場合:**
     - pre-commit フックの設定を推奨
     - husky + lint-staged のセットアップ手順を提示

   - **Level 2 の場合:**
     - 「完璧です！安全に開発できます」と報告

5. 次のステップを案内
   - テスト駆動やリファクタリングアクションを使用する前に Level 1 以上を推奨
   - セキュリティツールの導入が必要な場合は、ユーザーに確認

---

## 📚 参考資料

### シークレットスキャン導入ガイド

プロジェクトに secretlint + gitleaks を導入する場合は、以下のガイドを参照してください:

- Phase 1: 初動スキャン（現状把握）
- Phase 2: 手動運用（npm scripts）
- Phase 3: pre-commit 自動化（husky）
- Phase 4: 個人用セットアップ（任意導入）

詳細は `docs/notes/` に「シークレットスキャン導入ガイド」があれば参照。

---

## 推奨タイミング

- **プロジェクト開始時** - 最初に環境確認
- **テスト駆動やリファクタリングアクションを使う前** - 安全確認
- **新しいメンバーが参加したとき** - 体制確認
- **不安になったとき** - いつでも実行可能

---

## 診断フローチャート

```
開始
 ↓
docs-structure 存在? → No → Level 0 未満（診断対象外）
 ↓ Yes
secretlint/gitleaks 導入? → No → Level 0（高リスク）
 ↓ Yes
husky pre-commit 設定? → No → Level 1（中リスク）
 ↓ Yes
Level 2（低リスク）✅
```
