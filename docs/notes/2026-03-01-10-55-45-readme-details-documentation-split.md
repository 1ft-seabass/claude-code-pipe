---
tags: [documentation, readme, api-reference, user-experience, restructuring]
---

# README/DETAILS ドキュメント分離 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: Phase 3: ドキュメント整備

## 問題

前セッション（Phase 2）で API トークン認証とメッセージ取得 API を実装したが、README.md が以下の問題を抱えていた：

1. **長すぎる**: API リファレンス、設定詳細、トラブルシューティングなど全てが含まれ、スクロールが長い
2. **Quick Start が不親切**: いきなり新規セッション作成（Send Mode）から始まる → ハードルが高い
3. **API トークン認証の説明がない**: Phase 2 で実装した認証機能のドキュメントが未追加
4. **古い API パスが残っている**: `/sessions/:id/latest` など、Phase 1 で変更したパス構造が反映されていない

## 解決策

### ドキュメント分離方針（パターンB）

申し送りで既に決定されていた **パターンB（README + DETAILS に分割）** を採用：

```
README.md (README-ja.md)
├── 概要
├── Quick Start（段階的）
│   ├── Step 1: インストールと起動
│   ├── Step 2: Watch Mode で動作確認（読み取り専用）
│   └── Step 3: Send Mode で新規セッション作成（オプション）
├── 基本的な設定
└── 詳細は DETAILS.md へ

DETAILS.md (DETAILS-ja.md)
├── Configuration Details
├── API Reference（全エンドポイント）
├── Webhook Event Format
├── Troubleshooting
└── Development
```

**理由**:
- README をシンプルに保つ（初めての人でもすぐ理解できる）
- 詳細情報は一箇所にまとめる（探しやすい）
- ドキュメント数が少なくメンテナンスしやすい

### Quick Start の段階的改善

**Before（問題）**:
```
1. Setup Configuration
2. Start the Server
3. Test the API ← いきなり新規セッション作成（POST /sessions/new）
```

**After（改善）**:
```
Step 1: Install and Start
  - npm install
  - config.json 設定（最小限）
  - サーバー起動

Step 2: Watch Mode (Read-Only) ← 安全に始められる
  - GET /sessions（一覧取得）
  - GET /sessions/:id/messages（全メッセージ）
  - GET /sessions/:id/messages/assistant/latest（最新応答）

Step 3: Send Mode (Optional) ← 慣れてから
  - POST /sessions/new（新規セッション）
  - POST /sessions/:id/send（既存セッションに送信）
```

**理由**:
- まず Watch Mode（読み取り専用）で動作確認 → 安全・シンプル
- Send Mode は後回し → ハードルを下げる
- 既存セッションへの送信は最後 → 段階的に学べる

### 基本的な設定の簡素化

**Before（問題）**:
- 全フィールドの詳細な説明テーブル
- Webhook レベルの詳細
- 複数の設定例

**After（改善）**:
```json
// 最小構成
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}

// Webhook を使う場合
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [...]
}

// API トークンを使う場合（本番環境推奨）
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here"
}
```

**理由**:
- シンプルな例だけ README に
- 詳細は DETAILS.md へのリンク
- 「できるだけシンプルな設定で始められる」配慮

### API トークン認証のドキュメント追加

Phase 2 で実装した認証機能を以下に追加：

1. **README.md - 基本的な設定**:
   - API トークンの設定例
   - `Authorization: Bearer TOKEN` の使用例

2. **DETAILS.md - API Reference**:
   - 認証セクション
   - 全エンドポイントに適用される旨を明記
   - 未設定時は認証無効（後方互換性）

3. **DETAILS.md - Troubleshooting**:
   - 認証エラー（401 Unauthorized）の解決策

### API パス構造の更新

Phase 1 で実装した新しいパス構造を全ドキュメントに反映：

**Before（古いパス）**:
```
GET /sessions/:id           # 全イベント取得
GET /sessions/:id/latest    # 最新 assistant メッセージ
```

**After（新しいパス）**:
```
GET /sessions/:id/messages                      # 全メッセージ
GET /sessions/:id/messages/user/first          # 最初のユーザーメッセージ
GET /sessions/:id/messages/user/latest         # 最後のユーザーメッセージ
GET /sessions/:id/messages/assistant/first     # 最初のアシスタントメッセージ
GET /sessions/:id/messages/assistant/latest    # 最後のアシスタントメッセージ
```

