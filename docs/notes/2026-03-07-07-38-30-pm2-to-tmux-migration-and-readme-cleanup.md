---
tags: [tmux, pm2, process-management, documentation, refactoring]
---

# pm2 から tmux への移行と README のシンプル化 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-07
**関連タスク**: バックグラウンドプロセス管理の改善

## 背景

claude-code-pipe では常時起動サーバーをバックグラウンドで管理する必要があり、当初は pm2 を採用していた。しかし以下の課題が顕在化していた：

1. **pm2 がユーザーに混乱を与える**
   - README で pm2 が「推奨」と表示され、初心者に高度なツールを要求する形になっていた
   - 実際には `npm start` だけで十分動作するのに、pm2 が必須のような印象を与えていた

2. **開発環境での使いづらさ**
   - Docker Linux 環境での開発時、pm2 より tmux の方が Claude Code との相性が良い
   - tmux なら `capture-pane` でログ確認、`attach` でリアルタイム監視が直感的

3. **プロジェクトの立ち位置とのミスマッチ**
   - このプロジェクトは個人的なワークフロー改善ツールであり、エンタープライズ向けではない
   - シンプルさを優先すべきなのに、pm2 の設定ファイルやコマンドが表出していた

## 実装方針

### 基本コンセプト

- **ユーザーには `npm start` だけを案内**：シンプルで迷わない
- **tmux は開発者専用の内部実装**：README に表出させない
- **pm2 を完全削除**：依存関係とドキュメントから除去

### スクリプト構成

| スクリプト名 | 用途 | 可視性 |
|------------|------|--------|
| `npm start` | 基本起動（フォアグラウンド） | README に記載 |
| `npm run dev` | 開発起動（`npm start` と同じ） | README に記載 |
| `npm run dev:tmux:start` | tmux セッション起動 | README に記載しない |
| `npm run dev:tmux:restart` | tmux 再起動 | README に記載しない |
| `npm run dev:tmux:status` | tmux 状態確認 | README に記載しない |
| `npm run dev:tmux:logs` | tmux ログ確認 | README に記載しない |
| `npm run dev:tmux:logs:realtime` | tmux リアルタイムログ | README に記載しない |
| `npm run dev:tmux:stop` | tmux 停止 | README に記載しない |

## 実装手順

### 1. tmux 管理スクリプトの作成

**`scripts/start-tmux.js`** を作成（当初は `start-dev.js` だったが後で改名）

主な機能：
- セッション名 `claude-code-pipe` で tmux セッションを作成
- 冪等性確保：既存セッションがあれば何もしない
- `--force` オプションで強制再起動
- ポート監視で起動完了を確認（config.json からポート番号取得、デフォルト 3100）

**実装場所**: `scripts/start-tmux.js`

**主なポイント**:
1. 冪等性：`tmux ls` でセッション存在確認
2. ポート監視：`net.connect()` でポートが開くまで待機
3. Node.js で実装：シェルスクリプトの環境差を回避

### 2. package.json の更新

**変更内容**:
- `dev` を `node src/index.js` に変更（フォアグラウンド起動）
- pm2 関連スクリプトを全削除
- `dev:tmux:*` 系スクリプトを追加
- devDependencies から `pm2` を削除

**実装場所**: `package.json:6-14`

### 3. ecosystem.config.js の削除

pm2 設定ファイルを削除し、プロジェクトから pm2 の痕跡を完全除去。

### 4. README のシンプル化

**README-ja.md / README.md**:

**Before**:
```bash
# tmux セッションで起動（推奨）
npm run dev

# または直接起動（フォアグラウンド）
npm start
```

**After**:
```bash
npm start
```

- Quick Start セクションを `npm start` のみにシンプル化
- 「サーバー管理」セクションを完全削除（tmux 関連の説明を非表示）
- pm2 への言及を全削除

### 5. DETAILS のクリーンアップ

**DETAILS-ja.md / DETAILS.md**:

- トラブルシューティングの pm2 コマンドを削除
- 「PM2 の問題」セクションを「サーバーが起動しない」に一般化
- プロジェクト構成から `ecosystem.config.js` の記述を削除
- ログ確認方法を一般的な表現に変更

## 動作確認

### フォアグラウンド起動

```bash
$ npm run dev
> claude-code-pipe@1.0.0 dev
> node src/index.js

claude-code-pipe listening on port 3100
Watching directory: /home/user/.claude/projects
```

✅ シンプルにフォアグラウンドで起動

### tmux セッション起動

```bash
$ npm run dev:tmux:start
Starting tmux session 'claude-code-pipe'...
Waiting for server to start on port 3100...
✓ Server is running on port 3100
  Session: claude-code-pipe
  View logs: npm run dev:logs
  Attach: tmux attach -t claude-code-pipe
```

✅ tmux セッションで起動成功

### 冪等性確認

```bash
$ npm run dev:tmux:start
✓ tmux session 'claude-code-pipe' already running
  Use --force to restart
  Check status: npm run dev:status
  View logs: npm run dev:logs
```

✅ 既存セッションを保持

### ログ確認

```bash
$ npm run dev:tmux:logs
[watcher] File changed: /home/node/.claude/projects/...
[subscribers] Error posting to tester-node-red...
```

✅ tmux のバッファからログ取得成功

## 成果

### ユーザー体験の改善

| 観点 | Before（pm2） | After（tmux隠蔽） |
|------|-------------|----------------|
| 初回起動 | pm2 の説明を読む必要 | `npm start` だけ |
| 混乱要因 | 「推奨」が何か分からない | シンプルで迷わない |
| ドキュメント量 | pm2 コマンド一覧が必要 | 最小限 |

### 開発効率の向上

- tmux セッション管理で Claude Code との協業がスムーズに
- ログ確認が `dev:tmux:logs` で即座に可能
- リアルタイムログは `dev:tmux:logs:realtime` でアタッチ

### 保守性の向上

- 内部実装（tmux）の変更がユーザードキュメントに影響しない
- pm2 の依存関係を削除し、依存パッケージが減少
- 設定ファイル（ecosystem.config.js）が不要に

## 学び

### プロセス管理ツールの選択

- **pm2**: 本番環境向け、自動再起動・ログ管理に強い
- **tmux**: 開発環境向け、セッション管理とログ確認がシンプル
- **用途で使い分ける**: 本番は systemd/pm2、開発は tmux

### ドキュメントの立ち位置設計

- 「推奨」の表示位置が重要：初心者向けなら `npm start` を主役に
- 高度なツール（pm2/tmux）は補足または隠蔽する
- プロジェクトの性格（個人ツール vs エンタープライズ）に合わせる

### 内部実装の隠蔽

- ユーザーに見せる必要のない技術的詳細は README から除外
- package.json のスクリプト名で使い分けを表現（`dev:tmux:*`）
- DETAILS には残すが、Quick Start には載せない

## 今後の改善案

- tmux がインストールされていない環境への対応（エラーメッセージ改善）
- `dev:tmux:logs` のバッファサイズを設定可能にする
- マルチサービス構成時の tmux ウィンドウ管理（現在は単一サービス）

## 関連ドキュメント

- pm2 時代の経緯メモ（セッション提供）：バックグラウンド起動問題と pm2 採用の背景
- tmux 活用メモ（セッション提供）：Claude Code × tmux の基本パターンと知見

---

**最終更新**: 2026-03-07
**作成者**: Claude Sonnet 4.5
