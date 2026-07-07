---
tags: [windows, native, send-mode, sender, refactor]
---

# Windows native Send Mode 実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-07-07
**関連タスク**: Windows native 環境での Send Mode（`claude -p` プログラム送信）対応

## 問題

`docs/notes/2026-07-07-12-57-43-windows-native-send-mode-investigation.md` の実機再検証により、「直接spawnはバッファリング問題でハングする」という過去の意思決定（2026-03-08）が現行 CLI では再現しないことが判明した。設計方針（`spawnClaudeProcess()` 切り出し・起動方法のみプラットフォーム分岐）は固まっていたが、実装は未着手だった。

## 解決策

### 1. `src/sender.js` に `spawnClaudeProcess(claudeArgs, cwd)` を切り出し

`startNewSession` / `sendToSession` に重複していた「`script` ラッパー文字列を組み立てて spawn する」処理を1関数に共通化し、`isWindowsNonWSL()` で起動方法のみ分岐した。

**実装場所**: `src/sender.js:57-74`

```js
function spawnClaudeProcess(claudeArgs, cwd) {
  if (isWindowsNonWSL()) {
    // 配列渡し・shell不要のためエスケープ処理は不要
    return spawn('claude', claudeArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  // script コマンドで PTY を提供してバッファリングを回避
  const claudeCommand = `claude ${claudeArgs.map(arg =>
    `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')}"`
  ).join(' ')}`;

  return spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}
```

`startNewSession`（`src/sender.js:113`）・`sendToSession`（`src/sender.js:307`）はどちらも `spawnClaudeProcess(claudeArgs, cwd)` を呼ぶだけに簡素化。両関数の冒頭にあった「Windows (non-WSL) なら reject して終了」ガードも削除した。

### 2. `src/api.js` の 501 ガードを撤去

`POST /sessions/new` と `POST /sessions/:id/send` にあった Windows (non-WSL) 判定 → 501 レスポンスのブロックを2箇所とも削除し、通常フロー（`startNewSession` / `sendToSession` 呼び出し）に統一した。

**実装場所**: `src/api.js`（`/sessions/new` ハンドラ、`/sessions/:id/send` ハンドラ）

**主なポイント**:
1. `claudeArgs` 組み立てと stdout パース/resolve/reject/timeout/イベント発行ロジックは元々プラットフォーム非依存だったため、変更なし
2. 危険地帯（Bashエスケープ・`script` ラッパー文字列組み立て）は Unix 分岐にのみ残し、Windows 分岐は配列渡し・`shell:false` のため構造的にエスケープ対象が存在しない
3. `isWindowsNonWSL()` 自体は `getOsInfo()` などで引き続き使用するため関数は残置、呼び出し箇所（reject 判定）のみ削除

## 学び

- 「共通化してよい部分」と「危険地帯」を先に切り分けておくと、実装は機械的な置き換え作業になる（設計セッションでの整理が効いた）

## 今後の改善案

- Windows実機での `POST /sessions/new` / `POST /sessions/:id/send` 結合テストが未実施（AIはWindows実機を操作できないため、ユーザー側での確認が必要）
- README.md / DETAILS.md（日英）の Platform Support テーブル更新は、上記の実機確認が済むまで保留とした（ユーザー判断）
- DETAILS.md / DETAILS-ja.md の「501エラーのトラブルシューティング」セクションも、実機確認後に更新が必要
- 未検証: 実際のツール呼び出し（Bash/Edit等）を含むエージェントループ全体のWindows挙動

## 関連ドキュメント

- [Windows native Send Mode 再検証ノート](./2026-07-07-12-57-43-windows-native-send-mode-investigation.md)
- [Windows対応調査と意思決定（今回覆した過去の結論）](./2026-03-08-windows-support-investigation.md)
- [Windows native Send Mode 設計セッションの申し送り](../letters/2026-07-07-13-02-45-windows-native-send-mode-design.md)

---

**最終更新**: 2026-07-07
**作成者**: AI
