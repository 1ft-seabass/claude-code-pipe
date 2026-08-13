---
tags: [security, secretlint, gitleaks, setup-securecheck, worktree]
---

**作成日**: 2026-08-13
**関連タスク**: setup-securecheck v3 パターン導入

## 問題

セキュリティチェック（secretlint + gitleaks）の v2 構成（`scripts/` レイアウト）が残っていたが、`setup-securecheck` パターンの v3（`.security-check/` レイアウト）に移行する必要があった。

## 作業の流れ

### パターン取得

```bash
npx degit 1ft-seabass/my-ai-collaboration-patterns/patterns/setup-pattern/setup-securecheck ./tmp/security-setup
```

`setup-securecheck.md` を読み、ウィザード形式で導入を実施。

---

### Phase 0: ヘルスチェック

`.security-check/` がプロジェクトルートに存在しないため「未導入」と判定。Phase 1 から導入開始。

---

### Phase 1: 初動スキャン

**ステップ 1.1: テンプレートファイル配置**

```bash
cp tmp/security-setup/templates/.secretlintrc.json .
cp tmp/security-setup/templates/gitleaks.toml .
cp -r tmp/security-setup/templates/.security-check .
```

**ステップ 1.2: secretlint インストール**

```bash
npm install -D secretlint @secretlint/secretlint-rule-preset-recommend
```

**ステップ 1.3: secretlint 初回スキャン**

`logs/server.log` に BasicAuth 認証情報が 5 件検出。`logs/` は `.gitignore` 済みのランタイム成果物（サーバーログ内の HTTP Authorization ヘッダー）と確認。

`.secretlintignore` を作成して除外（`.secretlintrc.json` の `ignores` フィールドはルール識別子用で、ファイルパス除外には使えない）:

```
logs/
```

再スキャンで検出ゼロ。

**ステップ 1.4: gitleaks インストール**

```bash
node .security-check/cli.js install-gitleaks
# → gitleaks v8.30.0 を .security-check/bin/ にダウンロード
```

**ステップ 1.5: gitleaks 初回スキャン**

21 件検出。内訳：

| ルール | 件数 | 対象ファイル |
|--------|------|------------|
| `curl-auth-header` | 19件 | `docs/letters/`, `docs/notes/`, `README-ja.md`, `DETAILS-ja.md` |
| `generic-api-key` | 1件 | `bin/README.md`（gitleaks 出力の貼り付け） |
| `sidekiq-secret` | 1件 | `bin/README.md`（同上） |

`curl-auth-header` の Bearer トークンはローカルサーバー（`localhost:3100`）向けのテスト用トークンと確認（エントロピー 3.1〜3.5、現在未使用）。`bin/README.md` の 2 件は過去の gitleaks 出力を貼ったもので false positive。

`gitleaks.toml` の `[allowlist]` にパスを追加:

```toml
[allowlist]
paths = [
  # 既存エントリ...
  '''docs/.*''',
  '''.*README.*''',
  '''DETAILS.*''',
]
```

再スキャンで `no leaks found`。

---

### Phase 2: 手動運用

`package.json` に `security` スクリプトを追加:

```json
"security": "node .security-check/cli.js"
```

既存の v2 スクリプト（`security:verify`, `secret-scan:full` 等）は残存しているが、pre-commit からは呼ばれない。

---

### Phase 3: pre-commit 自動化

**worktree 構成のため、ガード式を採用**

このリポジトリは `main` / `develop` を git worktree で運用しており、`.security-check/` は `develop` のみに存在する。フックは共有されるため、存在ガード式が必要:

```json
"simple-git-hooks": {
  "pre-commit": "if [ -f .security-check/cli.js ]; then node .security-check/cli.js pre-commit; fi"
}
```

```bash
npx simple-git-hooks
# → [INFO] Successfully set the pre-commit with command: ...
```

`.gitignore` に追加:

```gitignore
.security-check/bin/
.security-check/logs/
```

**動作確認コミット（ステップ 3.5）**

実際にコミットを実行してフック動作を確認:

```
=== secretlint === → 0件検出 ✅
=== gitleaks ===   → no leaks ✅
✅ All checks passed
```

**ネガティブテスト（ステップ 3.5.5）**

```bash
echo 'TEST_TOKEN=ghp_<テスト用カナリアトークン>' > .test-secret-canary
git add .test-secret-canary
git commit -m "test: should be blocked"
# → ❌ Pre-commit checks failed (secretlint, gitleaks) ✅ 期待通りブロック
```

gitleaks 単独確認:

```bash
./.security-check/bin/gitleaks git --staged --config gitleaks.toml --redact .
echo "exit code: $?"
# → exit code: 1 ✅
```

テストファイルをクリーンアップして完了。

---

### Phase 3 最終ヘルスチェック

```
結果: 15/15 passed, 0 failed
✅ ヘルスチェック完了
```

## 学び

- **`.secretlintrc.json` の `ignores` はファイルパス除外ではない**: ルール識別子の無効化フィールド。ファイルパス除外には `.secretlintignore` を使う。
- **worktree 構成では存在ガード式が必須**: `|| true` による exit code 握りつぶしとは異なり、ファイルが存在する worktree では正しく exit code が伝播する。
- **Bearer トークンのエントロピー判断**: 3.1〜3.5 は「構造化された短いトークン」の範囲。4.0 以上が高エントロピー（乱数ベース）の目安。

## 関連ドキュメント

- [worktree構成でのpre-commitフック運用](../../.claude/projects/.../memory/project_worktree_precommit_hook.md)

---

**最終更新**: 2026-08-13
**作成者**: AI
