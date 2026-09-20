---
tags: [mqtt, websocket, design, agreement, communicationMode, pre-implementation]
---

# MQTT コマンド受信チャネル 実装着手前合意 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-20
**関連タスク**: MQTTコマンド受信チャネルの実装(長期持ち越し事項)着手にあたっての事前合意

## 問題

[MQTT設計仕様ノート](./2026-06-20-23-47-00-mqtt-design-spec.md)(2026-06-20作成)で設計は済んでいたが、実装は長期未着手のまま複数回の申し送りを経て持ち越されていた。v0.8.6〜v0.8.9のリリースが一段落したのを機に、実装に着手することになった。

着手前に、設計ノート時点では詰め切れていなかった論点をユーザーと合意した。

## 決定事項

### 1. `/ws`(WebSocket)を全廃止する

**理由**:
- 実利用がほぼゼロの機能
- `authMiddleware`を素通りする認証穴が既に確認済み([WebSocket認証の穴の確認ノート](./2026-09-06-04-39-00-websocket-auth-gap-confirmation.md)参照)で、設定値やセキュリティ対策も薄いまま「変な穴になりそう」という懸念があった
- MQTTのコマンド受信チャネルが実装されれば、双方向通信の役割は完全にMQTT側に置き換わる

**観測した削除対象範囲**:

| ファイル | 内容 |
|---|---|
| `src/websocket.js` | ファイルごと削除(`/ws`専用、他から参照なし) |
| `src/index.js` | `require('./websocket')`と`setupWebSocket(server, watcher)`の呼び出し削除 |
| `package.json` | `dependencies.ws`(`src/websocket.js`でのみ使用)を削除。`description`の「... + WebSocket」の文言見直し |
| `DETAILS.md` / `DETAILS-ja.md` | `#### WS /ws`セクション削除 |
| `README.md` / `README-ja.md` | 元々WebSocketの記載なし、影響なし |
| `config.example.json` | WebSocket関連設定項目なし、影響なし |

### 2. QoSは0(fire and forget)

**理由**: コマンド受信は人間がその場で操作する用途(Send的な操作)で、無人自動リトライに依存する運用ではなさそう。QoS 1のbroker側状態管理コストをかけるメリットが薄い。

**留保事項**: broker再接続中の一瞬に来たコマンドは黙って消える。この挙動は許容前提で進める。

### 3. コマンドペイロード形式はSend APIに揃える

`POST /sessions/new` / `POST /sessions/:id/send`に近い形(`{ prompt, projectPath, sessionId?, model? }`)。設計ノート記載の案を踏襲。

### 4. 認証方式はまずID/パスワード(MQTT/MQTTS)のみ実装

**対象**: HiveMQのようなID/パスワードで済むMQTTS方式。

**保留**: AWS IoT Coreのような証明書ファイル系(クライアント証明書・秘密鍵・CA証明書の3点セット)。設定値の持たせ方(ファイルパス参照 vs PEM文字列埋め込み等)の視野がまだ固まっていないため、今回のスコープには含めない。`config.mqtt`のスキーマは、後から証明書方式を追加できる形で拡張余地を残す。

## 将来検討(保留・アイデアメモ)

**内部集約ブローカー + 外部ブリッジ構成案**: 内部の集約ブローカーにはID/パスワードでシンプルに繋ぎ、外部への転送はブリッジ的にMQTT転送する構成にすれば、証明書系認証の複雑さを各pipeではなくブリッジ層に閉じ込められるかもしれない、というアイデアが出た。証明書方式のスキーマ設計を保留した理由とも相性が良く、実装が進んだ段階で改めて相談する。

## 次のアクション

この合意に基づき、以下を実装フェーズで進める:
1. `/ws`削除
2. `mqtt`npmパッケージ導入
3. `config.mqtt`スキーマ設計(ID/パスワード方式、証明書方式は拡張余地を残す)
4. `src/mqtt-receiver.js`(仮)でbroker接続・`commandTopic`購読・Send APIへのディスパッチ
5. 再接続ロジック、Windows native環境での扱い(`claude -p`非対応のため無視 or 警告)

## 関連ドキュメント

- [MQTT設計仕様](./2026-06-20-23-47-00-mqtt-design-spec.md)
- [WebSocket認証の穴の確認ノート](./2026-09-06-04-39-00-websocket-auth-gap-confirmation.md)
- [Webhook ペイロード大改善ノート](./2026-06-20-23-46-13-webhook-payload-overhaul.md)

---

**最終更新**: 2026-09-20
**作成者**: AI
