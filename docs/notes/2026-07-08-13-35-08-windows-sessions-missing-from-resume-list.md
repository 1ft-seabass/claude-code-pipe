---
tags: [windows, send-mode, claude-code-cli, resume, vscode-extension, known-limitation]
---

# Windows: pipe 経由で作成したセッションが `/resume` 一覧・VSCode拡張の履歴に出ない件 - 調査記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-08
**関連タスク**: Windows native Send Mode 運用中に発覚した Claude Code CLI 側の挙動調査

## 問題

v0.8.4 で Windows ネイティブ Send Mode に対応した後、ユーザーが実際に Windows 上で pipe 経由のセッション操作を継続的に使う中で、以下の疑問が持ち上がった。

- `claude -r` でセッション一覧を確認すると入力ができない画面になる
- Claude Code for VSCode 拡張のログ同期が不安定に見える
- pipe（`POST /sessions/new`）で作ったセッションが、対話的な `/resume` や VSCode拡張の履歴一覧に出てこない

## 試行錯誤

### アプローチA: `claude -r` の入力不可問題を調査

**試したこと**: VSCode統合ターミナル・PowerShell単体の両方で `claude -r` を実行し、矢印キーでの選択を試行

**結果**: どちらでも矢印キーが効かない

**理由**: pipe とは無関係な、Claude Code CLI（v2.1.204）自体の `-r` TUI の挙動と判明。`claude` を対話的に起動して `/resume` スラッシュコマンドを使う方法に切り替えたところ問題なく操作できた。この件は pipe 側で対応できる話ではないため、これ以上は追わない。

---

### アプローチB: セッション一覧に出てこない現象の切り分け（ディレクトリエンコーディング説）

**試したこと**: pipe に送った `projectPath` の文字列と、対話的に `claude` を起動したディレクトリの `pwd` を比較。`.claude\projects\` 配下に、大文字小文字や区切り文字の違いで別ディレクトリが複数できていないか確認

**結果**: 該当なし（ディレクトリは分かれていなかった）

**理由**: pipe が `spawn(..., { cwd: projectPath })` に渡す文字列表現の違いが原因、という仮説は棄却された

---

### アプローチC（結論）: `entrypoint` フィールドによるフィルタリング説

**試したこと**: pipe（`claude -p`）経由で作成したセッションと、対話的に作成したセッションの JSONL トランスクリプトを比較

**結果**: 原因を特定（ユーザー側の調査による）

**理由**:
- JSONL の各行に記録される `entrypoint` フィールドの値が、`claude -p` / Claude Agent SDK 経由のセッションでは `"sdk-cli"`、対話的セッションでは `"cli"` になっている
- `/resume` ピッカーや VSCode拡張のセッション一覧は、この `entrypoint`（またはそれに類するメタデータ）でフィルタリングしており、`sdk-cli` 起点のセッションを一覧から除外していると推測される
- 一方で `claude --resume <session-id>` のように明示的にセッションIDを指定すれば正常に再開できる。JSONL自体は正しい場所・形式で保存されており、データ消失や resume 機能自体の破損ではない

## 解決策

pipe 側のコード（`src/sender.js` は常に `claude -p` でプロセスを起動）を変更して回避する手段はない。`entrypoint: sdk-cli` は `-p` フラグを使う限り Claude Code CLI 側が自動的に付与するものであり、pipe から変更する余地がない。

**方針**: これは claude-code-pipe のバグではなく、Claude Code CLI 側の一覧表示の仕様（意図的か未整理かは不明）に起因する制約と判断。GitHub Issue としての報告は今回は見送り、pipe 運用上の既知の制約としてこのノートに記録するに留める。

## 学び

- **`claude -p` / SDK 経由のセッションは「一覧に出ない」だけで生きている**: セッションIDさえ分かっていれば `--resume` で問題なく再開できる。pipe はセッションID自体をAPIレスポンスとして返している（`POST /sessions/new` の `sessionId`）ので、pipe を使う運用では一覧に頼る必要はそもそもない
- **Windows + VSCode拡張の組み合わせでは特に発見可能性の問題になりやすい**: VSCode拡張のセッション一覧パネルを普段の入り口にしているユーザーだと、pipe が裏で作っているセッションの存在に気づけない。運用上は「pipe が返す `sessionId` を記録・追跡する」ことが必須になる
- **`claude -r` の矢印キー不具合は無関係な別問題だった**: 症状が似た体感（「セッションを確認しようとすると上手くいかない」）でも、原因は全く別（CLI自体のTUI不具合 と 一覧フィルタリング）だったため、最初に切り分けを丁寧に行ったことで無駄な深掘りを避けられた

## 今後の改善案

- pipe の README/DETAILS に「pipe 経由で作成したセッションは `/resume` や VSCode拡張の履歴一覧には表示されない。`sessionId` は必ず呼び出し側で保持・追跡すること」という既知の制約を明記する
- Claude Code CLI 側でこの挙動が変わる可能性があるため、将来のバージョンアップ時に再確認する

## 関連ドキュメント

- [Windows native Send Mode 実装ノート](./2026-07-07-21-53-49-windows-native-send-mode-implementation.md)
- [extractProjectPath Windows対応ノート](./2026-07-08-09-53-14-extract-project-path-windows-fix.md)
- [pre-commit hook main worktree 障害の調査・修正ノート](./2026-07-08-12-22-51-precommit-hook-main-worktree-regression.md)

---

**最終更新**: 2026-07-08
**作成者**: AI
