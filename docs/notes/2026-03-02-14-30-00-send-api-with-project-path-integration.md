---
tags: [send-api, project-path, rest-api, cwd, integration]
---

# Send API とプロジェクトパス統合 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-02
**関連タスク**: Send 機能強化とプロジェクト情報統合

## 問題

### 問題1: Webhook がまだ来ていないときに Send できない

Webhook で `projectPath` を受信する前に、初手で Send したい場合に対応できていなかった。

**シナリオ**:
- ユーザーがサーバー起動直後に Send したい
- まだ Webhook が来ていないため、クライアントは `projectPath` を知らない
- どのディレクトリで `claude -p` を実行すべきか分からない

### 問題2: `claude -p --resume` の cwd 問題

`sendToSession` で既存セッションに送信する際、セッション ID だけでは元のプロジェクトディレクトリが判別できない。

**技術的背景**:
- `claude -p --resume <session-id>` は、**実行された cwd** でコマンドが動作する
- セッション ID は Claude のバックエンドに保存されているが、元の cwd 情報は含まれていない
- サーバーの起動場所で実行すると、意図しない場所でファイル操作が実行される可能性がある

## 解決策

### 解決策の2本柱

#### シナリオ1: Webhook → Send
1. Webhook で `projectPath` を受信
2. クライアントが `projectPath` を保存
3. `/sessions/:id/send` で `cwd` パラメータとして使用

#### シナリオ2: 初回 Send（Webhook なし）
1. `/projects` または `/sessions` で `projectPath` を取得
2. クライアントが選択して保存
3. `/sessions/new` または `/sessions/:id/send` で `cwd` パラメータとして使用

### 実装内容

#### 1. `extractProjectPath()` の共通化

**実装場所**: `src/subscribers.js:304-306`

```javascript
module.exports = {
  setupSubscribers,
  extractProjectPath  // 追加
};
```

**理由**: Webhook と REST API の両方で同じロジックを使用するため

#### 2. `/projects` エンドポイント追加

**実装場所**: `src/api.js:146-187`

**機能**:
- プロジェクトごとにセッションをグルーピング
- セッション数の多い順にソート
- `projectPath`, `projectName`, `sessionCount`, `sessions[]` を返す

**レスポンス例**:
```json
{
  "projects": [
    {
      "projectPath": "/home/user/workspace/my-app",
      "projectName": "my-app",
      "sessionCount": 5,
      "sessions": [
        {
          "id": "01234567-89ab-cdef-0123-456789abcdef",
          "mtime": 1709280000000
        }
      ]
    }
  ]
}
```

#### 3. `/sessions` API に `projectPath` / `projectName` を追加

**実装場所**:
- `src/api.js:94-96` (getSessionMetadata)
- `src/api.js:184-185` (詳細版)

**追加フィールド**:
- `projectPath`: プロジェクトディレクトリのフルパス
- `projectName`: プロジェクトディレクトリ名

**メリット**:
- セッション一覧から直接プロジェクト情報を取得できる
- クライアント側で `/projects` と `/sessions` のどちらからでも情報取得可能

#### 4. `POST /sessions/new` 実装

**実装場所**: `src/api.js:349-379`

**パラメータ**:
| フィールド | 型 | 必須 | 説明 |
|-------|------|------|------|
| `prompt` | string | Yes | プロンプト |
| `cwd` | string | No | 作業ディレクトリ（デフォルト: process.cwd()） |
| `allowedTools` | array | No | 許可ツール |
| `dangerouslySkipPermissions` | boolean | No | 権限確認スキップ（危険） |

#### 5. `POST /sessions/:id/send` 実装

**実装場所**: `src/api.js:381-425`

**パラメータ**:
| フィールド | 型 | 必須 | 説明 |
|-------|------|------|------|
| `prompt` | string | Yes | プロンプト |
| `cwd` | string | **Yes** | 作業ディレクトリ |
| `allowedTools` | array | No | 許可ツール |
| `dangerouslySkipPermissions` | boolean | No | 権限確認スキップ（危険） |

**重要**: `cwd` は必須パラメータ（間違った場所での実行を防ぐため）

#### 6. `sender.js` の修正

**実装場所**:
- `src/sender.js:31` (startNewSession に cwd パラメータ追加)
- `src/sender.js:205` (sendToSession に cwd パラメータ追加)
- `src/sender.js:40-42` (dangerouslySkipPermissions 対応)
- `src/sender.js:213-215` (dangerouslySkipPermissions 対応)

