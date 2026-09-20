---
tags: [mqtt, websocket, communicationMode, dead-code, GET-info, implementation]
---

# MQTT コマンド受信チャネル実装・`/ws`廃止 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-20
**関連タスク**: [MQTT実装着手前合意ノート](./2026-09-20-07-00-13-mqtt-implementation-pre-agreement.md)に基づく実装

## 問題

長期持ち越しだったMQTTコマンド受信チャネルの実装。着手前合意で決定した以下の方針を実装に落とし込む:
1. `/ws`(WebSocket)を全廃止
2. QoS 0でMQTTコマンド受信チャネルを実装
3. コマンドペイロードはSend APIに揃える
4. 認証方式はID/パスワードのみ先行実装(証明書方式は保留)

## 解決策

### Phase 1: `/ws`削除

- `src/websocket.js`をファイルごと削除
- `src/index.js`から`require('./websocket')`・`setupWebSocket(server, watcher)`を削除
- `package.json`: `dependencies.ws`削除、`description`から「+ WebSocket」除去、`keywords`の`websocket`を`mqtt`に置き換え
- `DETAILS.md`/`DETAILS-ja.md`: `WS /ws`セクション、`src/index.js`モジュール説明中のWebSocket言及、`GET /version`レスポンス例中の`description`文言を削除・修正(計4箇所×2言語)

### Phase 2: `src/mqtt-receiver.js`新規実装

```js
function setupMqttReceiver(config) {
  const mqttConfig = config.mqtt;
  if (!mqttConfig || !mqttConfig.url || !mqttConfig.commandTopic) {
    return null; // 未設定時は何もしない
  }
  if (isWindowsNonWSL()) {
    console.warn('[mqtt] Windows native does not support `claude -p`; MQTT command channel disabled');
    return null;
  }
  const client = mqtt.connect(mqttConfig.url, {
    username: mqttConfig.username,
    password: mqttConfig.password
  });
  // connect時にcommandTopicをQoS 0で購読
  // message受信時: JSON.parseしてprompt/projectPath/sessionId/modelを取り出し、
  // sessionIdの有無でsendToSession / startNewSessionにディスパッチ
}
```

- `config.mqtt: { url, username?, password?, commandTopic }`(設計ノートの`url`埋め込み認証方式から**分離**。理由は[着手前合意ノート](./2026-09-20-07-00-13-mqtt-implementation-pre-agreement.md)参照)
- `src/sender.js`が既に公開していた`isWindowsNonWSL()`をそのまま再利用(Windows native判定は重複実装せず)
- `src/index.js`に組み込み: 起動時`setupMqttReceiver(config)`呼び出し、`mqttClient`をモジュールスコープに保持し、`SIGINT`/`SIGTERM`時に`mqttClient.end()`
- `config.example.json`・`DETAILS.md`/`DETAILS-ja.md`にMQTT設定・コマンドペイロード仕様(`{ prompt, projectPath?, sessionId?, model? }`)・セキュリティ注記(`password`は`GET /info`やwebhookペイロードに一切含まれない、`commandTopic`のみ露出)を追加
- `mqtt`パッケージ導入(`npm install mqtt`)

## 検証

### MQTT受信の動作確認

ローカルにテスト用broker(`aedes`)を`--no-save`で一時導入し、`config.json`を一時的にport 3102・`mqtt.url: mqtt://localhost:18830`に変更した別インスタンスで検証。

**つまずいた点**: `aedes`最新版(v1.2.0)はAPIが`new Aedes()`から`await Aedes.createBroker()`に変わっており、最初`new Aedes()`で起動したbrokerはTCP接続は通るがMQTTハンドシェイクが完全にハングする(クライアント側は`ERROR`も`CONNECTED`も出ず無限に待つ)という分かりにくい壊れ方をした。`docs/Examples.md`を確認して`createBroker()`ファクトリに直したところ解決。

**claudeコマンドの模擬**: 実際の`claude`バイナリを叩かずに`startNewSession`/`sendToSession`のディスパッチだけを検証するため、`stream-json`の`init`行を1行echoするだけのフェイク`claude`スクリプトを`/tmp/fake-bin/claude`に用意し、`PATH`の先頭に追加して起動。

