---
tags: [api, security, authentication, middleware]
---

# API トークン認証の実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: API セキュリティ強化

## 背景

### なぜこの実装が必要になったか

メッセージ取得 API の実装後、ユーザーから以下の懸念が提起された：

> API 側に API トークン簡易に設定できますっけ？

**懸念事項**:
- API が誰でもアクセス可能（取り放題）
- セッション情報は機密性が高い場合がある
- Send API で勝手にプロンプトを送信されるリスク

**要望**:
- 全エンドポイントに認証を適用
- シンプルな設定で有効化できる
- 設定しない場合は従来通り動作（後方互換性）

## 実装内容

### 1. config.json に apiToken フィールドを追加

**修正箇所**: `config.example.json:4`

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "",
  "subscribers": [ ... ]
}
```

**設計判断**:
- 空文字列 `""` の場合は認証を無効化
- フィールド自体がない場合も認証を無効化
- どちらのパターンでも後方互換性を維持

### 2. 認証ミドルウェアの実装

**修正箇所**: `src/index.js:24-46`

```javascript
// API トークン認証ミドルウェア
function authMiddleware(req, res, next) {
  const apiToken = config.apiToken;

  // トークンが設定されていない、または空文字列の場合は認証をスキップ
  if (!apiToken || apiToken === '') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid authorization header'
    });
  }

  const token = authHeader.substring(7); // "Bearer " を除去

  if (token !== apiToken) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid token'
    });
  }

  next();
}

// 全エンドポイントに認証を適用
app.use(authMiddleware);
```

**適用範囲**:
`app.use(authMiddleware)` により、以下の全エンドポイントに適用：
- `GET /sessions`
- `GET /sessions/:id/messages` (全て)
- `POST /sessions/new`
- `POST /sessions/:id/send`
- `POST /sessions/:id/cancel`
- `GET /managed`

### 3. 認証方式の選択

**採用方式**: Bearer Token

**理由**:
- HTTP 標準的な方法
- シンプルで実装しやすい
- ほとんどの HTTP クライアントが対応

**使用例**:
```bash
curl -H "Authorization: Bearer YOUR_SECRET_TOKEN" \
  http://localhost:3100/sessions
```

## テスト結果

### パターン1: 認証なし（apiToken 未設定）

**設定**:
```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
  // apiToken フィールドなし
}
```

**テスト**:
```bash
curl http://localhost:3100/sessions
```

**結果**: ✅ 成功（認証なしでアクセス可能）

### パターン2: 認証あり + トークンなし

**設定**:
```json
{
  "apiToken": "test-secret-token-12345"
}
```

**テスト**:
```bash
curl http://localhost:3100/sessions
```

**結果**: ✅ 401 Unauthorized
```json
{
  "error": "Unauthorized: Missing or invalid authorization header"
}
```

### パターン3: 認証あり + 正しいトークン

**テスト**:
```bash
curl -H "Authorization: Bearer test-secret-token-12345" \
  http://localhost:3100/sessions
```

**結果**: ✅ 成功（セッション一覧を取得）

### パターン4: 認証あり + 間違ったトークン

**テスト**:
```bash
curl -H "Authorization: Bearer wrong-token" \
  http://localhost:3100/sessions
```

**結果**: ✅ 401 Unauthorized
```json
{
  "error": "Unauthorized: Invalid token"
}
```

### パターン5: POST エンドポイントでの認証

**テスト（認証なし）**:
```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'
```

**結果**: ✅ 401 Unauthorized

**テスト（認証あり）**:
```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret-token-12345" \
  -d '{"prompt": "test", "cwd": "/path/to/project"}'
```

**結果**: ✅ 成功（セッション作成）

## 設計のポイント

### 後方互換性の維持

**判定ロジック**:
```javascript
if (!apiToken || apiToken === '') {
  return next();
}
```

以下のパターンで認証をスキップ：
1. `apiToken` フィールドが存在しない
2. `apiToken: ""`（空文字列）
3. `apiToken: null`（未定義）

**メリット**:
- 既存の config.json をそのまま使える
- 段階的な導入が可能
- デフォルトで認証なし（使いやすさ優先）

### 全エンドポイントへの適用

**選択肢**:
1. 全エンドポイントに適用
2. 書き込み系のみ（POST）
3. 柔軟な設定（エンドポイントごと）

**採用**: オプション1（全エンドポイント）

**理由**:
- シンプルで分かりやすい
- セッション情報の読み取りも保護すべき
- 設定が簡単（apiToken を設定するだけ）

### エラーメッセージの明確化

**2種類のエラー**:

1. **Authorization ヘッダーがない/形式が違う**
   ```json
   {
     "error": "Unauthorized: Missing or invalid authorization header"
   }
   ```

2. **トークンが間違っている**
   ```json
   {
     "error": "Unauthorized: Invalid token"
   }
   ```

**メリット**:
- ユーザーが問題を特定しやすい
- デバッグが容易

## 学び

### 学び1: Express ミドルウェアの強力さ

`app.use(authMiddleware)` の一行で全エンドポイントに認証を適用できる。

**ポイント**:
- ミドルウェアの配置順序が重要
- `express.json()` の後に配置
- ルーター登録の前に配置

### 学び2: オプショナル機能の設計

**ベストプラクティス**:
- デフォルトで無効（使いやすさ優先）
- 有効化は明示的（セキュリティ意識の向上）
- 後方互換性の維持（既存ユーザーに影響なし）

### 学び3: セキュリティと利便性のバランス

**このプロジェクトの判断**:
- ローカル開発環境での使用を想定
- デフォルトは認証なし（すぐ使える）
- 本番環境では apiToken 設定を推奨

## 今後の改善案

### より高度な認証方式

現在はシンプルな Bearer Token だが、以下も検討可能：
- JWT（JSON Web Token）
- API キー + シークレット
- OAuth 2.0

### トークンのハッシュ化

現在は平文で比較しているが、セキュリティを高めるには：
- config.json にハッシュ値を保存
- リクエストのトークンをハッシュ化して比較

### レート制限

認証に加えて：
- IP アドレス単位のレート制限
- トークン単位のレート制限
- 不正なアクセスの記録

### トークンのローテーション

- 定期的なトークン更新機能
- 複数トークンの管理
- トークン失効機能

## セキュリティ上の注意

### トークンの管理

**重要**:
- `config.json` は `.gitignore` に含めること
- トークンは環境変数からも読み込めるようにすると良い
- 強力なトークンを使用（推奨: 32文字以上のランダム文字列）

**例**:
```bash
# トークン生成例
openssl rand -hex 32
```

### HTTPS の使用

Bearer Token は平文で送信されるため：
- 本番環境では必ず HTTPS を使用
- ローカル開発でも可能なら HTTPS を推奨

## 関連ドキュメント

### 関連ノート
- [API パス構造の統一とメッセージ取得機能](./2026-03-01-09-40-00-api-path-unification-and-message-endpoints.md)

### 関連する申し送り
- [API テストと Webhook イベント統一](../letters/2026-03-01-07-52-00-api-testing-and-webhook-event-unification.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
