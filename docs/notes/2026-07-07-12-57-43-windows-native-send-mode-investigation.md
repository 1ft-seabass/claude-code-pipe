---
tags: [windows, native, send-mode, buffering, pty, security]
---

# Windows native Send Mode 実地再検証と設計転換 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-07
**関連タスク**: Windows native 環境での Send Mode（`claude -p` プログラム送信）対応

## 問題

claude-code-pipe は Mac/Linux/WSL では Send Mode（`sender.js` による `claude -p` の spawn 管理）が動作しているが、Windows（非WSL）では `POST /sessions/new` / `POST /sessions/:id/send` が 501 を返し非対応となっている。

この非対応は `docs/notes/2026-03-08-windows-support-investigation.md` の実機検証（PowerShell経由・直接spawnいずれもバッファリング問題でハングする）に基づく意思決定で、以来 `isWindowsNonWSL()` によるガードが入っている。

今回、Windows native 向けの新しい設計案（fire-and-forget + cwd/session_id 相関 + FIFOキュー）を検討する過程で、「本当に今の CLI でもハングするのか」を実機で再検証した。

## 試行錯誤

### 当初の設計案（見送り）

**検討したこと**: `stdio: ['ignore','ignore','pipe']` で fire-and-forget spawn し、`watcher.js` が検知する新規 `.jsonl` ファイルと cwd で相関を取る設計。stdout に頼らないことで過去の「詰み」を回避する狙い。

**問題点**:
- 同一cwdへの同時複数リクエストで相関があいまいになる（無関係な手動セッションへの誤相関リスクもあり）
- `model`/`tools`/`permissionMode`/`apiKeySource` が stdout 由来のため取得できず、レスポンス契約の値が劣化する

---

### 実機再検証（`scripts/windows-native-probe.js` を新規作成）

**試したこと**: Windows native（Claude Code CLI 2.1.158）上で以下を計測する単体スクリプトを作成し、実機で複数回実行した。

- Test 0: `spawn('claude', ['-v'])`（`shell:false`, デフォルト）
- Test 1: 同上（`shell:true`, 既存 `/claude-version` と同じ手法）
- Test 2: `claude -p ... --output-format json`（非ストリーミング一発コマンド）
- Test 3: `claude -p ... --output-format stream-json --verbose`（PTYなし直接spawn）＋ `~/.claude/projects` 配下の `.jsonl` ファイル出現・サイズ変化を並行ポーリング
- Test 4: シェルメタ文字・改行・クォート崩し・`$()`・バッククォート等を含むプロンプトでのインジェクション耐性確認（ペイロード実行の痕跡ファイルが作られるかで機械的に判定）
- Test 5: Test 3 で開始したセッションに対する `--resume` 送信の追試

**結果**: 成功（4回の独立実行すべてで一貫）

- Test 0 と Test 1 が同速度・同結果（`shell:true` は不要と確認）
- Test 3: 最初の stdout チャンクに `system/init` イベントがそのまま含まれ、以降も継続的にチャンクが届く（プロセス終了までブロックされない）
- **stdout の到達は `.jsonl` ファイルの出現より一貫して100〜300ms速い**（`jsonlAppearedBeforeStdout: false` が4回とも再現）
- Test 4: `injectionFileCreated: false`、`stderrSuspicious: false`（配列渡し + `shell:false` でインジェクション兆候なし）
- Test 5: `resumedSessionIdMatches: true`。resume でも new session と同様の傾向（stdout がファイルより先）

**副次的な発見**:
- stdin をパイプしたまま何も書き込まないと、claude CLI が `"no stdin data received in 3s, proceeding without it"` という警告を出し3秒待つ。`stdio: ['ignore', 'pipe', 'pipe']` で回避可能（回避後、Test 3 の init イベント到達は 600〜1100ms 程度まで短縮）
- `claude -p --output-format json`（非ストリーミング）は最終 `result` サマリーのみを返し、`model`/`permissionMode`/`apiKeySource`/`tools` は含まれない。実際に使われたモデルは `modelUsage` のキーからのみ判別可能
- `shell:true` + 引数配列の組み合わせは Node.js 自身が `DeprecationWarning`（コマンドインジェクションリスク）を出す。`shell:false` のデフォルト spawn でも `claude`（`.cmd`）の解決に問題はなかった

## 解決策（新方針）