**確認できたこと**:
1. broker切断中は`mqtt.js`のデフォルト再接続ロジックにより自動でリトライし続け、broker起動後に自動接続・購読(`[mqtt] Connected to ...` → `Subscribed to ...`)
2. `{ prompt, projectPath }`(sessionIdなし) → `startNewSession`にディスパッチ(`[mqtt] Started new session: sessionId=...`)
3. `{ prompt, sessionId }` → `sendToSession`にディスパッチ(`[mqtt] Sent to existing session: sessionId=...`)
4. 不正なJSON・`prompt`欠落ペイロードはログのみでスキップ、サーバーはクラッシュしない
5. `config.mqtt`未設定時はMQTT接続を一切試みない(既存挙動への影響なし)

検証後、`aedes`は`node_modules`から完全に削除(`package.json`/`package-lock.json`に混入していないことを確認済み)、テスト用の`config.json`・一時ファイルも復元・削除。

## 副次的な発見と対応

### `GET /info`が未ドキュメントだった

v0.8.3から実装済み(`src/api.js:246`)だったが、`DETAILS.md`/`DETAILS-ja.md`に一度も記載されていなかった。今回MQTT関連の`mqttCommandTopic`フィールドを説明する流れで気づき、`GET /version`の直後に追記。

### `src/index.js`にデッドコードが2つ埋まっていた

`/sessions/new`と`/sessions/:id/send`が`src/api.js`(`router.post`)と`src/index.js`(`app.post`)の**両方**に定義されていた。`src/index.js`では`app.use('/', apiRouter)`が先に登録されているため、Expressのルートマッチング順により`src/api.js`側(model/projectPath/allowedTools/disallowedTools/dangerouslySkipPermissionsをフル対応した本実装)が常に先にレスポンスを返し切り、`src/index.js`側の簡易版(`prompt`のみ対応)は**一生呼ばれない到達不能コード**だった。

最初にドキュメントを書いていて`src/index.js`側の簡易実装だけを見て「`model`が効いていない」と誤って報告してしまったが、ユーザーから「model指定できてたけど」と指摘を受けて再調査し、二重定義に気づいた。`src/index.js`側の該当67行を削除し、`startNewSession`/`sendToSession`の未使用importも削除。削除後に`curl -X POST /sessions/new`で`api.js`側固有のエラーメッセージ(`"projectPath is required"`)が返ることを確認し、生きている実装が変わっていないことを検証した。

## 学び

- **npmパッケージの「動くはずのサンプルコード」も、メジャーバージョンが上がっていればAPIが変わっている前提で確認する**。`aedes`は`new Aedes()` → `await Aedes.createBroker()`への変更で、しかも壊れ方が「エラーも出ず無限にハングする」という気づきにくいものだった。公式の`docs/Examples.md`を確認して初めて気づけた
- **「怪しいコードを見つけたら、まず本当にそこが実行されているか経路を疑う」**。ドキュメントと実装が食い違って見えても、それが「バグ」なのか「到達しないコード」なのかは別問題。今回は後者で、ユーザーからの実体験ベースの指摘(「model指定できてた」)がなければ誤った修正提案をするところだった
- **一時的な検証用パッケージ(`aedes`)は`--no-save`導入 → 検証 → `node_modules`から明示的に削除、を徹底する**。`package.json`/`package-lock.json`への混入がないことを毎回確認する習慣が効いた

## 今後の改善案

- 証明書ベース認証(AWS IoT Core等)は`config.mqtt`スキーマへの追加で対応予定。内部集約ブローカー+外部ブリッジ構成案([着手前合意ノート](./2026-09-20-07-00-13-mqtt-implementation-pre-agreement.md)参照)と合わせて別途検討
- pipe-viewer側でのMQTT publish実装・実地確認はこれから

## 関連ドキュメント

- [MQTT実装着手前合意ノート](./2026-09-20-07-00-13-mqtt-implementation-pre-agreement.md)
- [MQTT設計仕様](./2026-06-20-23-47-00-mqtt-design-spec.md)
- [WebSocket認証の穴の確認ノート](./2026-09-06-04-39-00-websocket-auth-gap-confirmation.md)

---

**最終更新**: 2026-09-20
**作成者**: AI
