---
tags: [attachments, upload, allowlist, config, v0.8.8]
---

# `/attachments` デフォルト拡張子拡充とv0.8.8リリース - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-09
**関連タスク**: `POST /attachments` のデフォルト許可拡張子拡充

## 問題

`POST /attachments`(ファイルアップロードAPI)のデフォルト許可拡張子が`.jpg .jpeg .png .pdf .txt .md`のみで、実運用で`.docx`(たまに使う)や`.xlsx`・`.csv`を扱いたいニーズが出てきた。

`/projects/file`(閲覧API)は既にdenylist方式に転換済みだが、アップロードAPIは「全部受け入れるのは怖い」という判断からallowlist方式を維持したまま、リストを拡充する方針とした。

## 解決策

### 方式の選定

allowlist方式は維持。設定場所は2案あった:
1. `config.json`に`upload.allowedExtensions`を個別設定
2. コード内のフォールバックデフォルト値自体を変更

`config.json`(このインスタンス)には元々`upload`セクションが存在せず、コードのフォールバック(`config.upload?.allowedExtensions || [...]`)がそのまま使われている状態だった。他のデプロイも同様に未設定でフォールバック任せである可能性が高いという判断から、**2の「コード内デフォルト変更」**を選択した。

### 実装箇所

`src/api.js`の2箇所(`GET /attachments-config`のレスポンス生成、`POST /attachments`の拡張子チェック)のフォールバック配列に`.docx`, `.xlsx`, `.csv`を追加。

```js
// 変更前
['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.md']
// 変更後
['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.md', '.docx', '.xlsx', '.csv']
```

`config.json`側で`upload.allowedExtensions`を明示指定した場合は、この配列を**マージではなく丸ごと上書き**する(`||`演算子による分岐)という既存挙動は変更していない。

### ドキュメント更新

デフォルト拡張子の記載箇所を機械的に洗い出して同期:
- `config.example.json`
- `DETAILS.md` / `DETAILS-ja.md`(2箇所ずつ: JSON例と本文説明)
- `README.md` / `README-ja.md`(Features一覧の説明文にOffice文書・CSVを追記)
- `CHANGELOG.md` / `CHANGELOG-ja.md`(v0.8.8エントリ追加)

### バージョンアップ

`package.json` / `package-lock.json`を`0.8.7` → `0.8.8`に更新。過去のリリース(v0.8.6/v0.8.7)と同様、CHANGELOG追加とバージョン番号更新は内容として一式で対応。

## 検証

`GET /attachments-config`が実際に「このpipeが何を許可するか」の情報源としてpipe-viewer側に使われる想定のため、フォールバックデフォルトと明示allowlistの両方で正しく投影されるかを確認した。

### フォールバックデフォルトの投影確認

本番tmuxセッション(port 3100)を`npm run dev:tmux:restart`で再起動し、`config.json`に`upload`セクションが無い状態のまま`curl :3100/attachments-config`を実行。`.docx`, `.xlsx`, `.csv`を含む新しいデフォルトが返ることを確認。

### 明示allowlistの投影確認(一時ポート方式)

本番の`config.json`を壊さないよう、一時ポート方式で検証:

```bash
cp config.json config.json.bak-test
# config.json を port: 3101, upload.allowedExtensions: [".txt"] に一時変更
node src/index.js > /tmp/test-3101.log 2>&1 &
curl -s http://localhost:3101/attachments-config
# → {"allowedExtensions":[".txt"]} 期待通り丸ごと上書き

# 実アップロードでも確認
# .txt → 200 OK
# .docx → 400 "File type not allowed. Allowed: .txt"

# 後片付け: PID特定してkill、config.json.bak-testで復元
```

`lsof`コマンドが環境に無かったため、`ps aux` / `/proc/[pid]/cmdline` / `tmux list-panes`でPIDを特定し、本番プロセス(tmuxセッション配下)と一時テストプロセス(PPID=1、Bashツールのバックグラウンド実行で再親化されたもの)を区別してから、テストプロセスのみを`kill`した。

## 学び

- **設定の「未設定=フォールバック依存」状態を疑う視点**: `config.json`に該当セクションが無いことに気づいた時点で、「コード内デフォルトを変えれば全環境に効く」という設計上のレバレッジに気づけた。逆に言えば、個別`config.json`に書き込む変更は、その環境にしか効かない狭い変更になる
- **`lsof`が使えない環境でのPID特定**: `ps aux`のSTIME、`/proc/[pid]/cmdline`、`tmux list-panes -a`の組み合わせで、tmux配下(本番)かBashツールの一時バックグラウンドプロセス(PPID=1に再親化)かを区別できる
- **allowlist方式は「マージでなく上書き」という前提の重要性**: ユーザー側が`.txt`だけに絞りたい場合、`config.upload.allowedExtensions: [".txt"]`と書けば画像等も含めて全て`.txt`のみになる。この「上書きセマンティクス」を実際にcurl+実アップロードで検証できたことで、ドキュメント記載を裏付けられた

## 今後の改善案

- （長期持ち越し、前回申し送りより継続）画像アップロード周りの拡張: 古いtmpファイルの自動クリーンアップ、マジックナンバー検証、Send APIとの連携、容量制限。今回のallowlist拡充だけでは`.docx`/`.xlsx`の中身検証(マジックナンバー等)までは踏み込んでいない

## 関連ドキュメント

- [`/projects/file` 画像対応ノート](./2026-09-07-04-57-57-projects-file-image-support.md)
- [前回申し送り（v0.8.6/v0.8.7リリース）](../letters/2026-09-07-05-14-10-projects-file-api-v086-v087-release.md)

---

**最終更新**: 2026-09-09
**作成者**: AI
