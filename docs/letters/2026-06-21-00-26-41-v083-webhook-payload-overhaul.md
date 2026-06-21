---
tags: [session-handoff, v0.8.3, webhook, payload, mqtt, communicationMode]
---

# 申し送り（2026-06-21-00-26-41-v083-webhook-payload-overhaul）

> **⚠️ 機密情報保護ルール**
>
> この申し送りに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない
> - コミット前に git diff で内容を確認
> - プッシュはせずコミットのみ(人間がレビュー後にプッシュ)

---

## 🔍 次のセッション開始時の検証プロトコル

```bash
# バージョン確認
curl http://localhost:3100/version
# → "version": "0.8.2"（まだバージョンアップしていない）

# GET /info の動作確認
curl http://localhost:3100/info
# → version, os, communicationMode, callbackUrl, subscriberCount, projectTitle, watchDir が返ること

# Webhook ペイロードに os, communicationMode, isSubagent, isMeta が含まれるか
# → 実際にイベントを発生させて subscriber で確認
```

---

## 現在の状況（タスク別）

### ✅ 完了: v0.8.3 開発実装

**ステータス**: ✅ 完了（コミット済み・プッシュ未実施）

**完了内容**:
- ✅ `src/sender.js` — `getOsInfo()` 追加（`"mac"` / `"linux"` / `"windows"`、WSL は linux 扱い）
- ✅ `src/parser.js` — `isMeta` フィールドを抽出してイベントに追加
- ✅ `src/subscribers.js` — 以下を全ペイロードに追加:
  - `os`: サーバー OS 種別
  - `isSubagent`: `/subagents/` パス由来イベントかどうか
  - `isMeta`: Claude Code ハーネスが自動注入したメッセージかどうか
  - `communicationMode`: `"bidirectional"` / `"webhook-only"` / `"watch-only"`
  - `mqttCommandTopic`: MQTT コマンドトピック名（broker 認証情報は含めない）
- ✅ `level` / `includeMessage` による絞り込みを廃止（常時全イベント・全メッセージ配信）
- ✅ `postToSubscriber` → `deliverToSubscriber` にリネーム（将来の MQTT dispatch 差し込みポイント）
- ✅ `src/api.js` — `GET /info` エンドポイント新設
- ✅ `config.example.json` — `level` / `includeMessage` 削除
- ✅ `DETAILS.md` / `DETAILS-ja.md` — v0.8.3 仕様に全面更新
- ✅ コミット完了（3段階）
  - `6e53b1c docs: Webhook 改善・MQTT 設計仕様のノートを追加`
  - `a2cc46d feat: Webhook ペイロード強化・level/includeMessage 廃止・GET /info 新設`
  - `bd0ad73 docs: DETAILS・config.example.json を v0.8.3 仕様に更新`

### ⚠️ 未実施: v0.8.3 リリース準備

**ステータス**: ⚠️ 未実施

**次セッションでの作業**:
1. CHANGELOG.md / CHANGELOG-ja.md に v0.8.3 エントリを追加
2. `package.json` のバージョンを 0.8.2 → 0.8.3 に更新
3. `docs/actions/sync_to_main.md` に従って main ブランチへ反映
4. develop ブランチをプッシュ

### ⚠️ 未実施: main ブランチへの反映（v0.8.2 以前分）

**ステータス**: ⚠️ 要確認（前回申し送りから持ち越し）

次セッション開始時に `git log main..develop` で差分を確認のこと。

### 📝 将来実装: MQTT コマンド受信チャネル

**ステータス**: 仕様策定済み・実装未着手

詳細は `docs/notes/2026-06-20-23-47-00-mqtt-design-spec.md` を参照。

---

## 次にやること

1. **最優先**: v0.8.3 リリース準備（CHANGELOG・バージョンアップ・sync to main）
2. **次に**: main ブランチ反映・develop プッシュ
3. **将来**: MQTT コマンド受信チャネルの実装（`mqtt.js` 導入）

---

## 注意事項

- ⚠️ `logs/server.log` に認証情報が記録されており、pre-commit フックが毎回警告を出す。今回の変更とは無関係。ログファイルをクリアするかフックの除外設定を検討してもよい
- ⚠️ `level` / `includeMessage` を config に持っている既存ユーザーは、フィールドが無視されるようになった。後方互換はある（エラーにならない）が、DETAILS.md の廃止注記を確認してもらう必要がある
- ⚠️ `isSubagent: true` のイベントは現在 viewer 側でフィルタする設計。pipe 側では除外しない（観測ニーズへの対応余地を残すため）

---

## 技術的な文脈

### 起動方法
```bash
# 起動
npm run dev:tmux:start

# 再起動
npm run dev:tmux:restart

# 停止
npm run dev:tmux:stop

# ステータス確認
npm run dev:tmux:status
curl http://localhost:3100/health
```

### テスト手法（正式フレームワークなし、手動確認）
```bash
# バージョン確認
curl http://localhost:3100/version

# pipe 状態確認（今回追加）
curl http://localhost:3100/info

# Webhook 動作確認: subscriber に実際にイベントを流して確認
```

### 重要ファイル
- `src/subscribers.js`: Webhook 配信・ペイロード構築
- `src/sender.js`: Claude CLI プロセス管理・getOsInfo
- `src/api.js`: REST API ルート定義（GET /info を含む）
- `src/parser.js`: JSONL パース（isMeta 含む）
- `docs/notes/2026-06-20-23-47-00-mqtt-design-spec.md`: MQTT 設計仕様

### 現在のバージョン
- v0.8.2（次セッションで v0.8.3 にバージョンアップ予定）

---

## セッション文脈サマリー

### 核心的な設計決定

**「絞る」から「タグ付けして viewer に委ねる」への転換**
- 理由: level/includeMessage の基準が曖昧になった。pipe で絞るよりも viewer 側でフィルタする方が柔軟
- 影響範囲: 全 webhook ペイロード（情報量が増える）

**isSubagent / isMeta はフィルタではなくタグ付け**
- 理由: 将来「subagent の起動を観測したい」ニーズが出た場合に対応できる
- 実装: `event.jsonlFilePath.includes('/subagents/')` / `data.isMeta`

**MQTT はコマンド受信専用（イベント配信は HTTP webhook のまま）**
- 理由: 役割を分離することでシンプルになる。`deliverToSubscriber` の変更不要
- config: `mqtt.url` + `mqtt.commandTopic`（broker 認証情報はペイロードに出さない）

**communicationMode を全ペイロードに含める**
- 理由: viewer が GET /info を都度ポーリングせずに常に状態を把握できる
- 判定: `callbackUrl` または `mqtt.commandTopic` があれば `"bidirectional"`

### 次のセッションに引き継ぐべき「空気感」

- **このプロジェクトの優先順位**: CLI 透過性 > 独自機能。pipe はなるべく素通しで、viewer 側でリッチな処理をする設計
- **現在の開発フェーズ**: v0.8.3 実装完了、リリース準備待ち
- **MQTT は仕様確定、実装未着手**: `docs/notes/2026-06-20-23-47-00-mqtt-design-spec.md` が仕様書。次に着手するタイミングは viewer 側の準備が整ったとき

---

**作成日時**: 2026-06-21 00:26:41
**作成者**: AI
