---
tags: [config, webhook, callback-url, implementation, api]
---

# callbackUrl 設定の実装記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-17
**関連タスク**: callbackUrl 設定追加（Phase 12）
**設計ドキュメント**: [callbackUrl 設計記録](./2026-03-16-10-00-00-callback-url-config-design.md)

## 概要

前セッションで設計した `callbackUrl` 設定を実装しました。Webhook 受信側が claude-code-pipe の URL を知るための設定項目です。

## 実装内容

### 1. config.example.json の更新

**実装場所**: `config.example.json:5`

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "",
  "projectTitle": "",
  "callbackUrl": "",  // ← 追加
  "subscribers": [
    // ...
  ]
}
```

**ポイント**:
- トップレベルに配置（projectTitle の後）
- デフォルト値は空文字列（設定しなくてもOK）

### 2. src/subscribers.js の修正

#### 2-1. setupSubscribers 関数（行130-132）

```javascript
const cwdPath = process.cwd();
const cwdName = path.basename(cwdPath);
const projectTitle = config.projectTitle || null;
const callbackUrl = config.callbackUrl || null;  // ← 追加

const serverInfo = { cwdPath, cwdName, projectTitle, callbackUrl };
```

**ポイント**:
- 未設定時は `null` として扱う（空文字列も `null` に変換）
- serverInfo オブジェクトに含めて、全イベントで統一的に送信

#### 2-2. handleSubscriberEvent 関数（行242）

```javascript
const payload = {
  type: 'assistant-response-completed',
  sessionId: event.sessionId,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  callbackUrl: serverInfo.callbackUrl,  // ← 追加
  ...(projectPath && { projectPath }),
  // ...
};
```

**ポイント**:
- `null` でも明示的にペイロードに含める（フィールドの存在を保証）
- cwdName の直後に配置（一貫性のため）

#### 2-3. handleProcessEvent 関数（行198）

```javascript
const payload = {
  type: eventType,
  sessionId: event.sessionId,
  pid: event.pid,
  timestamp: event.timestamp,
  cwdPath: serverInfo.cwdPath,
  cwdName: serverInfo.cwdName,
  callbackUrl: serverInfo.callbackUrl,  // ← 追加
  ...(serverInfo.projectTitle && { projectTitle: serverInfo.projectTitle }),
  // ...
};
```

**ポイント**:
- session-started, process-exit, cancel-initiated など全イベントで送信
- 配置位置は handleSubscriberEvent と統一

### 3. DETAILS.md の更新

**更新箇所**:
1. 設定表（Root Level）に callbackUrl を追加
2. ペイロードフィールド説明に callbackUrl を追加
3. Basic Event サンプルに callbackUrl を追加（+ 注釈）
4. Full Event サンプルに callbackUrl を追加
5. Event Examples の各サンプル（session-started, assistant-response-completed, process-exit, cancel-initiated）に callbackUrl を追加

**サンプル値**: `"http://claude-code-pipe:3100"`

**追加した注釈**:
```markdown
- `callbackUrl` is `null` if not set in `config.json`
```

### 4. DETAILS-ja.md の更新

DETAILS.md と同様に、日本語版も全箇所更新しました。

**追加した注釈**:
```markdown
- `callbackUrl` は `config.json` で未設定の場合は `null` になります
```

### 5. README.md / README-ja.md

**更新不要と判断**:
- README には最小限の設定例のみ記載されている
- 詳細は DETAILS.md への参照のみ
- callbackUrl は任意設定なので、README の最小構成には不要

## 動作確認

### テスト環境

```bash
# サーバー起動
npm install  # 依存関係インストール
npm start    # サーバー起動

# config.json 設定
{
  "callbackUrl": "http://localhost:3100"
}
```

### テスト結果

1. **サーバー起動**: ✅ 正常に起動
2. **Webhook 送信**: ✅ Node-RED テスター未起動のため接続エラーだが、送信は試行されている
3. **ペイロード**: ✅ callbackUrl が含まれている（コードレビューで確認）

**ログ確認**:
```
[stderr] [subscribers] Error posting to tester-node-red (http://localhost:1880/ccpipe/webhook): connect ECONNREFUSED 127.0.0.1:1880
```

→ Node-RED が起動していないため接続エラー。Webhook 送信自体は正常に動作している。

## 設計との差分

### 設計通りに実装した点

- ✅ 命名: `callbackUrl`
- ✅ 未設定時: `callbackUrl: null` をペイロードに含める
- ✅ 設定場所: config.json のトップレベル
- ✅ 送信場所: serverInfo に含めて全イベントで送信
- ✅ 環境変数対応: 今回は見送り

### 実装時の判断

**README 更新を見送った理由**:
- README には最小限の設定例のみ記載
- callbackUrl は任意設定（必須ではない）
- 詳細は DETAILS.md に記載されているため、README には不要

## 学び

### 1. ドキュメント更新の網羅性

DETAILS.md の更新箇所が多岐にわたる：
- 設定表（Root Level）
- ペイロードフィールド説明
- Basic Event サンプル
- Full Event サンプル
- Event Examples（4種類のイベント）

→ 合計9箇所の更新が必要。漏れがないよう注意が必要。

### 2. 日英ドキュメントの同期

DETAILS.md と DETAILS-ja.md は完全に同期する必要がある。
- 更新箇所の数を合わせる
- サンプル値を統一する
- 注釈の内容を翻訳する

### 3. null vs undefined の扱い

未設定時に `undefined` ではなく `null` を明示的に送信する設計：
- JSON で明示的に `"callbackUrl": null` として送信
- Webhook 受信側がフィールドの存在を前提にできる
- デフォルト値の設定が容易

## 今後の改善案

### 環境変数対応（将来の拡張）

現状は config.json のみ対応。将来的に環境変数対応を追加する場合：

```javascript
const callbackUrl = process.env.CALLBACK_URL || config.callbackUrl || null;
```

**注意点**:
- 他の設定項目（apiToken, projectTitle）も環境変数未対応
- 一貫性を保つため、一括で環境変数対応を追加することを推奨

### Node-RED テスターでの動作確認

今回は Node-RED テスターが起動していなかったため、実際の Webhook ペイロードを確認できていない。

**次のセッションでの確認事項**:
1. Node-RED テスターを起動
2. テストセッションを作成
3. Webhook ペイロードに `callbackUrl` が含まれているか確認
4. 値が正しく設定されているか確認（`"http://localhost:3100"`）

## 関連ドキュメント

- [callbackUrl 設計記録](./2026-03-16-10-00-00-callback-url-config-design.md) - 前セッションで作成した設計ノート
- [前回の申し送り](../letters/2026-03-16-10-30-00-callback-url-config-design.md) - 設計セッションの申し送り

---

**最終更新**: 2026-03-17
**作成者**: Claude Code (AI)
