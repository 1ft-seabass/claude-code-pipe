---
tags: [security, authentication, websocket, mqtt, verification]
---

# Authorization認証の再確認（REST OK / WebSocketは素通し） - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: 近々の外部公開実験に向けて、`config.apiToken`によるBearer認証が意図通り効いているか確認

## 問題

`/projects/file`等の新API追加を機に、「今は`apiToken`未設定運用だが、近々設定して実験する可能性がある」という話になり、実際に効いているかを事前に確認したいという相談があった。

## 検証

一時的に`apiToken`を設定した別ポート(3101)のインスタンスを立てて確認。

| 経路 | ヘッダーなし | 間違ったトークン | 正しいトークン |
|---|---|---|---|
| REST（`/version`, `/projects/file`含む全エンドポイント） | 401 | 401 | 200 |
| WebSocket（`/ws`） | **接続成功**（認証スキップ） | - | - |

## 原因

- `src/index.js`の`authMiddleware`は`app.use(authMiddleware)`でExpressのミドルウェアチェーンに乗っている
- `src/websocket.js`は`new WebSocketServer({ server, path: '/ws' })`という形で、Express（`app`）を介さず`http.Server`の`upgrade`イベントに直接フックしている（`ws`ライブラリの`server`オプションの挙動）
- WebSocketのupgradeリクエストはExpressのリクエストハンドラを経由しないため、`authMiddleware`は素通りする

## 解決策・判断

実装での対応は見送り。理由:

- `/ws`はほぼ利用されていない機能
- そもそもWebSocketではこの種の防御を完全には防ぎきれないという認識（作者談）
- 将来的にはMQTTベースのコマンド受信チャネル（[`2026-06-20-23-47-00-mqtt-design-spec.md`](./2026-06-20-23-47-00-mqtt-design-spec.md)で設計済み）に置き換え、`/ws`自体をいずれ閉じる方向で考えている

つまり「直すべきバグ」ではなく「廃止予定機能の暫定状態」という位置づけで一致。

## 学び

- `ws`ライブラリを`{ server }`オプションでExpressサーバーに相乗りさせる構成は、Express側のミドルウェア（認証含む）を素通りする。認証を効かせたい場合は`noServer: true` + 自前の`upgrade`イベントハンドラでトークン検証してから`wss.handleUpgrade()`を呼ぶ必要がある
- 「コードを読んで分かったつもり」で終わらせず、実際に`apiToken`を設定してcurl・WebSocketクライアントで叩いて確認したことで、REST側は問題なし・WS側に穴ありという事実がはっきりした

## 今後の改善案

- `/ws`をWebSocket認証強化 or MQTT移行のどちらかのタイミングで見直す（優先度低、廃止予定のため）

## 関連ドキュメント

- [設計相談ノート](./2026-09-06-04-37-00-projects-file-api-design.md)
- [実装ノート](./2026-09-06-04-38-00-projects-file-api-implementation.md)
- [MQTT設計仕様](./2026-06-20-23-47-00-mqtt-design-spec.md)

---

**最終更新**: 2026-09-06
**作成者**: Claude