**変更内容**:
```javascript
// startNewSession
const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
  cwd: cwd || process.cwd(),  // 追加
  stdio: ['pipe', 'pipe', 'pipe']
});

// sendToSession
const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
  cwd: cwd || process.cwd(),  // 追加
  stdio: ['pipe', 'pipe', 'pipe']
});

// dangerouslySkipPermissions
if (dangerouslySkipPermissions) {
  claudeArgs.push('--dangerously-skip-permissions');
}
```

## 設計決定

### 決定1: クライアント側で状態管理、サーバーはステートレス

**理由**:
- サーバー側でセッション ID → cwd のマッピングを保持すると、状態管理が複雑になる
- JSONLファイルパスから逆算する方法もあるが、リアルタイム性に問題がある
- Webhook の v2 で `projectPath` を送信しているため、クライアント側で保存すれば十分

**メリット**:
- シンプルな設計
- サーバーの再起動に影響されない
- クライアント側で柔軟に管理できる

**デメリット（許容範囲）**:
- クライアント実装が少し複雑になる（Webhook で受け取った `projectPath` を保存する必要がある）

### 決定2: `/send` ではなく REST 設計に従う

**変更前**: `POST /send` (ボツ案)
**変更後**:
- `POST /sessions/new` (新規セッション作成)
- `POST /sessions/:id/send` (既存セッションに送信)

**理由**:
- REST API の設計原則に従う
- リソース指向の URL 設計
- DETAILS.md に既に記載されていた仕様に準拠

### 決定3: `cwd` を必須パラメータにする（`/sessions/:id/send` のみ）

**理由**:
- 間違った場所で `claude -p --resume` を実行すると、意図しないファイル操作が発生する可能性がある
- 明示的に指定させることでミスを防ぐ
- `/sessions/new` はデフォルト値（process.cwd()）があるため optional

### 決定4: `dangerouslySkipPermissions` パラメータを追加

**実装場所**: 両エンドポイント（`/sessions/new`, `/sessions/:id/send`）

**理由**:
- ユーザーから明示的なリクエストがあった
- 自動化シナリオで有用
- デフォルトは `false` で安全性を確保

**警告**:
- DETAILS.md に「⚠️ DANGEROUS: Skip permission confirmations. Use with extreme caution.」と明記
- 十分注意して使用する必要がある

## ドキュメント更新

### DETAILS.md / DETAILS-ja.md

**更新箇所**:
1. `POST /sessions/new` に `dangerouslySkipPermissions` パラメータを追加
2. `POST /sessions/:id/send` に `cwd` と `dangerouslySkipPermissions` パラメータを追加
3. `GET /projects` エンドポイントを Management セクションに追加
4. `GET /sessions` のレスポンスに `projectPath` / `projectName` を追加（シンプル版・詳細版・メタデータフィールド表）

**注意事項の記載**:
- `dangerouslySkipPermissions` には「⚠️ 危険」「十分注意して使用してください」と明記
- プロジェクトごとのソート順（セッション数降順）を記載
- Webhook v2 と同じパス抽出ロジックを使用することを明記

## 学び

### 学び1: セッション ID だけでは cwd は判別できない

`claude -p --resume` の仕様として、セッション ID はバックエンドに保存されているが、実行時の cwd は含まれていない。そのため、クライアント側で明示的に管理する必要がある。

### 学び2: REST API 設計の重要性

最初は `/send` というエンドポイントを検討したが、DETAILS.md を確認したところ、既に REST 設計に沿った `/sessions/new` と `/sessions/:id/send` が定義されていた。既存の設計を尊重することで、一貫性のある API になった。

### 学び3: 初回送信とWebhook後送信の両方をサポートする重要性

「Webhook が来ないと Send できない」という制約があると、ユーザー体験が悪くなる。`/projects` エンドポイントを追加することで、どちらのシナリオにも対応できるようになった。

## 今後の改善案

### 改善案1: `/projects/:path/sessions` エンドポイント

特定のプロジェクトのセッション一覧を取得できると便利かもしれない。

### 改善案2: デフォルト cwd の自動推測

`/sessions/:id/send` で `cwd` が指定されていない場合、JSONLファイルパスから `projectPath` を抽出して使用する方法も検討できる。ただし、リアルタイム性とパフォーマンスのトレードオフがある。

### 改善案3: キャッシュヒット率のモニタリング

`extractProjectPath()` のキャッシュがどれくらい効果を発揮しているか、モニタリングできると良い。

## 関連ドキュメント

- [Webhook プロジェクト識別機能 v2](./2026-03-02-11-30-00-webhook-project-identification-v2.md)
- [申し送り（2026-03-02-11-22-45）](../letters/2026-03-02-11-22-45-webhook-project-identification-v2.md)
- `DETAILS.md` - API ドキュメント
- `DETAILS-ja.md` - API ドキュメント（日本語版）

---

**最終更新**: 2026-03-02
**作成者**: Claude Code (AI)
