---
tags: [webhook, payload, os, subagent, isMeta, communicationMode, breaking-change, v0.8.3]
---

# Webhook ペイロード大改善・GET /info 新設 - 開発記録

**作成日**: 2026-06-20
**関連タスク**: v0.8.3 — Webhook ペイロード情報強化・level/includeMessage 廃止・subagent 識別

## 問題

1. **level/includeMessage による絞り込みの陳腐化**: `basic`/`full` の区分と `includeMessage` フラグが設計意図と実態でズレてきた。「絞る基準が定義しづらい」「セキュリティ的な意味もない」状態になっていた
2. **OS 情報がない**: viewer がサーバー OS を知る手段がなかった
3. **subagent イベントが区別できない**: Claude Code の Agent ツールが起動した subagent の JSONL（`/subagents/` パス）が親セッションと同一 sessionId で重複発火していた
4. **isMeta メッセージが識別できない**: Claude Code ハーネスが `--resume` 時に自動注入する `isMeta: true` メッセージが通常メッセージと区別できなかった
5. **pipe の状態を viewer が知る手段がない**: communicationMode（双方向か片方向か）を取得する API がなかった

## 解決策

### 1. level / includeMessage 廃止

**方針**: 常に全イベント・全メッセージを配信。viewer 側でフィルタする設計に転換。

- `handleProcessEvent` の `shouldSend` 分岐を削除（全イベント常時送信）
- `handleSubscriberEvent` の `includeMessage` 条件を削除（`message` 常時含める）
- `config.json` の `level`/`includeMessage` フィールドは読んでも無視
- DETAILS.md / DETAILS-ja.md に廃止注記追加

**背景**: viewer 側で表示を選別できるならペイロード側で絞る意味がない。絞ることがセキュリティ上も有効でない。

### 2. OS 情報の追加

**実装**: `src/sender.js` に `getOsInfo()` を追加。`process.platform` で判定。

```js
function getOsInfo() {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'windows';
  return 'linux'; // WSL も Linux として扱う
}
```

全ペイロードの `serverInfo` に `os` を追加。起動時に一度だけ計算。

### 3. subagent / isMeta のタグ付け

**`src/parser.js`**: `isMeta: data.isMeta || false` をイベントオブジェクトに追加。

**`src/subscribers.js`** の `handleSubscriberEvent`:

```js
const isSubagent = !!(event.jsonlFilePath && event.jsonlFilePath.includes('/subagents/'));
```

ペイロードに `isSubagent: boolean` / `isMeta: boolean` を常時含める。viewer 側で除外できる。

**フィルタではなくタグ付けにした理由**: 将来「subagent 起動の観測」ニーズが出た場合に対応できる。今除外してしまうと再導入が難しい。

### 4. communicationMode / mqttCommandTopic の追加

`setupSubscribers` 起動時に一度算出して `serverInfo` に持たせ、全ペイロードに含める。

```js
let communicationMode;
if (subscriberCount === 0) {
  communicationMode = 'watch-only';
} else if (hasCallbackUrl || mqttCommandTopic) {
  communicationMode = 'bidirectional';
} else {
  communicationMode = 'webhook-only';
}
```

`mqttCommandTopic` はトピック名のみ（broker URL・認証情報は含めない）。

### 5. GET /info 新設

`src/api.js` に `GET /info` を追加。pipe の現在の設定状態を返す。

```json
{
  "version": "0.8.3",
  "os": "linux",
  "communicationMode": "bidirectional",
  "callbackUrl": "http://viewer1:3100",
  "mqttCommandTopic": "claude/pipe-A/send",
  "subscriberCount": 2,
  "projectTitle": "My Project",
  "watchDir": "~/.claude/projects"
}
```

初回接続・デバッグ用。通常運用は webhook ペイロードの `communicationMode` で把握。

### 6. deliverToSubscriber リネーム

`postToSubscriber` → `deliverToSubscriber` に全箇所リネーム。

**理由**: 将来 MQTT など HTTP 以外のプロトコルに対応する際、この関数がプロトコル dispatch の差し込み口になる。`post`（HTTP 専用感）より `deliver`（プロトコル中立）が適切。

## 実装場所

| ファイル | 変更内容 |
|---|---|
| `src/sender.js` | `getOsInfo()` 追加・export |
| `src/parser.js` | `isMeta` フィールド追加 |
| `src/subscribers.js` | 全ペイロードに `os`/`isSubagent`/`isMeta`/`communicationMode`/`mqttCommandTopic` 追加、level/includeMessage ロジック削除、`deliverToSubscriber` リネーム |
| `src/api.js` | `GET /info` 新設、`getOsInfo` import 追加 |
| `config.example.json` | `level`/`includeMessage` 削除 |
| `DETAILS.md` / `DETAILS-ja.md` | ペイロードドキュメント全面更新 |

## 学び

- 「絞る」設計は後からでも viewer 側でできるが、「情報を乗せる」設計は pipe 側でしかできない。情報量を増やして viewer に委ねる方向が長期的に正しい
- `isMeta` / `isSubagent` のようなフラグは「自動除外」より「タグ付けして viewer に委ねる」方が変化に強い
- 関数名は将来の拡張を示す命名にしておくと差し込みポイントが明確になる（`postToSubscriber` → `deliverToSubscriber`）

## 今後の改善案

- `existsSync` ベースのパス復元ロジック（`extractProjectPath` の後半部分）は JSONL cwd 読み取りが成功すれば事実上デッドコード。将来的に削除を検討
- MQTT 実装時は `deliverToSubscriber` 内でスキームによって dispatch する（[MQTT 設計仕様ノート](./2026-06-20-23-47-00-mqtt-design-spec.md)参照）

---

**最終更新**: 2026-06-20
**作成者**: AI
