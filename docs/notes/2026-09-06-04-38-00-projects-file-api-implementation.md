---
tags: [api, security, implementation, path-traversal, git]
---

# `/projects/file` API 実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: [設計相談ノート](./2026-09-06-04-37-00-projects-file-api-design.md)で決まった方針の実装

## 問題

設計方針（POST、trusted projectPath、denylist、ドットファイル/gitignoreブロック、サイズ上限）を実際に安全に実装する必要がある。特にパストラバーサル・symlink脱出を確実に防ぐ必要があった。

## 解決策

### 実装場所

- `src/api.js` — `POST /projects/file` ルート本体
- `src/git-info.js` — `isPathGitIgnored(cwd, relPath)` ヘルパーを追加
- `config.example.json` — `viewer.deniedExtensions` / `viewer.maxFileSize` のデフォルトを追記

### 検証の流れ（順序が重要）

1. `projectPath` / `filePath` の存在チェック（`fs.existsSync`）
2. `baseDir = fs.realpathSync(path.resolve(projectPath))` — symlinkも含めて実パス化
3. 字面上の`path.resolve(baseDir, filePath)`が`baseDir`配下に収まるか簡易チェック（無駄なfsアクセスを避ける先行ガード）
4. 対象ファイルの存在確認 → `fs.realpathSync`で実パス化
5. **symlink経由の脱出防止**: 実パス化した結果が`baseDir`配下から外れていないか再チェック（字面チェックだけだとsymlinkですり抜けられるため必須）
6. `relPath = path.relative(baseDir, realPath)`のセグメントに`.`始まりがあれば即ブロック（`.env`, `.git/`等）
7. 拡張子denylistチェック
8. `isPathGitIgnored(baseDir, relPath)`が`true`ならブロック
9. `fs.statSync`でファイルかどうか（`isFile()`）を確認
10. サイズ上限チェック（デフォルト1MB、`config.viewer.maxFileSize`で変更可）
11. `fs.readFileSync(realPath, 'utf8')`で読み込み、`{ content, mtime, size }`を返す

### `isPathGitIgnored`の実装ポイント

```js
function isPathGitIgnored(cwd, relPath) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], { cwd, stdio: 'pipe' });
    return true; // 終了コード 0 = 無視対象
  } catch (error) {
    if (error.status === 1) return false; // 明示的に対象外
    return null; // 判定不能（gitリポジトリでない等）
  }
}
```

- `execSync`+文字列コマンドではなく`execFileSync`+配列引数を使用。`filePath`はリクエストボディ由来のため、シェル経由のコマンドインジェクションを避けるため
- `git check-ignore`は「無視対象でない」場合も終了コード1で失敗するため、`execGitCommand`（既存ヘルパー、失敗時は一律`null`）をそのまま使うと「無視対象でない」と「gitリポジトリでない」を区別できない。専用関数として`error.status`を見て判定を分ける必要があった

## 動作確認

一時的に別ポート(3101)でサーバーを起動し、本番tmuxセッション（port 3100）とは別に検証。

| テスト | 結果 |
|---|---|
| 正常系（`.md`） | 200、`{content, mtime, size}` |
| `.env`（ドットファイル） | 400 ブロック |
| `.js` / `.html`（denylist移行で解禁） | 200 |
| gitignore対象（`.log`拡張子だが`logs/`配下） | 400 ブロック |
| 画像拡張子（denylist） | 400 ブロック |
| 相対パス脱出（`../../../../tmp/...`） | 400 ブロック |
| symlink経由の脱出 | 400 ブロック |
| 存在しない`projectPath` | 400 |
| サイズ超過（2.7MB、上限1MB） | 413 |

検証後、本番tmuxセッション（`npm run dev:tmux:restart`で再起動）でも外部から実際にpipe-viewer経由でアクセスして動作確認済み。

## 学び

- `path.resolve`だけのパストラバーサル対策はsymlinkに弱い。`realpathSync`による実パス化を「字面チェック」と「symlink解決後チェック」の2段階で行う必要がある
- `git check-ignore`のような「終了コードで意味が変わる」gitサブコマンドは、既存の「失敗时null」ヘルパーを使い回すと誤判定するので、専用の判定関数を用意した方が安全
- ローカル検証用に一時ポートでサーバーを立てる際、`kill %1`はBashツール呼び出しごとに別シェルになるためジョブテーブルが効かず、プロセスが孤児化することがあった（`lsof -ti :PORT`で都度特定してkillする方が確実）

## 今後の改善案

- denylistの拡張子リストは実運用で過不足があれば`config.viewer.deniedExtensions`で調整
- `isPathGitIgnored`が`null`（判定不能）を返すケース（非gitリポジトリ）の扱いは、現状「ベストエフォートでスキップ（＝許可）」。git管理下にないprojectPathでの利用が増えたら再検討の余地あり

## 関連ドキュメント

- [設計相談ノート](./2026-09-06-04-37-00-projects-file-api-design.md)
- [認証再確認ノート](./2026-09-06-04-39-00-websocket-auth-gap-confirmation.md)

---

**最終更新**: 2026-09-06
**作成者**: Claude
