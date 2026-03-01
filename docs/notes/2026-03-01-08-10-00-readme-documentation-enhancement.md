---
tags: [documentation, readme, user-guide, config-update]
---

# README ドキュメント充実化 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: README.md の充実作業

## 背景

### なぜこの作業が必要になったか

前セッションまでに以下の作業が完了していた：
- send API の検証完了
- Webhook イベント構造の統一
- 発報レベルの簡素化（basic/full + includeMessage）

しかし、README.md は開発初期の簡易的な内容のままで、使用者が実際にプロジェクトを使い始めるための情報が不足していた。

### ユーザーの要望

- **使用者向け**の情報を充実させたい（開発者向けではなく）
- 英語版（README.md）と日本語版（README-ja.md）を分けて作成
- 以下のセクションを明確に記載：
  - 概要
  - 起動方法
  - config.json 設定方法
  - config.json 詳細
  - API 情報

### コンセプト

ユーザーからの明確な指示：
> 「このプロジェクトは Claude Code の動作をシンプルに双方向にパイプするだけのライブラリです。」

このシンプルなコンセプトを前面に出すことが重要。

## 実装内容

### 1. config.example.json の更新

**変更内容**:
- 古い発報レベル（`summary`, `status`, `stream-status`）から新しい形式へ移行
- 新形式: `level: "basic"/"full"` + `includeMessage: true/false`

**修正箇所**: `config.example.json:1-29`

**修正前**:
```json
{
  "subscribers": [
    {
      "level": "summary"
    }
  ]
}
```

**修正後**:
```json
{
  "subscribers": [
    {
      "level": "basic",
      "includeMessage": true
    }
  ]
}
```

**理由**:
- 前セッションで発報レベルを簡素化したため、サンプル設定も最新形式に合わせる必要があった
- 使用者が config.example.json をコピーして使う際に、古い形式だと混乱を招く

### 2. README.md（英語版）の作成

**構成**:

1. **Overview**
   - シンプルなコンセプトを強調
   - "simply pipes Claude Code's behavior bidirectionally"

2. **Features**
   - Watch Mode, Send Mode, Cancel Mode の3つの主要機能
   - Webhook Distribution, Process Management

3. **Quick Start**
   - インストール → 設定 → 起動 → テストの流れ
   - PM2 を推奨、直接起動も記載

4. **Configuration Details**
   - 基本構造の例
   - 各フィールドの詳細（テーブル形式）
   - Webhook レベルの選び方（4パターンの用途別表）
   - 設定例（最小構成 / 複数 Webhook）

5. **API Reference**
   - Watch Mode: GET /sessions, GET /sessions/:id, GET /sessions/:id/latest, WS /ws
   - Send Mode: POST /sessions/new, POST /sessions/:id/send
   - Cancel Mode: POST /sessions/:id/cancel
   - Management: GET /managed
   - 各エンドポイントにリクエスト/レスポンス例を記載

6. **Webhook Event Format**
   - Basic Event (includeMessage: false) の例
   - Full Event (includeMessage: true) の例
   - イベントタイプ一覧表

7. **Troubleshooting**
   - よくある問題と解決方法
   - サーバーが起動しない / イベントが受信されない / セッションが見つからない / キャンセルが機能しない

8. **Development**
   - プロジェクト構造
   - テストの実行方法（別リポジトリ使用）

**主なポイント**:
- 使用者が迷わず使い始められる情報量
- Quick Start で最短経路を示す
- Configuration Details で詳細を網羅
- API Reference で全エンドポイントを明記
- Troubleshooting で問題解決を支援

### 3. README-ja.md（日本語版）の作成

**内容**:
- README.md と同等の内容を日本語で提供
- 構成は英語版と同一
- 日本語話者がすぐに理解できるように配慮

**相互リンク**:
- README.md の冒頭に「日本語版はこちら」リンク
- README-ja.md の冒頭に「English README is here」リンク

## 設計のポイント

### Webhook レベルの説明方法

**課題**:
- `level` と `includeMessage` の2軸設計をどう説明するか

**解決策**:
- 4パターンの組み合わせを用途別に表で説明

| level | includeMessage | Description | Use Case |
|-------|---------------|-------------|----------|
| `basic` | `false` | 最低限のイベント、メタ情報のみ | 軽量な通知（例: Slack） |
| `basic` | `true` | 最低限のイベント + message 全文 | 標準的な利用（例: Node-RED） |
| `full` | `false` | 全イベント、メタ情報のみ | デバッグ・監視（メタ情報のみ） |
| `full` | `true` | 全イベント + message 全文 | 完全なログ記録 |

**効果**:
- 使用者が自分の用途に合ったレベルを選びやすい
- `basic` + `includeMessage: true` が標準設定として推奨される

### 「message」と「メタ情報」の定義

**課題**:
- `includeMessage` の意味が分かりにくい

**解決策**:
- 明確な定義を記載

```
**What is "message"?**

- **message**: Raw JSONL data (content, usage, tools, etc.)
- **metadata**: Always included (sessionId, timestamp, type, source, responseTime, etc.)
```

**効果**:
- `includeMessage: false` でも基本情報は取得できることが明確に
- `includeMessage: true` で何が増えるかが理解しやすい

### API Reference の構造

**方針**:
- モード別にグループ化（Watch / Send / Cancel / Management）
- 各エンドポイントに必ずリクエスト/レスポンス例を記載
- パラメータはテーブル形式で説明

**効果**:
- 使用者が必要な API をすぐに見つけられる
- curl コマンド例で即座にテスト可能

## 学び

### ドキュメント整備の重要性

**学び1: 概要のシンプルさが重要**
- 技術的な詳細よりも「何をするライブラリか」を明確に
- "simply pipes Claude Code's behavior bidirectionally" という一文で本質を表現

**学び2: Quick Start の価値**
- 使用者は「すぐ動かしたい」
- インストール → 設定 → 起動 → テストの最短経路を示す
- PM2 を推奨することで安定稼働を促進

**学び3: 設定の選び方を示す**
- 単にフィールドを説明するだけでなく、用途別の推奨設定を示す
- Webhook レベルの4パターン表が有効

**学び4: Troubleshooting の必要性**
- よくある問題を先回りして記載
- 解決方法まで明記することでサポートコストを削減

### 英語版と日本語版の分離

**学び5: README.md と README-ja.md の分離メリット**
- 単一ファイルに両言語を混在させると読みにくい
- 相互リンクで行き来できるようにする
- 各言語話者が快適に読める

## 今後の改善案

### ドキュメントの拡充

- **チュートリアル**: Node-RED との連携例を詳細に記載
- **アーキテクチャ図**: 全体の動作フローを図示
- **FAQ セクション**: よくある質問を追加

### サンプル設定の追加

- Slack 連携の具体例
- 複数プロジェクトを監視する設定例
- セキュリティを考慮した設定例（authorization 使用）

## 関連ドキュメント

### 前回のセッション
- [API テストと Webhook イベント統一](../letters/2026-03-01-07-52-00-api-testing-and-webhook-event-unification.md)

### 関連する技術ノート
- [Webhook イベント構造の統一](./2026-03-01-07-41-00-webhook-event-structure-unification.md)
- [Node-RED テスター導入とテスト分離体制](./2026-03-01-05-00-00-node-red-tester-integration-and-test-separation.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
