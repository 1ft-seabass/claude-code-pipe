---
tags: [signals, api-design, jsonl, tool-use, subagent, dashboard]
---

# `GET /sessions/:id/signals` 設計・実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-10-01
**関連タスク**: pipe-viewer内蔵の「シグナル」機能相当をclaude-code-pipe側でも提供する

## 問題

pipe-viewer側で、セッションIDをキーに「メッセージ種別+タイミング情報(本文は含まない)」を返す独自の「シグナル」機能を作っており、同等のものをclaude-code-pipe側のAPIとして提供したいという相談があった。添付された実データサンプルは以下のような形:

```json
{
  "<sessionId>": [
    { "type": "assistant", "start": "...", "end": "...", "durationMs": 11760 },
    { "type": "tool-use", "toolName": "Bash", "start": "...", "end": "...", "durationMs": 95 },
    ...
  ]
}
```

## 設計の紆余曲折(スコープを段階的に削った経緯)

最初の要望は多岐にわたっていた:
1. 時間範囲を指定して取得、無指定時は直近1時間
2. 複数セッションを横断してセッションIDごとの辞書で返す
3. セッション単位の集計(総セッション数、総テキストバイト数、開始時刻、終了時刻、msec期間)
4. `type`に`claude_code`のようなソース識別子を入れたい

調査の結果(後述)、既存コードには時間範囲フィルタの仕組みが一切なく、全セッションを毎回フルスキャンする設計だったため、時間範囲指定を真面目に実装するとパフォーマンス懸念が出ることが判明。これをユーザーに伝えたところ、以下のように大胆にスコープを削ってもらえた:

- **1→撤回**: 時間範囲指定はやめ、既存の`/sessions/:id/messages`と同じ「セッションIDを1件指定して取得」方式に統一。ファイル全体スキャンも不要になった
- **3→撤回**: セッション開始・終了(session-start/session-end)はJSONL上に対応するイベントがなく、推定するしかないため「pipe側では無理」としてスコープ外に。外部情報との合成が必要な話として切り離した
- **4→別件化**: `claude_code`識別子は実はシグナルAPIの話ではなく、webhookペイロード側(`serverInfo`相当)に入れたい話だったと判明。完全に別タスクとして分離

さらに、添付サンプルのタイムスタンプをよく見ると、最初の`assistant`イベントの`start`が後続の`user`/`session-start`イベントより**前**になっているなど、生JSONLの行を素朴に変換しただけでは説明がつかない箇所があった。これはpipe-viewer内蔵ロジック側で何らかの「ターンを跨いだ所要時間」を合成していると考えられたが、ユーザーから「無理はしないで、JSONLから探れる情報で素直に」という指示があり、再現を目指さない方針にした。

## 調査結果

- `src/parser.js`の`parseLine`は`message.role`(user/assistant)・`message.content`(tool_use/tool_result/text/thinkingを含む配列、またはstring)・`isMeta`を既に抽出済みで、**変更不要**だった
- 生JSONLの`tool_use`ブロック(`id`, `name`)と、後続`user`行の`tool_result`ブロック(`tool_use_id`)は`id`で対応付けられ、実データで両者のtimestamp差分(実測18ms)が`durationMs`として素直に使えることを確認
- サブエージェントの会話は、メインセッションファイル内に紛れ込まない。実際に`<sessionId>/subagents/<subSessionId>.jsonl`という別ディレクトリ・別ファイルに書き出されており(`getSessionFiles()`で確認)、メインの`isSidechain`は常に`false`だった。つまり`sessionId`を指定して1ファイルだけ処理する設計なら、サブエージェントは構造上混入しえない
- `extractTextTurn`(`textOnly`機能)はtool_use/tool_resultを意図的に除外する設計で、今回は逆に拾う側の新規ロジックが必要だった

## 実装

### 素直な実装のルール

| 元データ | シグナル | start/end/durationMs |
|---|---|---|
| `assistant`行の`tool_use`ブロック | `{ type: "tool-use", toolName }` | start=その行のtimestamp、end=対応する`tool_result`行のtimestamp、durationMs=差分 |
| `assistant`行(テキストあり) | `{ type: "assistant", textBytes }` | start=end=その行のtimestamp、durationMs=0 |
| `user`行(生の入力、`tool_result`ではない) | `{ type: "user", textBytes }` | start=end=その行のtimestamp、durationMs=0 |
| `user`行で中身が`tool_result`のみ | 単独シグナルなし(対応する`tool-use`の`end`として吸収) |
| `isMeta`行 | 除外 |
| 対応する`tool_result`が来ない`tool-use` | `end: null`, `durationMs: null` |

`textBytes`は`content`の`type: "text"`ブロックのみをUTF-8バイト数換算(`thinking`は含まない)。

**実装場所**: `src/api.js`
- `getTextBytes(content)`: string/配列どちらのcontentにも対応したバイト数算出
- `buildSignals(events)`: `tool_use_id`をキーに`pendingToolUses`マップで対応付けしながら1パスでシグナル配列を構築
- `GET /sessions/:id/signals`: 既存の`getSessionJSONLPath`/`parseJSONLFile`をそのまま再利用

## 検証

一時ポート(3103)+一時`watchDir`(`/tmp/signals-test-project`)で最小限のJSONLを手作りし、以下5パターンを確認(テスト後に全て削除・config.json復元):

1. 実セッションデータでの基本動作(user→tool-use→assistant…の順で正しく出力)
2. string型content(`"こんにちは"`、15バイト = 5文字×UTF-8 3バイト)の`textBytes`算出
3. 対応する`tool_result`が来ない`tool-use`で`end: null`/`durationMs: null`
4. `tool_result`のみのuser行が単独シグナルにならない(対応する`tool-use`のみ1件出力)
5. `isMeta: true`の行が除外される

## 学び

- **要望を鵜呑みにせず「今の設計で真面目にやるとどうなるか」を先に調べて返すと、要望側が自分で気づいてスコープを削ってくれる**。時間範囲フィルタの実装コストを正直に伝えたことで、ユーザー自身が「私がやばい設計してる」と気づき、大幅にシンプルな設計に倒れた
- **他システム(pipe-viewer内蔵ロジック)の出力を完全再現しようとせず、自分のシステムで素直に言える範囲に留める判断は、要望側に確認を取ってから降りる**。タイムスタンプの矛盾に気づいた時点で安易に複雑なロジックを組まず、先に相談したことで無駄な実装を避けられた
- `parser.js`が既に`message.content`を生のまま保持していたおかげで、新しい抽出ニーズ(tool_use⇔tool_result対応付け)に対してパーサー自体の変更が不要だった。「必要なフィールドだけ抽出」ではなく「構造を壊さず保持」しておくことの価値を再確認

## 関連ドキュメント

- [`/sessions/:id/messages` textOnly/limitノート](./2026-09-07-04-58-30-messages-text-only-and-limit.md)

---

**最終更新**: 2026-10-01
**作成者**: AI
