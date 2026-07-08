---
tags: [secretlint, pre-commit, git-hooks, secret-leak, watcher]
---

# pre-commit secretlint 握りつぶしと server.log 内 PAT 漏洩の調査・対応

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-08
**関連タスク**: pre-commit secretlint 警告の調査と恒久対応

## 問題

`git commit` のたびに `scripts/pre-commit.js` の secretlint チェックが失敗表示（`❌ Pre-commit checks failed`）されるが、コミット自体は毎回成立していた。表面上は「チェックが動いているのに無視されている」状態。

## 試行錯誤

### 原因調査（成功）

3つの要因が重なっていた。

1. `logs/server.log` に GitHub Personal Access Token（`github_pat_YOUR_TOKEN` 形式）と Basic Auth 資格情報らしき文字列が実在し、secretlint に恒常的にヒットしていた
2. `scripts/pre-commit.js` が `npx secretlint "**/*"` を実行しており、`.gitignore` を無視してファイルシステム上の全ファイルをスキャンしていた（git の追跡・ステージ状態に関係なくヒットする）
3. `package.json` の `simple-git-hooks.pre-commit` が `... && node scripts/pre-commit.js || true` となっており、secretlint が exit 1 で失敗してもシェルコマンド全体としては成功扱いになりコミットをブロックしていなかった

`logs/server.log` 自体は `.gitignore` 済み・未追跡で、git 履歴には一度も入っていないことを確認済み（`git log --all --full-history -- logs/server.log` が空）。

### なぜ `logs/server.log` にトークンが混ざったか（原因究明）

- `src/watcher.js` が Claude Code のセッション JSONL（`~/.claude/projects/**/sessions/**/*.jsonl`）を監視
- `src/parser.js` がセッション行の `message.content`（Bash ツールの `tool_use.input.command` など、実行した生コマンド文字列を含む）を無加工でコピー
- `src/index.js` の `writeLog()` がそれを一切マスキングせず `logs/server.log` に追記

つまり「誰かが GitHub PAT を Basic Auth 形式で git リモート URL に埋め込んだコマンド（例: `git remote set-url` に認証情報付き HTTPS URL を渡す形）を一度でも打てば、そのコマンド文字列がそのまま `logs/server.log` に複製される」構造だった。意図的な漏洩機能ではなく、汎用モニタリングの副作用。

さらに調査中、テスト用の偽トークンや調査プロンプト中の例示テキストが同じ経路でリアルタイムに `logs/server.log` に記録されるのを実地で確認し、この構造を裏付けた（実害はないテストデータで、確認後に削除済み）。

同じ生の `message` は `src/subscribers.js` を通じて `config.json` の `subscribers` にも HTTP POST でそのまま転送されている。subscribers が Tailscale 内などの信頼できるネットワーク内を向いていれば実害は限定的だが、外部の公開エンドポイントを指定した場合はネットワーク境界を実際に越えて漏れる。

## 解決策

### 恒久対応（実施済み）

1. `scripts/pre-commit.js`: secretlint のスキャン対象を `"**/*"`（全ファイル）から `git diff --cached --name-only --diff-filter=ACM` で得たステージ済みファイルのみに変更。`.gitignore` されたファイルは自動的に対象外になる
2. `package.json`: `simple-git-hooks.pre-commit` から `|| true` を除去し、`npx simple-git-hooks` でフック再生成。secretlint/gitleaks が失敗すれば実際にコミットがブロックされることを確認済み
3. `src/index.js`: `watcher.on('message', ...)` の `writeLog('watcher-message', event)` 呼び出しを削除。生のセッション内容を `logs/server.log` に記録しないようにした
4. `DETAILS.md`: Security Considerations に `subscribers[].url` は信頼できるネットワーク内（Tailscale tailnet や同一 Docker ネットワークなど）に限定すべき旨を追記
5. `logs/server.log` に混入していた実トークンを含む行を削除（該当行のみ、ファイル全体は削除せず）

**実装場所**:
- `scripts/pre-commit.js`（secretlint 呼び出し部分）
- `package.json:44`（`simple-git-hooks.pre-commit`）
- `src/index.js`（watcher の message イベントハンドラ）
- `DETAILS.md`（Security Considerations セクション）

### スコープ外とした対応

- **PAT のローテーション**: 漏洩していたトークンの失効・再発行は GitHub 側の人力操作が必要なため、今回のスコープには含めない
- 判断の理由: `logs/server.log` はそもそも `.gitignore` で保護されており git 履歴には一度も入っていない。「漏洩」という観点では、Claude Code 自身のセッション JSONL に平文コマンドが残ることと同レベルのリスクであり、claude-code-pipe が特別に危険を上乗せしているわけではない。境界（Tailscale + Docker によるネットワーク隔離）の中で完結している既知のトレードオフとして扱う、という意思決定

## 学び

- 「ツールが入っている」ことと「ツールが機能している」ことは別物。`|| true` のようなエラー握りつぶしは、導入初期の「とりあえず動かす」目的で入りがちだが、恒久化すると気づかれないまま無効化状態が続く
- スキャン対象が広すぎる（`.gitignore` 非考慮）と、無関係な誤検知が「エラーは出るが無視してよいもの」という学習を運用者にさせ、握りつぶしを誘発する一因になる
- pipe 系ツール（セッション内容をそのまま転送・記録する設計）は、その性質上「生データを右から左に流す」ことが本質的な役割であり、上級者・信頼ネットワーク前提の運用になる。ログ記録範囲は「本当に必要な情報だけ」に絞る方が安全側に倒せる

## 今後の改善案

- セキュリティチェック機構（pre-commit/secretlint 導入プロセス）自体への一般的なフィードバック（「ツールはあるが握りつぶされていた」型のリスクをどう診断で検知するか）は、このプロジェクト固有の話ではないため別ルートで伝達予定。詳細はこのノートでは割愛
- 将来的に余裕があれば、watcher 全体（`session-started` などのメタデータ系ログ含む）にマスキング機構を入れることも検討可能（今回は `watcher-message` カテゴリの除外のみで対応）

## 関連ドキュメント

- `docs/actions/check_my_security_prepare_level.md`（既存のセキュリティ準備レベル診断。今回の教訓を踏まえたアップデートは別途検討）

---

**最終更新**: 2026-07-08
**作成者**: AI（Claude）
