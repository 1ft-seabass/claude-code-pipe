---
tags: [security, secretlint, gitleaks, pre-commit, simple-git-hooks, setup-securecheck]
---

# secretlint + gitleaks 導入（setup-securecheckウィザード） - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-10
**関連タスク**: 1ft-seabass/my-ai-collaboration-patterns の `setup-securecheck` パターンを使ったセキュリティチェック導入

## 問題

`npx degit` で取得した `setup-securecheck.md`（ウィザード形式の導入手順書）に沿って、secretlint + gitleaks による pre-commit 自動スキャンを導入する。このリポジトリは以前のセッションで一部（`.secretlintrc.json`、`gitleaks.toml`、npm scripts、simple-git-hooks 設定）が既に導入済みだったため、真っさらな新規導入ではなく「既存導入プロジェクトへの追従・修正」フローになった。

## 試行錯誤

### アプローチA（ウィザードの指定通り）

**試したこと**: Phase 3 ステップ3.3 の指示に従い、`package.json` の `simple-git-hooks.pre-commit` をテンプレート通りの `"node scripts/pre-commit.js"` に単純化。

**結果**: 危険と判断し即座に差し戻し

**理由**: このリポジトリは `main`（`/home/node/workspace/repos/claude-code-pipe`）と `develop`（`/home/node/workspace/repos/claude-code-pipe-develop`）を git worktree で共有しており、pre-commit フックは両 worktree で共有される。`scripts/pre-commit.js` は `develop` にしか存在しないため、単純化すると `main` 側で毎回 `Cannot find module` エラーになりコミットが失敗する。実際に過去（2026-07-08、commit `e72d2b0`）にこの問題が発生し修正された経緯があった（[pre-commit hook が main worktree で常に失敗する不具合 - 調査・修正記録](./2026-07-08-12-22-51-precommit-hook-main-worktree-regression.md) 参照）。

---

### アプローチB（ガード式を維持・成功）

**試したこと**: `"if [ -f scripts/pre-commit.js ]; then node scripts/pre-commit.js; fi"` のガード式を維持したまま、`scripts/pre-commit.js` 本体だけをテンプレート最新版に更新。

**結果**: 成功

**理由**: ガード式はファイルが存在する場合は `node scripts/pre-commit.js` の exit code をそのまま伝播するため、ウィザードが警告する `|| true` 型の握りつぶしとは異なり検出精度は落ちない。`main` 側ではファイルが存在しないため何もせず exit 0 になるだけで、`develop` 側の動作には影響しない。テストコミット・ネガティブテスト（3.6/3.6.5）で実際にブロックされることを確認済み。

## 解決策

Phase 0〜3 を一通り実施し、以下を最終状態とした：

- `.secretlintrc.json` / `gitleaks.toml`: 既存を維持（`gitleaks.toml` の検出ルール0件バグ修正は別ノート [gitleaks.toml 検出ルール0件バグ - 診断・修正記録](./2026-07-10-10-22-56-gitleaks-toml-zero-rules-bugfix.md) 参照）
- `scripts/pre-commit.js` / `scripts/security-verify.js` / `scripts/install-gitleaks.js`: テンプレート最新版に更新
- `package.json` の `simple-git-hooks.pre-commit`: ガード式のまま維持（変更なし）
- `.gitignore`: 既に `bin/gitleaks` / `bin/gitleaks.exe` / `.logs/` が個別指定済みのため変更不要と判断

**実装場所**: `package.json`, `gitleaks.toml`, `scripts/pre-commit.js`, `scripts/security-verify.js`, `scripts/install-gitleaks.js`

**主なポイント**:
1. 外部パターンのテンプレートをそのまま適用する前に、リポジトリ固有の事情（worktree構成）との整合性を必ず確認する
2. `npm run security:verify:testrun` のヘルスチェック結果は「passed の数」ではなく「どの項目が❌か」で判断する
3. 検出精度に関わる項目（gitleaks.toml のルール有無、pre-commit の exit code 握りつぶし）は自動チェックだけでなく実コミット・ネガティブテストで実地検証する

## 学び

- git worktree はデフォルトで hooks ディレクトリを共有する（per-worktree ではない）。1つの `.git/hooks/pre-commit` が全 worktree に適用されるため、worktree ごとにファイル構成が違う場合はガードが必須。
- `setup-securecheck` の `security-verify.js` は `.git/hooks/pre-commit` の存在確認を `fileExists('.git/hooks/pre-commit')` という決め打ちパスで行っており、worktree 構成（`.git` がファイルでポインタになるケース）では常に❌になる誤検知がある。この場合は実コミットでの動作確認が必須。
- テンプレートの `cp` による単純上書きは、既存導入プロジェクトでは差分（カスタマイズ）を握りつぶすリスクがあるため、`diff` で確認してから決定論的パッチスクリプト（`patch-gitleaks-toml.js` 等）や個別マージを使う判断が重要。

## 今後の改善案

- `main` ブランチにもこのセキュリティ設定一式を反映するタイミングを検討する（`sync-to-main` 運用のどこかで）。反映すれば `simple-git-hooks.pre-commit` のガードは不要になる。
- 可能であれば `security-verify.js` の pre-commit hook 存在チェックを `git rev-parse --git-path hooks/pre-commit` ベースにして worktree でも正しく解決できるようにする（upstream パターンへのフィードバック候補）。

## 関連ドキュメント

- [pre-commit hook が main worktree で常に失敗する不具合 - 調査・修正記録](./2026-07-08-12-22-51-precommit-hook-main-worktree-regression.md)
- [gitleaks.toml 検出ルール0件バグ修正記録](./2026-07-10-10-22-56-gitleaks-toml-zero-rules-bugfix.md)

---

**最終更新**: 2026-07-10
**作成者**: AI
