---
tags: [testing, node-red, repository-separation, integration-test, webhook]
---

# Node-RED テスター導入とテスト分離体制 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: テスト環境の分離とNode-REDテスターの導入

## 背景

### 従来のテスト体制

本体リポジトリ（claude-code-pipe）に以下のテストスクリプトを配置していた:

- `test-receiver.js`: Webhook 受信テスト用レシーバー
- `test-cancel.sh`: キャンセルイベントのテストスクリプト
- その他の検証スクリプト

**課題**:
- テストコードと本体コードが混在
- リアルな統合テスト環境が不足
- 外部ツール（Node-RED など）との連携テストが困難

## Node-RED テスターの導入

### 経緯

**2026年2月下旬**: リポジトリ分離戦略を策定（[2026-02-28-09-45-00-repository-separation-testing-strategy.md](./2026-02-28-09-45-00-repository-separation-testing-strategy.md)）

**2026年3月上旬**: Node-RED テスターを実際に導入
- 別リポジトリとして `claude-code-pipe-tester-node-red` を作成
- Webhook 受信テストを Node-RED 側で実施開始
- 本体リポジトリのテストスクリプトは簡易的なもののみ残す方針に

### リポジトリ構成

```
/home/node/workspace/repos/
├── claude-code-pipe/                      ← 本体（パブリック）
│   ├── src/                               ← 本体コード
│   ├── docs/                              ← 開発記録・申し送り
│   ├── test-receiver.js                   ← 簡易テスト（残存）
│   ├── test-cancel.sh                     ← 簡易テスト（残存）
│   └── package.json
│
└── claude-code-pipe-tester-node-red/      ← テスター（プライベート）
    ├── flows.json                         ← Node-RED フロー定義
    ├── package.json
    └── README.md
```

### テスト分離の方針

#### 本体リポジトリ（claude-code-pipe）

**役割**: 本体コードと開発記録の管理

**テストスクリプト**:
- ✅ **簡易的な検証スクリプトのみ残す**
  - `test-receiver.js`: シンプルな Webhook 受信確認
  - `test-cancel.sh`: キャンセルイベントの動作確認
- ✅ **main ブランチのみで運用**
- ✅ **パブリックリポジトリとして公開**

#### テスターリポジトリ（claude-code-pipe-tester-node-red）

**役割**: 統合テストと外部ツール連携の検証

**テスト内容**:
- ✅ **Webhook 受信テスト** - 実施済み
  - Node-RED で http://localhost:1880/ccpipe/webhook を受信
  - debug ノードで気軽に検証可能
  - ペイロード構造（source/tools/responseTime など）の確認
- 🔜 **API テスト** - これから実施
  - POST /sessions/new のテスト
  - POST /sessions/:id/send のテスト
  - セッション管理 API の統合テスト
- ✅ **プライベートリポジトリとして管理**

## 現在の状況（2026-03-01時点）

### ✅ 完了している項目

1. **Node-RED テスターリポジトリの作成**
   - リポジトリ: `/home/node/workspace/repos/claude-code-pipe-tester-node-red`
   - 起動方法: `npm start` で Node-RED 起動
   - Webhook エンドポイント: http://localhost:1880/ccpipe/webhook

2. **Webhook 受信テストの実施**
   - 本体から Webhook が正常に配信されることを確認
   - ペイロード構造の検証（source/tools/responseTime を含む）
   - debug ノードで受信内容を確認

3. **本体リポジトリのテストスクリプト整理**
   - 簡易的なテストスクリプトのみ残す
   - 統合テストは Node-RED 側に移行済み

### 🔜 これから実施する項目

1. **POST /sessions/new のテスト**
   - Node-RED から API 経由で新規セッション作成
   - セッションID の取得確認
   - Webhook でイベントを受信できるか確認

2. **POST /sessions/:id/send のテスト**
   - 既存セッションへの送信テスト
   - エラーハンドリングの確認

3. **統合テストシナリオの拡充**
   - セッションライフサイクル全体のテスト
   - タイムアウト動作の検証
   - キャンセル機能のテスト

## メリット

### 1. 本体リポジトリがクリーン

- ✅ **テストコードが薄い**: 簡易スクリプトのみ
- ✅ **main ブランチのみ**: シンプルな Git 運用
- ✅ **パブリック公開**: 開発記録も含めて公開

### 2. リアルな統合テスト環境

- ✅ **物理的に分離**: 本体とテスターが独立したプロセス
- ✅ **実際の利用シナリオ**: ユーザー環境を忠実に再現
- ✅ **Node-RED で気軽にテスト**: debug ノードで即確認

### 3. 開発効率の向上

- ✅ **視覚的なテスト**: Node-RED の UI でフローを確認
- ✅ **柔軟な拡張**: テストシナリオを自由に追加
- ✅ **外部ツール連携**: Slack 通知などの拡張も容易

## 注意事項

### ⚠️ テスターリポジトリはプライベート

- Node-RED テスターは **プライベートリポジトリ** として管理
- 開発者のみアクセス可能
- 機密情報（APIキーなど）は .env で管理し .gitignore で除外

### ⚠️ 本体リポジトリはパブリック

- すべてのファイルを公開
- 開発記録（docs/notes/）も公開
- 機密情報は絶対に含めない

### ⚠️ テスト分離の方針を維持

- 本体リポジトリに複雑なテストコードを追加しない
- 統合テストは Node-RED テスター側で実施
- 簡易的な検証スクリプトのみ本体に残す

## 学び

### 1. リポジトリ分離の実践

- 戦略策定（2月下旬）から実際の導入（3月上旬）までスムーズに移行
- 物理的な分離により、責任範囲が明確になった
- 本体リポジトリが薄く保たれることで、公開リポジトリとして適切な状態を維持

### 2. Node-RED の威力

- Webhook 受信テストが視覚的に確認できる
- debug ノードで即座にペイロードを確認可能
- フローの作成・修正が容易で、テスト開発が高速化

### 3. テスト分離の重要性

- 本体コードとテストコードの混在を根本的に防げる
- テスター側で自由に実験できる
- 本体はシンプルに保ちつつ、テストは充実させられる

## 今後の展開

### Node-RED テスターでのテスト拡充

1. **API テストの実施**
   - POST /sessions/new
   - POST /sessions/:id/send
   - GET /managed
   - POST /sessions/:id/cancel

2. **セッションライフサイクルのテスト**
   - session-started イベント
   - process-exit イベント
   - session-error イベント
   - session-timeout イベント

3. **エラーハンドリングのテスト**
   - 不正なリクエストのハンドリング
   - タイムアウト動作の検証
   - Webhook 配信失敗時の動作

### 将来的な拡張

- **claude-code-pipe-tester-basic**: 最小構成での動作確認
- **claude-code-pipe-tester-slack**: Slack 連携テスト
- **claude-code-pipe-tester-api**: REST API の包括的なテスト

## 関連ドキュメント

### 関連ノート

- [リポジトリ分離テスト戦略](./2026-02-28-09-45-00-repository-separation-testing-strategy.md)
- [Webhook ペイロード拡張](./2026-03-01-04-30-00-webhook-payload-enhancement.md)

### 関連申し送り

- [Webhook ペイロード拡張と設計判断](../letters/2026-03-01-04-40-00-webhook-payload-enhancement-and-design-decisions.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
