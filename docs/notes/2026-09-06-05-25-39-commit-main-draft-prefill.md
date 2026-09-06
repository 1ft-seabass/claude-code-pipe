---
tags: [tooling, commit-main, sync-to-main, readline, developer-experience]
---

# commit-mainウィザードへのAI提案プリフィル機能追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: v0.8.6のsync-to-mainフロー完了を受けて、次回以降の運用改善

## 問題

`sync_to_main.md`のフローでは、Step 4で AI がコミットメッセージ・プレフィックスを提案するが、Step 5では人間が`npm run commit-main`ウィザードに手打ちで入力し直す必要があった。「流れ的にAIが決めた内容が、CLIを読むときにはもう決まっている（それでいて変更もできる）」状態にしたい、という要望があった。

## 解決策

### `.commit-main-draft.json`方式

AIがコミットメッセージ案を決めたら、developリポジトリ直下に一時ファイルとして書き出す:

```json
{ "prefix": "sync", "message": "v0.8.6 from develop - ..." }
```

- `.gitignore`に追加（コミットしない一時ファイル）
- `commit-main.js`が起動時に読み込み、**読み込み後は即座に削除**（使い切り。古いドラフトが次回に誤って再利用されるのを防ぐ）

### `readline`の`rl.write()`によるプリフィル

**実装場所**: `scripts/commit-main.js`

```js
function question(prompt, prefill) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
    if (prefill) {
      rl.write(prefill);
    }
  });
}
```

`rl.question()`を呼んだ直後に`rl.write(prefill)`を呼ぶと、readlineの入力バッファに文字列が「ユーザーが入力済み」の状態で挿入される。TTY上ではその文字列が入力欄に表示された状態になり、Enterでそのまま採用、Backspace等で編集も可能。

- プレフィックス選択（`selectPrefix`）: ドラフトの`prefix`に対応する番号（例: `sync` → `5`）を`draftNumber`として算出し、プリフィル。「（AI提案: [5] sync — そのままEnter、または番号で変更）」という案内も表示
- メッセージ入力（`inputMessage`）: ドラフトの`message`をそのままプリフィル

## 動作確認

非TTY環境（パイプ入力）でも、`rl.write()`で挿入した文字列がそのまま`question()`の戻り値になることを簡易スクリプトで確認した:

```js
const answer = await question('Message: ', 'sync: v0.8.6 from develop - test');
// 標準入力に空行(Enter)のみを送った場合 → answer === 'sync: v0.8.6 from develop - test'
```

ただし実際の見た目・編集体験（TTY上でどう表示されるか、Backspaceでの編集感触など）は非TTY環境では確認できないため、**実地確認は次回のバージョンアップ実行時**に行う想定。

## 学び

- `readline`の`rl.write()`は、TTYでの見た目の効果だけでなく、非TTY（パイプ）環境でも入力バッファへの文字列挿入として機能する。「Enterだけ押したら何が返るか」は自動テストでも検証可能
- 複数ステップにまたがる作業（AIが決める→人間が入力する）では、決定内容を一時ファイル経由で受け渡すことで「二重入力」の手間を減らせる。ただし使い切り（読み込み後即削除）にしないと、古い提案が別の作業に紛れ込むリスクがある

## 今後の改善案

- 実際にv0.8.7以降のバージョンアップで`commit-main`を実行し、プリフィルの見た目・編集感触を確認する
- 好評であれば、developブランチ側の通常コミット（`git_commit.md`フロー）にも同様の仕組みを広げる余地がある

## 関連ドキュメント

- [v0.8.6 sync-to-main実行・securityスクリプト除去漏れの修正](./2026-09-06-05-05-06-v0-8-6-sync-to-main-and-security-script-fix.md)

---

**最終更新**: 2026-09-06
**作成者**: Claude
