---
tags: [webhook, serverInfo, backendType, naming-collision, multi-backend]
---

# webhookペイロードへの`backendType`識別子追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-10-01
**関連タスク**: 将来の複数バックエンド(claude-code-pipe以外のpipe種別)集約を見据えた識別子をwebhookペイロードに追加

## 問題

[シグナルAPI(`GET /sessions/:id/signals`)の相談](./2026-10-01-06-58-53-sessions-signals-api.md)の中で、「シグナルの`type`に`claude_code`のような識別子を入れたい」という要望が出たが、ユーザー自身の訂正により、実はシグナルAPIとは無関係で「webhookの各レスポンスに入れたい話」だったと判明。将来、claude-code-pipe以外の種類のpipe(バックエンド)が同じviewer/集約先に接続する可能性を見据え、発生元を区別できるフィールドが欲しいという要望だった。

## 設計

既存の`serverInfo`パターン(`src/subscribers.js`、`os`/`communicationMode`を起動時に一度だけ算出し、全webhookペイロードに常に含める)を踏襲し、`backendType: 'claude_code'`という固定値フィールドを追加する方針にした。`mqttCommandTopic`/`projectTitle`のように未設定時は省略する設計とは異なり、値が常に確定しているため条件分岐なしで常に含める。

### 実装前に発見した命名衝突

`user-message-received`/`assistant-response-completed`ペイロードには、既に`source: 'api' | 'cli'`という**別の意味**のフィールドが存在していた(セッションがREST API経由かCLI経由かを示す)。安易に`source: 'claude_code'`という名前で追加していたら、同一オブジェクトリテラル内で後勝ちとなり`source: source`(api/cli)で上書きされ、`claude_code`の方が消えるところだった。

実装前の設計相談でこれを指摘し、フィールド名を`backendType`に変更することでユーザーと合意してから実装に進んだ。

## 実装

- `src/subscribers.js`: `serverInfo`オブジェクトに`backendType: 'claude_code'`を追加。ペイロード構築箇所3箇所(`handleProcessEvent`、`user-message-received`、`assistant-response-completed`)すべてに`backendType: serverInfo.backendType`を追加
- `src/api.js`: `GET /info`のレスポンスにも同様に追加(`GET /info`はwebhookペイロードと同じ「pipeの現在の設定状態」を返す場所のため、揃えておくのが自然)

## 検証

一時ポート(3104)+一時`watchDir`(`/tmp/backendtype-test-watch`)+一時HTTPキャプチャサーバー(ポート18831、受信bodyをログ出力するだけの簡易Node.jsサーバー)を使い、テスト用JSONLファイルを配置して`user-message-received`イベントを実際に発火させ、webhookペイロードをキャプチャ:

```json
{
  "type": "user-message-received",
  ...
  "communicationMode": "bidirectional",
  "backendType": "claude_code",
  "projectTitle": "claude-code-pipe",
  "source": "cli",
  ...
}
```

`backendType: "claude_code"`と`source: "cli"`が衝突せず共存することを確認。テスト後、一時サーバー・ファイル・`config.json`のバックアップを復元して本番(3100)に影響がないことも確認した。

## ドキュメント更新

`DETAILS.md`/`DETAILS-ja.md`の以下6箇所に反映:
- `GET /info`のレスポンス例・フィールド表
- Webhookの「Event Structure」フィールド表
- Event Examples内のJSON例5件(`session-started`, `assistant-response-completed`, `process-exit`, `cancel-initiated`、および`GET /info`例)

英語版はEdit、日本語版は機械的なスクリプト置換(Python、`"os": "linux",`の直後に挿入、ただし`GET /info`ブロックは`communicationMode`の後に挿入するため正規表現の否定先読みで除外)で行い、両ファイルで挿入箇所の行番号が完全に一致することを確認した。

## 学び

- **フィールド名を決める前に、追加先のオブジェクトに同名キーが既に存在しないか必ず確認する**。`source`という一見よくある名前は、このコードベースでは既に「api/cli判定」という別の意味で使われていた。`grep -n "serverInfo\."`で全ペイロード構築箇所を洗い出してから命名したことで、実装前に衝突に気づけた
- 「〜を入れたい」という要望は、相談の過程で話が混ざっていることがある(今回は「シグナルの`type`」と「webhookペイロードの識別子」が一時的に混同された)。ユーザー自身が訂正に気づいてくれたが、要望の対象範囲(どのAPI/どのレスポンスの話か)は都度明確にする価値がある

## 関連ドキュメント

- [シグナルAPI設計・実装ノート](./2026-10-01-06-58-53-sessions-signals-api.md)
- [Webhook ペイロード大改善ノート](./2026-06-20-23-46-13-webhook-payload-overhaul.md)(`communicationMode`/`os`導入の経緯)

---

**最終更新**: 2026-10-01
**作成者**: AI