過去の「直接spawnはハングする」という結論（2026-03-08時点）は、**現行の Claude Code CLI バージョンでは再現しない**と判断した。これにより、当初検討していた fire-and-forget + watcher相関の複雑な設計は不要と結論した。

**新しいアプローチ**: 既存 `sender.js` のロジック（stdout から `system/init` を読み `resolve()` する、タイムアウト、`managedProcesses` 登録、イベント発行）を Windows でもそのまま流用し、**プロセスの起動方法だけ**をプラットフォームで分岐する。

```js
function spawnClaudeProcess(claudeArgs, cwd) {
  if (isWindowsNonWSL()) {
    // 配列渡し・shell不要。エスケープ処理は一切不要（Test 4 で確認済み）
    return spawn('claude', claudeArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  // 既存のUnix実装（script ラッパー・Bashエスケープ）はそのまま変更しない
  const claudeCommand = `claude ${claudeArgs.map(arg => /* 既存のエスケープ処理 */).join(' ')}`;
  return spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}
```

**主なポイント**:
1. `claudeArgs`（引数配列の組み立て）と stdout パース/resolve/reject/timeout/イベント発行ロジックはプラットフォーム非依存の純粋な処理であり、共通化して問題ない
2. プラットフォーム固有の危険地帯（Bashエスケープ・`script`ラッパー文字列組み立て）は Unix 側にのみ残し、Windows 側は一切通さない（配列渡しのため構造的にエスケープ対象が存在しない）
3. `api.js` の 501 ガード（`/sessions/new`, `/sessions/:id/send` の2箇所）は撤去し、通常フローに乗せられる見込み
4. 相関の曖昧さ・情報劣化（model/tools等）は原理上発生しない（既存プラットフォームと同じ、プロセス自身の stdout から直接取得するため）

## 学び

- CLI のバッファリング挙動はバージョン依存で変わりうる。過去の検証結論を恒久的な制約と思い込まず、CLI が更新されたら再検証する価値がある（今回は約4ヶ月越しの再検証で結論が覆った）
- `shell:true` の危険性は「エスケープが面倒」ではなく「コマンドインジェクションの実害クラス」。このリポジトリは過去に Bash 向けで同種のバグを2回踏んでおり（改行セッション分離、バッククォート/`$`エスケープ漏れ）、Windows実装でも同じ轍を踏まないよう配列渡し・`shell:false`を選んだ
- 「共通化して良い部分」と「プラットフォームごとに絶対分離すべき危険地帯」を切り分けることで、DRYと安全性を両立できる。今回は「引数配列の組み立て」「stdoutパース」が前者、「起動方法（エスケープ含む）」が後者
- 実機での機械的インジェクション検証（ペイロードが実行されたら痕跡ファイルができる、という設計）は、モデルの応答内容に依存せず結果を判定できて有効だった

## 今後の改善案

- `sender.js` に `spawnClaudeProcess(claudeArgs, cwd)` を切り出し、`isWindowsNonWSL()` で分岐する実装に着手
- `api.js` の 501 ガード2箇所を撤去
- 実装後、Windows実機で `POST /sessions/new` / `POST /sessions/:id/send` の結合テストを実施
- README.md / DETAILS.md の Platform Support テーブルを更新（Windows native も Send Mode 対応済みに）
- 未検証事項: 実際のツール呼び出し（Bash/Edit等）を含むエージェントループ全体の Windows 挙動（今回のprobeはセッション開始・応答受信のみを対象としており、ツール実行時のパス処理等は別途確認が必要）
- 今回の検証は1台のWindowsマシン・1バージョン（2.1.158）のみ。実装後にもう一台・別バージョンでも確認できるとより安心

## 関連ドキュメント

- [scriptコマンドによるCLIバッファリング問題の解決](./2026-02-23-13-40-00-script-command-for-cli-buffering.md)
- [Windows対応計画](./2026-02-28-09-30-00-windows-support-planning.md)
- [Windows対応調査と意思決定（今回覆した過去の結論）](./2026-03-08-windows-support-investigation.md)
- [バッククォート・$ エスケープ修正ノート](./2026-05-24-04-00-00-backtick-shell-escape-fix.md)
- 検証スクリプト: `scripts/windows-native-probe.js`（リポジトリ内、単体実行可能）

---

**最終更新**: 2026-07-07
**作成者**: Claude Code (AI)
