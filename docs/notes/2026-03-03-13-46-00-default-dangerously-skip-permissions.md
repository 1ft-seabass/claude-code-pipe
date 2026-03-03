---
tags: [config, security, send-api, dangerously-skip-permissions, documentation]
---

# defaultDangerouslySkipPermissions 設定の追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-03
**関連タスク**: Send API の設定拡張

## 問題

Send API (`POST /sessions/new` および `POST /sessions/:id/send`) において、`dangerouslySkipPermissions` パラメータは常にリクエストボディで指定する必要がありました。

ユーザーからの要望：
- デフォルト値を config で設定したい
- リクエスト毎に指定するのは冗長
- デフォルトは `false`（安全）であるべき
- リクエストボディで明示的に上書き可能にしたい

## 実装方針

### アプローチ: config にデフォルト値を追加

**試したこと**: `config.send.defaultDangerouslySkipPermissions` を追加し、API でフォールバック処理を実装

**結果**: 成功

**実装内容**:

1. **config.json に設定追加**:
   ```json
   {
     "send": {
       "defaultAllowedTools": ["Read", "LS", "Grep", "Write", "Bash"],
       "cancelTimeoutMs": 3000,
       "defaultDangerouslySkipPermissions": false
     }
   }
   ```

2. **src/api.js でデフォルト値を読み込み**:
   ```javascript
   // デフォルト値を取得
   const defaultDangerouslySkipPermissions = config?.send?.defaultDangerouslySkipPermissions || false;
   ```

3. **リクエストボディで未指定の場合はデフォルト値を使用**:
   ```javascript
   // dangerouslySkipPermissions のデフォルト値を config から取得
   const skipPermissions = dangerouslySkipPermissions !== undefined
     ? dangerouslySkipPermissions
     : defaultDangerouslySkipPermissions;
   ```

## 解決策

### 実装場所

**1. config.json**:
- `send.defaultDangerouslySkipPermissions` を追加
- デフォルト値: `false`

**2. src/api.js:20-25**:
```javascript
function createApiRouter(watchDir, config) {
  const router = express.Router();
  const normalizedWatchDir = watchDir.replace(/^~/, process.env.HOME || '');

  // デフォルト値を取得
  const defaultDangerouslySkipPermissions = config?.send?.defaultDangerouslySkipPermissions || false;
```

**3. src/api.js:480-486** (`POST /sessions/new`):
```javascript
// dangerouslySkipPermissions のデフォルト値を config から取得
const skipPermissions = dangerouslySkipPermissions !== undefined
  ? dangerouslySkipPermissions
  : defaultDangerouslySkipPermissions;

// startNewSession を呼び出し
const result = await startNewSession(
  prompt,
  cwd || process.cwd(),
  allowedTools || [],
  skipPermissions,  // ← デフォルト値を適用
```

**4. src/api.js:529-535** (`POST /sessions/:id/send`):
```javascript
// dangerouslySkipPermissions のデフォルト値を config から取得
const skipPermissions = dangerouslySkipPermissions !== undefined
  ? dangerouslySkipPermissions
  : defaultDangerouslySkipPermissions;

// sendToSession を呼び出し
const result = sendToSession(
  sessionId,
  prompt,
  cwd,
  allowedTools || [],
  skipPermissions,  // ← デフォルト値を適用
```

**5. src/index.js:79**:
```javascript
// Watch 系 API ルーターをマウント
const apiRouter = createApiRouter(config.watchDir, config);  // ← config を渡す
app.use('/', apiRouter);
```

**6. DETAILS.md と DETAILS-ja.md**:
- Configuration セクションに `defaultDangerouslySkipPermissions` を追加
- Send API のパラメータテーブルにデフォルト値を明記
- Security Considerations セクションを新規追加（安全な使用ガイドライン付き）

### 主なポイント

1. **Optional chaining でフォールバック**:
   - `config?.send?.defaultDangerouslySkipPermissions || false`
   - config や send が存在しない場合も安全に `false` にフォールバック

2. **明示的な `undefined` チェック**:
   - `dangerouslySkipPermissions !== undefined` で判定
   - `false` の場合も正しく扱える（`|| false` では `false` が無視される）

3. **デフォルト値の優先順位**:
   - リクエストボディで指定 → その値を使用
   - リクエストボディで未指定 → config のデフォルト値を使用
   - config のデフォルト値も未設定 → `false`（安全）

4. **後方互換性**:
   - 既存の config にフィールドがなくても動作する
   - デフォルトは常に `false`（安全）

## 学び

### セキュリティ設計の原則

- **Secure by default**: デフォルト値は常に安全側（`false`）に設定
- **Fail-safe**: 設定値がない場合も安全な動作を保証
- **明示的なオプトイン**: 危険な動作は明示的に有効化する必要がある

### JavaScript の型チェック

- `|| false` は `false` 自体も無視してしまう
- `!== undefined` を使うことで、`false` を正しく扱える
- Optional chaining (`?.`) で安全なプロパティアクセスが可能

### ドキュメントの重要性

- セキュリティに関わる設定は詳細なドキュメントが必須
- Security Considerations セクションで具体的なリスクと使用ガイドラインを明記
- 安全な使用例と危険な使用例の両方を示すことが重要

## 今後の改善案

- 将来的に他のデフォルト値が必要になった場合、同じパターンで追加可能
- config のバリデーション機能を追加（型チェック、値の範囲チェック）
- 設定値の変更をリアルタイムで反映する仕組み（現在は再起動が必要）

## 関連ドキュメント

- [前回の申し送り](../letters/2026-03-02-13-31-22-session-filtering-feature.md)
- [Send API とプロジェクトパス統合](./2026-03-02-14-30-00-send-api-with-project-path-integration.md)
- DETAILS.md: Security Considerations セクション
- DETAILS-ja.md: セキュリティに関する注意事項

---

**最終更新**: 2026-03-03
**作成者**: Claude Code (AI)
