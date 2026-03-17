---
tags: [api, version, semver, management]
---

# バージョンAPI実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-17
**関連タスク**: バージョン管理とバージョンAPI の確認・検討（申し送りからの継続タスク）

## 背景

前回のセッション（callbackUrl 実装完了）後、申し送りで「バージョン管理や、バージョンまわりを返す API まわり確認・検討」の要望があった。

## 現状確認

### 既存のバージョン管理
- `package.json` に `"version": "1.0.0"` として記載
- バージョンを返す専用の API エンドポイントは**存在しない**

### 既存のエンドポイント
- `GET /projects`
- `GET /sessions`
- `GET /sessions/:id/messages`
- `POST /sessions/new`
- `POST /sessions/:id/send`

## 検討内容

### 1. バージョンAPI の実装範囲

ユーザーに選択肢を提案:
1. **シンプルな GET /version エンドポイントのみ** (推奨) ✅ **採用**
   - package.json のバージョンを返すシンプルな実装
   - 軽量で実装も簡単
2. バージョン情報をヘルスチェック API に含める
3. 詳細な情報を含む GET /info エンドポイント

→ **採用**: シンプルな GET /version エンドポイント

### 2. バージョニングポリシー

ユーザーに選択肢を提案:
1. **現状のまま（手動管理）** ✅ **採用**
   - package.json のバージョンを手動で更新
   - シンプルで柔軟
2. SemVer に準拠したバージョン管理
   - セマンティックバージョニング（Major.Minor.Patch）に従った明確なルール

→ **採用**: 手動管理（シンプルで柔軟）

## 実装内容

### 1. GET /version エンドポイントの追加

**実装場所**: `src/api.js:14-15, 158-164`

**主なポイント**:
1. package.json を require で読み込み
2. シンプルな JSON レスポンスを返す
3. name, version, description の3つのフィールドを含む

**実装コード**:
```javascript
// package.json を読み込み
const packageJson = require('../package.json');

// GET /version - バージョン情報
router.get('/version', (req, res) => {
  res.json({
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description
  });
});
```

### 2. ドキュメントの更新

**更新ファイル**:
- `DETAILS.md`: Management セクションに GET /version の説明を追加
- `DETAILS-ja.md`: 同様の内容を日本語で追加

**追加内容**:
- リクエスト例
- レスポンス例
- フィールド説明（name, version, description）

### 3. バージョン番号の変更

**変更内容**: `1.0.0` → `0.5.0`

**理由**:
- ユーザーの要望（「弱気ですいません！」とのこと）
- まだ開発中の機能であることを示す
- 0.5.0 はある程度の完成度を示しつつ、正式版ではないことを表現

**変更ファイル**:
- `package.json`
- `DETAILS.md` (サンプルレスポンス)
- `DETAILS-ja.md` (サンプルレスポンス)

## 動作確認

### テスト方法
```bash
# サーバー起動
npm start

# バージョンエンドポイントのテスト
curl http://localhost:3100/version
```

### 実際のレスポンス
```json
{
  "name": "claude-code-pipe",
  "version": "0.5.0",
  "description": "A pipe for Claude Code input/output using JSONL and Express + WebSocket"
}
```

**結果**: ✅ 正常動作

## 学び

### 1. シンプルさの価値
- 最小限の実装で必要な機能を提供
- package.json を直接読み込むシンプルな実装で十分
- 過度な抽象化や複雑化を避ける

### 2. バージョン管理の柔軟性
- 手動管理でも問題ない（特に個人用ツール）
- 必要になったら SemVer を採用すればよい
- 現時点では package.json を更新するだけで対応可能

### 3. ドキュメントの一貫性
- API エンドポイントを追加したら、必ず DETAILS.md / DETAILS-ja.md を更新
- Management セクションに配置することで、他の管理系APIと統一

## 今後の改善案

- バージョン履歴の管理（CHANGELOG.md の作成）
- リリースタグの自動化（将来的に）
- npm version コマンドとの連携（必要に応じて）

## 関連ドキュメント
- [callbackUrl 実装記録](./2026-03-17-00-25-00-callback-url-implementation.md) - 前回のセッション
- [callbackUrl 設計記録](./2026-03-16-10-00-00-callback-url-config-design.md) - callbackUrl の設計
- [申し送り: callbackUrl 実装](../letters/2026-03-17-00-30-00-callback-url-implementation.md) - 今回のセッションの起点

---

**最終更新**: 2026-03-17
**作成者**: Claude Code (AI)