## 実装内容

### 1. README.md のリファクタリング

**変更箇所**: `/home/node/workspace/repos/claude-code-pipe/README.md`

**主な変更**:
- Quick Start を 3 ステップに分割（Install → Watch → Send）
- Configuration Details を「基本的な設定」に簡素化
- API Reference を削除し DETAILS.md へのリンクに置き換え
- Common Use Cases セクションを追加（実用例）
- Documentation セクションで DETAILS.md を案内

### 2. DETAILS.md の作成（新規）

**ファイルパス**: `/home/node/workspace/repos/claude-code-pipe/DETAILS.md`

**含まれる内容**:
- **Configuration Details**: 全フィールドの詳細、Webhook レベル、設定例
- **API Reference**: 認証、Watch/Send/Cancel/Management、全エンドポイント
- **Webhook Event Format**: イベント構造、イベントタイプ、例
- **Troubleshooting**: よくある問題と解決策（認証エラー含む）
- **Development**: プロジェクト構造、テスト、新機能追加、デバッグ

### 3. README-ja.md の更新

**変更箇所**: `/home/node/workspace/repos/claude-code-pipe/README-ja.md`

**主な変更**:
- 英語版と同等の構成に更新
- 段階的な Quick Start（Step 1-3）
- 基本的な設定（最小構成、Webhook、API トークン）
- DETAILS-ja.md へのリンク

### 4. DETAILS-ja.md の作成（新規）

**ファイルパス**: `/home/node/workspace/repos/claude-code-pipe/DETAILS-ja.md`

**含まれる内容**:
- 英語版（DETAILS.md）と同等の内容を日本語で
- 完全な API リファレンス、設定、トラブルシューティング

## 主なポイント

1. **段階的な学習曲線**: Watch Mode（安全）→ Send Mode（慣れてから）
2. **シンプルな README**: 最小限の情報で始められる
3. **詳細な DETAILS**: 全ての情報が一箇所に
4. **認証のドキュメント化**: Phase 2 の実装を反映
5. **新しい API パス**: Phase 1 の変更を反映

## 学び

### 1. ドキュメント分離のタイミング

README が長くなりすぎたときの対処法：
- **パターンA（細分化）**: API.md, CONFIG.md, TROUBLESHOOTING.md など個別ファイル
- **パターンB（2分割）**: README（シンプル）+ DETAILS（詳細）
- **このプロジェクトでは B を採用**: ドキュメント数を少なく保つため

### 2. Quick Start の設計原則

- **最初は読み取り専用**: 破壊的な操作は後回し
- **段階的に複雑化**: Step 1（基本）→ Step 2（応用）→ Step 3（高度）
- **ハードルを下げる**: 「まず動かす」を優先

### 3. API トークン認証のドキュメント化

認証機能を追加したら、以下を忘れずに：
- 基本的な設定例（config.json）
- 使用例（curl コマンド）
- トラブルシューティング（401 エラーの解決策）
- 後方互換性の説明（未設定時の挙動）

### 4. 多言語ドキュメントの管理

英語版と日本語版を同期させるポイント：
- 構成を完全に一致させる（目次、セクション順）
- リンク構造も一致させる（DETAILS.md ⇔ DETAILS-ja.md）
- 同時に作成/更新する（片方だけ更新すると不整合が起きる）

## 今後の改善案

### ドキュメント面

- [ ] **Examples セクション**: 実用的なユースケース（Node-RED との連携、CI/CD での活用など）
- [ ] **Migration Guide**: 旧 API パスからの移行ガイド（もし利用者がいる場合）
- [ ] **FAQ セクション**: よくある質問と回答

### 技術面

- [ ] **OpenAPI Specification**: API 仕様を OpenAPI で定義し、Swagger UI を提供
- [ ] **SDK/Client Library**: JavaScript/Python クライアントライブラリの提供
- [ ] **Interactive Tutorial**: 実際に動かせるサンプルプロジェクト

## 関連ドキュメント

### 今回のセッション
- [申し送り - メッセージ API 拡張とトークン認証](../letters/2026-03-01-10-05-00-message-api-enhancement-and-token-auth.md)

### 前回のセッション（Phase 1 & 2）
- [API パス構造の統一とメッセージ取得機能](./2026-03-01-09-40-00-api-path-unification-and-message-endpoints.md)
- [API トークン認証の実装](./2026-03-01-09-45-00-api-token-authentication.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
