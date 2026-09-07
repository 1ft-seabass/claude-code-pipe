---
tags: [api, sessions, messages, handoff, text-extraction]
---

# `/sessions/:id/messages` の textOnly・limit オプション追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-07
**関連タスク**: セッションログをAIが読みやすい形で取得したいという相談

## 問題

ユーザーが最近、特定セッションを読む際に「Pythonで手作りしたスクリプト」で以下の2つを行っていた:

1. **テキストターンだけ**: `tool_use`/`tool_result`/`isMeta`を落とし、`role`・タイムスタンプ・本文だけを返す
2. **最新N件**: 引き継ぎ時に「最後の数十ターンだけ空気を掴む」用途

これに対応する既存APIがあるか観測したところ、近いが完全一致しないものが見つかった。

## 観測結果（既存実装との差分）

`chat/user/first|latest`・`chat/assistant/first|latest`（4エンドポイント、`isUserChat`/`isAssistantChat`が判定）が最も近かったが:

- **ユーザー側**: `content`配列に`tool_result`を含むターンを**丸ごと除外**（本文抽出ではない）
- **アシスタント側**: `text`ブロックがあり**かつ**`tool_use`ブロックが**ない**ターンだけ残す → 本文とtool_useが混在するターンは**丸ごと落ちる**（本文だけ抜き出す挙動ではない）
- `isMeta`によるフィルタは**どこにもなかった**（webhook/subscribers.js側でのみ使用、REST側は未使用）
- いずれも「先頭1件」「末尾1件」の単発専用で、複数ターンの配列を返すものはなかった
- `limit`のような件数指定パラメータはメッセージ系のどのエンドポイントにも存在しなかった

## 解決策

### 既存4エンドポイントは触らず温存、新しい抽出ロジックを追加

既存の`isUserChat`/`isAssistantChat`は「ターン丸ごと除外方式」のため、そのまま使うと本文とtool_useが混在するターンで本文を失う。今回は「ブロック単位で抽出する」新しい関数を別途用意した。

**実装場所**: `src/api.js`

```js
function extractTextTurn(event) {
  if (event.isMeta) return null;
  const msg = event.message;
  if (!msg || !msg.role) return null;

  const text = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.filter(item => item.type === 'text').map(item => item.text).join('')
      : '';

  if (!text.trim()) return null;
  return { role: msg.role, timestamp: event.timestamp, text };
}
```

- `isMeta`を最初に除外
- `content`が文字列ならそのまま、配列なら`text`タイプのブロックだけ抽出して結合（`tool_use`/`tool_result`は自然に落ちる）
- 結合後の本文が空（純粋なtool_use呼び出し、tool_resultのみのターン等）ならタームごと除外 → user/assistant両方に単一ロジックで対応でき、既存の`isUserChat`/`isAssistantChat`が個別に持っていた判定ロジックが不要になる

### 新エンドポイントは作らず、既存`/sessions/:id/messages`にクエリパラメータ追加

`/git/status?files=true`と同じ流儀（クエリパラメータでレスポンス形状を切り替え）を踏襲:

```
GET /sessions/:id/messages?textOnly=true&limit=30
```

- `textOnly=true`: 上記関数で全イベントを抽出・整形
- `limit=N`: （`textOnly`適用後の）配列の末尾N件にスライス。`textOnly`なしでも生イベントの末尾N件に使える
- どちらも未指定なら**完全に無加工**（既存クライアントへの影響ゼロ）

## 動作確認

実際のセッションJSONL（74イベント）で確認:

| テスト | 結果 |
|---|---|
| 無指定（回帰） | 74件、生イベント構造のまま |
| `textOnly=true` | 10件、`{role, timestamp, text}`の配列に整形 |
| `textOnly=true&limit=2` | 末尾2件のみ |
| 既存`chat/assistant/latest`（回帰） | 無変更で動作 |
| `isMeta:true`イベント | このセッションには0件だったが、コード上は`event.isMeta`で確実に除外される |

## 学び

- 「本文だけ抽出する」（ブロック単位）と「ターンを条件で残す/除外する」（ターン単位）は似ているようで挙動が異なる。既存の`isAssistantChat`は後者で、text+tool_use混在ターンを失うという盲点があった
- 新しい抽出ロジックは1つの関数でuser/assistant両方をカバーできた。tool_resultのみのuserターン・tool_useのみのassistantターンは、どちらも「本文が空になる」という共通の性質で自然に除外できるため、ロール別に分岐する必要がなかった
- 新エンドポイントを作らず既存エンドポイントにクエリパラメータを足す設計は、`/git/status?files=true`という先例があったおかげで判断に迷わなかった

## 今後の改善案

- 需要があれば、`chat/user|assistant/first|latest`の4エンドポイントも同じ`extractTextTurn`ベースに寄せて統一する余地はあるが、既存クライアントへの影響を考えると急ぐ必要はない

## 関連ドキュメント

- [`/projects/file` 画像対応](./2026-09-07-04-57-57-projects-file-image-support.md)

---

**最終更新**: 2026-09-07
**作成者**: Claude
