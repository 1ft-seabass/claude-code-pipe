---
tags: [subscribers, webhook, project-path, bugfix, jsonl]
---

# extractProjectPath ハイフン入りパス復元バグの修正

**作成日**: 2026-06-04

## 問題

`src/subscribers.js` の `extractProjectPath` 関数が、ユーザー名やディレクトリ名にハイフンを含むパスを正しく復元できない。

Claude Code は `~/.claude/projects/` 配下のディレクトリ名で `/` を `-` に変換する。
例: `/home/seigo-tanaka/workspace/docker/test` → `-home-seigo-tanaka-workspace-docker-test`

既存のロジックは `existsSync` で候補パスを検証するが、サーバーが Docker 外など**パスが存在しない環境**では全パターンが失敗し、フォールバック（全ハイフンを `/` に変換）が動く。結果として `seigo-tanaka` → `seigo/tanaka` となり、後続の `spawn` で `cwd` が存在せず `ENOENT` エラーが発生する。

**再現条件**:
- ユーザー名やパスにハイフンを含む
- かつ `existsSync` でパスを検証できない環境（Docker 外で動作するサーバーなど）

## 分析

### JSONL の cwd フィールドを使う方針の検討

JSONL ファイルの各行に `"cwd"` フィールドが含まれている。Claude Code が書き込む実際のプロジェクトパスなので曖昧さがない。

```json
{"type":"user", ..., "cwd":"/home/seigo-tanaka/workspace/claude-code-pipe", ...}
```

### extractProjectPath が呼ばれるタイミングの検証

`extractProjectPath` は `handleSubscriberEvent` 内（subscribers.js:231, 280）で user/assistant メッセージ emit 時のみ呼ばれる。`file-history-snapshot` 行はイベントを発火しないため、最初に呼ばれる時点では JSONL に必ず user メッセージが存在している。

- **新規セッション**: JSONL = snapshot 行 + user メッセージ行。user メッセージ emit 時には既にファイルに書き込まれている
- **再開セッション**: 過去の user メッセージが先頭付近に存在するため、先頭 2KB を読めば確実に `cwd` が取れる

→ タイミングの問題は発生しない。

### ファイル読み取りの実装方針

`readFileSync` でファイル全体を読むと JSONL が大きい場合に重い。`fs.openSync` + `fs.readSync` で先頭 2KB のみ読む方式を採用。キャッシュがあるため2回目以降はファイル読み取りが発生しない。

## 解決策

**実装場所**: `src/subscribers.js:55-81`

キャッシュチェックの直後、既存の `existsSync` ロジックより前に JSONL 読み取りステップを追加。

**フォールバック順序**:
1. キャッシュ確認（既存）
2. JSONL 先頭 2KB から `cwd` フィールドを取得（新規）
3. `existsSync` による候補パス検証（既存）
4. 全ハイフンを `/` に変換（既存・最終フォールバック）

**主なポイント**:
1. `fs.openSync` + `fs.readSync(fd, buffer, 0, 2048, 0)` で先頭 2KB のみ読む
2. `try/finally` で `fs.closeSync` を保証しファイルディスクリプタリークを防ぐ
3. 外側の `try/catch` でファイル読み取り失敗時は既存ロジックへフォールバック
4. 既存ロジックは一切変更なし

## 学び

- `existsSync` ベースのパス復元は「サーバーがプロジェクトと同じファイルシステム上にある」前提があった。Docker 外運用では成立しない
- JSONL ファイル自体が正解のパスを持っている。ディレクトリ名のデコードより信頼性が高い
- ファイル読み取り系の処理は `finally` で必ずクローズする

## 今後の改善案

- `existsSync` ロジックは `cwd` が取れれば事実上デッドコードになる。将来的には削除を検討してもよい（ただし後方互換のため当面は残す）

---

**最終更新**: 2026-06-04
**作成者**: AI
