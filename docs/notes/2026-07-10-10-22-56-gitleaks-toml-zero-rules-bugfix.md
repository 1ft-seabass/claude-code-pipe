---
tags: [security, gitleaks, secretlint, false-negative, bugfix]
---

# gitleaks.toml 検出ルール0件バグ - 診断・修正記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-10
**関連タスク**: secretlint/gitleaks 導入（[secretlint + gitleaks 導入（setup-securecheckウィザード） - 開発記録](./2026-07-10-10-22-20-secretlint-gitleaks-setup-securecheck-wizard.md) 参照）に伴うヘルスチェックで再検出

## 問題

`gitleaks.toml`（リポジトリルート）には `[allowlist]` セクションしか無く、`[[rules]]` も `[extend]` も存在しなかった。gitleaks は `--config` でカスタム設定を渡すと組み込みルールセットを丸ごと置き換える仕様のため、`npm run secret-scan:full` や pre-commit フックの gitleaks 部分は**検出ルール0個**で動作していた。2026-07-09 の別セッションで診断のみ行い、修正は別セッションで実施する方針としていた。

## 試行錯誤

診断は前セッションで完了していたため、今回は再現確認 → 修正 → 検証のみ。

### 診断の再確認（前セッション、2026-07-09時点の記録より）

AWS/Slack 風のダミーシークレットを含むテストファイルを、gitleaks デフォルト設定では検出できたが、このリポジトリの `gitleaks.toml` を渡すと「no leaks found」になることを確認済み。`[extend] useDefault = true` を追加した状態で全履歴スキャン（219 commits）した際は21件ヒットしたが、全て偽陽性（`docs/letters`・`notes` のプレースホルダートークン、gitleaks 自身の同梱 `bin/README.md` のサンプル出力）で、実際のシークレット漏洩は無かった。

### 今回の修正（成功）

**試したこと**: `setup-securecheck` パターン同梱の `patch-gitleaks-toml.js`（`[extend] useDefault = true` の追記と `tmp/.*` → `^tmp/.*` のアンカー化のみを機械的に行うスクリプト）を実行。

**結果**: 成功

**理由**: 単純な `cp` によるテンプレート上書きだと、このリポジトリの `gitleaks.toml` に既にある独自の allowlist（`node_modules/.*`、`dist/.*` など）を握りつぶすリスクがあった。`diff` で確認したところ差分は「`[extend]` が無い」「`tmp/.*` が未アンカー」の2点のみで、パッチスクリプトの対象と完全に一致したため、これを使って安全に適用した。

## 解決策

`gitleaks.toml` に以下を追加：

```toml
[extend]
useDefault = true
```

あわせて `paths` の `tmp/.*` を `^tmp/.*` にアンカー化（`src/mytmp/` のような無関係なディレクトリを誤って除外しないため）。

**実装場所**: `gitleaks.toml`

**検証方法**:
- `npm run security:verify` の「gitleaks 機能的カナリアテスト」が ❌ → ✅ に変化（合成シークレットを正しく検出）
- 実際に GitHub PAT 風カナリア値をステージしてコミットし、`gitleaks git --staged --config gitleaks.toml --redact .` が `exit code: 1` を返すことを確認

**主なポイント**:
1. gitleaks は `--config` 指定時に組み込みルールを完全に置き換える（マージではない）ため、`[extend] useDefault = true` を明示しない限り `[allowlist]` だけの設定ファイルは「常にクリーン判定」になる
2. 「ファイルが空でない」「文字列が含まれる」だけの静的チェックでは検出ルール0件バグを見逃す。実際に合成シークレットを検出できるかの機能テストが必須
3. 既存導入プロジェクトへの適用時は `cp` 上書きではなく `diff` → 決定論的パッチという手順を踏むことで、独自カスタマイズを保護できる

## 学び

- 「導入済み」に見える設定ファイルでも、実際に検出できているかは別途動作確認しないと分からない（このリポジトリでは pre-commit フックが**長期間ノーチェック同然**で動いていた可能性が高い）
- gitleaks の `--config` 完全置き換え仕様は見落としやすい落とし穴。`[extend] useDefault = true` の有無を必ずチェックリストに含めるべき

## 今後の改善案

- 過去の全履歴スキャンで検出された21件の偽陽性（プレースホルダートークン、`bin/README.md` サンプル出力）を `gitleaks.toml` の `regexes`/`paths` allowlist に追加して、`security:verify:testrun` の出力ノイズを減らす（任意、緊急性は低い）

## 関連ドキュメント

- [secretlint + gitleaks 導入（setup-securecheckウィザード） - 開発記録](./2026-07-10-10-22-20-secretlint-gitleaks-setup-securecheck-wizard.md)

---

**最終更新**: 2026-07-10
**作成者**: AI
