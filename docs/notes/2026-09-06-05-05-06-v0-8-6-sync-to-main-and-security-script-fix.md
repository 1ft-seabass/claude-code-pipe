---
tags: [release, sync-to-main, package-json, security, worktree]
---

# v0.8.6 sync-to-main実行・securityスクリプト除去漏れの修正 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: `/projects/file` API追加（v0.8.6）のdevelop→main反映

## 問題

`docs/actions/sync_to_main.md`の手順に従い、v0.8.6（`/projects/file` API追加）をdevelopからmainに反映する作業中、Step 2（main側`package.json`の確認）で想定外の状態を発見した。

## 試行錯誤

### 発見: `security`スクリプトがmainに残る

1回目の`npm run sync-to-main`実行後、main側`package.json`の`scripts`を確認したところ、`start`・`dev`以外に`"security": "node .security-check/cli.js"`が残っていた。

- `.security-check/`ディレクトリは`filesToSync`に含まれておらず、mainには一切コピーされない（意図通り。別ノート[[2026-09-06-04-56-09-security-check-v3-sync-and-worktree-verification]]で確認済み）
- しかし`package.json`側の`"security"`スクリプト行自体は残ってしまい、main上では実行すると壊れる（存在しないファイルを参照する）状態になっていた

### 原因調査

`scripts/sync-to-main.js`の`cleanPackageJson()`内、開発用スクリプトを正規表現で削除する箇所:

```js
if (
  key.includes('husky') ||
  key.includes('secretlint') ||
  key.includes('gitleaks') ||
  key.startsWith('secret-scan') ||
  key.startsWith('security:') ||   // ← コロン必須
  key.startsWith('dev:tmux:')
) {
```

`key.startsWith('security:')`は`security:verify`等のコロン付きスクリプトのみにマッチし、コロンなしの`"security"`本体にはマッチしない。

`git log -S'"security":' -- package.json`で確認したところ、この`"security"`スクリプトは`setup-securecheck`のv3移行コミット(`dbc0c41`)で今回初めて`package.json`に追加されたものだった。つまりv3移行後にsync-to-mainを実行したのは今回が初めてで、この不具合はこれまで一度も発現していなかった。

### 解決策（成功）

`key.startsWith('security:')` → `key.startsWith('security')`（コロンなし）に緩めることで、`security`本体も含めて除去対象にした。

**実装場所**: `scripts/sync-to-main.js:243`

修正後に`npm run sync-to-main`を再実行し、ログに`Removing script: security`が出力されること、main側`package.json`の`scripts`が`start`・`dev`のみになることを確認した。

## 解決策

`sync_to_main.md`のStep 1〜6を最後まで実行:

1. `npm run sync-to-main`（修正後に再実行）
2. main側`package.json`確認 → `scripts`は`start`/`dev`のみ、`devDependencies`なしを確認
3. セキュリティチェック（`git diff --cached`をAPIキー等のパターンで検索）→ 検出なし
4. コミットメッセージ計画 → `sync: v0.8.6 from develop - プロジェクト内テキストファイル閲覧API(/projects/file)追加`
5. ユーザーが`npm run commit-main`を実行・push完了
6. AIが`git tag v0.8.6` / `git push origin v0.8.6`を実行

## 学び

- `startsWith()`によるプレフィックスマッチのクリーンアップリストは、「サブコマンドっぽいスクリプト名の本体（コロンなし）」を見落としやすい。新しいツールをpackage.jsonのscriptsに追加する際は、`sync-to-main`のような同期・除去ロジックとの整合性も都度確認する価値がある
- 「develop側で新機能や新ツールを追加したコミット」と「それをmainに反映するsync-to-mainの実行」の間にタイムラグがあると、こういう不整合は次にsyncを実行するまで表面化しない。v3移行（`dbc0c41`）からこの修正まで期間が空いていたのはそのため
- `sync_to_main.md`のStep 2（package.json確認）は形式的なチェックに見えて、実際に今回のような実害あるバグを拾えた。手順通り都度確認する価値がある

## 今後の改善案

- 同様の「コロンなしスクリプト本体の見落とし」が他のプレフィックス（`secret-scan`, `dev:tmux:`等）でも起きていないか、余裕があれば棚卸ししてもよい

## 関連ドキュメント

- [setup-securecheck v3のsync-to-main影響・worktree動作確認](./2026-09-06-04-56-09-security-check-v3-sync-and-worktree-verification.md)
- [`/projects/file` 設計相談ノート](./2026-09-06-04-37-00-projects-file-api-design.md)

---

**最終更新**: 2026-09-06
**作成者**: Claude
