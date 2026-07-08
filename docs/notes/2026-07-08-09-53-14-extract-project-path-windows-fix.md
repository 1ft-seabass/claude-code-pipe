---
tags: [windows, native, send-mode, extractProjectPath, subscribers, bugfix]
---

# extractProjectPath の Windows 非対応バグ調査・修正 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-08
**関連タスク**: Windows native Send Mode 実装後の実機結合テスト

## 問題

Windows native実機で `POST /sessions/new` / `POST /sessions/:id/send` の結合テストを実施したところ、`POST /sessions/:id/send` が `400 { "error": "projectPath is required" }` を返した。

送られていたリクエストボディは以下の通りで、`prompt` はあるが `projectPath` / `cwd` が含まれていなかった:

```json
{
  "action": "send-message",
  "callbackUrl": "http://localhost:18842",
  "sessionId": "...",
  "prompt": "TEST",
  "dangerouslySkipPermissions": true
}
```

これ自体はAPIの仕様通りのバリデーションエラーだが、なぜ送信側（webhook受信側／viewer）が `projectPath` を持っていなかったのかを追跡したところ、根本原因は claude-code-pipe サーバー側にあった。

## 調査

Pipe Viewer のスクリーンショットで、Windows上のプロジェクト一覧の「プロジェクトパス」「作業ディレクトリ」列が両方 `-`（空）になっていることを確認。これはwebhookペイロードに `projectPath` フィールドがそもそも含まれていないことを示唆していた。

`src/subscribers.js` の `deliverToSubscriber` 系関数（271, 320行目付近）は、webhookペイロード組み立て時に以下のパターンで `projectPath` を詰めている:

```js
const projectPath = event.jsonlFilePath ? extractProjectPath(event.jsonlFilePath) : null;
...
...(projectPath && { projectPath }),
```

`extractProjectPath()`（同ファイル38-116行目）を調べたところ、以下の1行が致命的だった:

```js
// 修正前
if (!projectDirName.startsWith('-')) {
  return null;
}
```

Claude Code は `~/.claude/projects/` 配下のディレクトリ名を、cwdのパス区切り文字を `-` に変換してエンコードする。Unixの場合は `/home/user/project` → `-home-user-project` のように必ず `-` で始まるが、**Windowsの場合は `C:\workspace\project` → `C--workspace-project` のようにドライブレターで始まり `-` では始まらない**。

このガードにより、Windowsパスは即座に `null` が返り、後続の一番信頼性の高い処理（JSONLファイル先頭から `cwd` フィールドを直接読む、56-81行目）にすら到達していなかった。

**因果関係の全体像**:
1. `extractProjectPath()` がWindowsパスを `null` で弾く
2. → webhookペイロードに `projectPath` キー自体が欠落する（`projectPath && {...}` のスプレッド構文のため）
3. → viewer側が返信用リクエストに使える `projectPath` を持てず、受け取ったペイロードをほぼそのまま転送するしかなかった
4. → サーバー側の `POST /sessions/:id/send` が `projectPath` 必須バリデーションで正しく400を返した

## 解決策

`isWindowsNonWSL()`（`src/sender.js`）で明示的に分岐する方針を採用。共通化してよい部分（cwd直読み）と危険地帯（パス文字列の組み立て前提）を分離する、Windows native Send Mode 実装時と同じ設計方針を踏襲した。

**実装場所**: `src/subscribers.js:38-141`（`extractProjectPath`）、`src/sender.js:545`（`isWindowsNonWSL` を `module.exports` に追加）

**主なポイント**:
1. エンコード済みディレクトリ名の判定を `isWindowsNonWSL()` で分岐: Unix は `-` 始まり、Windows は `/^[A-Za-z]--/`（ドライブレター + `--`）
2. JSONL先頭の `cwd` を直接読む処理（一番信頼性が高い経路）はプラットフォーム非依存のため無変更・共通のまま。Windows側もこの経路に到達するようになったことが実質的な本丸の修正
3. フォールバックの文字列再構築（`cwd` が読めない場合の最終手段）のみOS別に分岐: Windowsは `${driveLetter}:\\` + `-` を `\` に変換して再構築
4. Unix環境では `isWindowsNonWSL()` が常に `false` を返すため、既存のUnixロジックには一切触れず、`else` 分岐でこれまでと完全に同じコードパスを通る

**副次的な修正**: `isWindowsNonWSL` が `src/sender.js` の `module.exports` に含まれておらず、`subscribers.js` からimportしようとすると `isWindowsNonWSL is not a function` になっていたため、これも合わせて export に追加。

## 検証（Linux上、process.platform を win32 に偽装）

`isWindowsNonWSL()` は `process.platform !== 'win32'` なら即 `false` を返すため、`Object.defineProperty(process, 'platform', { value: 'win32' })` で偽装し、フェイクJSONLファイルを使って動作確認した（このコンテナの `/proc/version` に `microsoft` の文字列が含まれないため、`win32` 偽装時は正しく「Windows native」判定になる）。

- Windowsモード・cwd直読み（`C:\Users\tnkse\workspace\my-app`）→ 正しく復元
- 小文字ドライブレター（`c:\workspace\...`）でも正しく復元
- cwdフィールドが無い場合のフォールバック再構築も正しく動作
- Unix形式ディレクトリ名はWindowsモードで誤検出せず `null`（クロス汚染なし）
- 既存Unixロジックの回帰確認（cwd直読み・Windows形式ディレクトリ名の除外）も両方PASS

テストスクリプトは一時ファイルとして作成・確認後に削除済み（リポジトリには残していない）。

## 学び

- webhookペイロード欠落のような「サイレントに情報が消える」バグは、受信側（viewer）のエラーではなく送信側（サーバー）の実装を疑うべきだった。今回はviewerのプロジェクト一覧表示（`-`表示）というUIの異変が手がかりになった
- `projectPath && { projectPath }` のようなスプレッド構文によるオプショナルフィールドの組み立ては、値が `null`/`undefined` になった際にキーごと消えるため、デバッグ時に「フィールドが無い」のか「値が空」なのか区別しにくい。ペイロード欠落系の調査では実際のレスポンス/ペイロードのJSON構造を必ず確認するべき
- 「共通化してよい部分」と「危険地帯」を切り分ける設計方針は、`spawnClaudeProcess()` に続いて `extractProjectPath()` でも有効に機能した。同じ設計原則を再利用することで実装判断が速くなった
- Windows実機を使わずとも、`process.platform` の偽装 + フェイクファイルで大部分のロジックはLinux上で検証可能。実機でしか確認できないのは「本当に存在するファイルシステム上でのfs.existsSync探索」という限定的な部分のみ

## 今後の改善案

- Windows実機での再テストがまだ済んでいない。webhookペイロードに `projectPath` が正しく載るか、viewer側がそれを使って正しく `POST /sessions/:id/send` を送り返せるかの実地確認が必要
- `src/watcher.js:17` / `src/api.js:28` の `watchDir.replace(/^~/, process.env.HOME || '')` も同種のUnix環境変数（`HOME`）決め打ちの想定が残っている。今回のWindows実機ログでは `C:\Users\tnkse/.claude/projects` と正しく解決されていたため実害は出ていないが、`os.homedir()` を使う方が本来安全（別タスクとして検討）
- README.md / DETAILS.md の Platform Support テーブル更新は、引き続きWindows実機確認後まで保留

## 関連ドキュメント

- [Windows native Send Mode 実装の開発ノート](./2026-07-07-21-53-49-windows-native-send-mode-implementation.md)
- [Windows native Send Mode 再検証ノート](./2026-07-07-12-57-43-windows-native-send-mode-investigation.md)
- [Windows native Send Mode 設計セッションの申し送り](../letters/2026-07-07-13-02-45-windows-native-send-mode-design.md)

---

**最終更新**: 2026-07-08
**作成者**: AI
