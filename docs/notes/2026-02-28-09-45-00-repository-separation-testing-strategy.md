---
tags: [testing, repository-strategy, integration-test, docker, development-environment]
---

# リポジトリ分離テスト戦略 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-28
**関連タスク**: テストコード混入問題の解決とブランチ戦略の見直し

## 問題

### 従来のブランチ戦略の課題

以前のノート（[2026-02-23-10-00-00-release-branch-strategy.md](./2026-02-23-10-00-00-release-branch-strategy.md)）では、以下のブランチ戦略を検討していた：

```
main (開発用) - すべての開発ツール込み
release (公開用) - 最小限の構成
```

**課題**:
1. ブランチ間の同期作業が必要
2. main → release への「抜く」作業が発生
3. 検証用スクリプト（test-receiver.js など）の扱いが曖昧
4. 統合テスト環境の整備が不十分

### 新たな懸念

claude-code-pipe プロジェクトを実際に組み込んで使いたいユーザー向けに、**統合テストのためのテスター環境**が必要。しかし、テストコードを本体リポジトリに混入させると：

- ❌ リポジトリが肥大化
- ❌ 本体コードとテストコードの境界が曖昧
- ❌ 利用者にとって不要なファイルが混在
- ❌ Node-RED などの外部ツール設定ファイルの管理が複雑

## 解決策：リポジトリ分離戦略

### 基本方針

**本体リポジトリと統合テスト用リポジトリを物理的に分離する**

```
/home/node/workspace/repos/
├── claude-code-pipe/              ← 本体（main ブランチのみ）
└── claude-code-pipe-tester-*/     ← テスター群（別リポジトリ）
    ├── claude-code-pipe-tester-node-red/
    ├── claude-code-pipe-tester-basic/
    └── ...
```

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ Docker Container (claude-code 環境)                      │
│                                                           │
│  /home/node/workspace/repos/                             │
│  ├── claude-code-pipe/          (本体リポジトリ)        │
│  │   ├── src/                                            │
│  │   ├── docs/                                           │
│  │   │   ├── notes/            (開発記録)               │
│  │   │   ├── actions/          (開発者向けアクション)   │
│  │   │   └── letters/          (申し送り)               │
│  │   ├── package.json                                    │
│  │   ├── .husky/               (開発ツール)             │
│  │   ├── .secretlintrc.json                              │
│  │   ├── gitleaks.toml                                   │
│  │   └── test-*.js/sh          (簡易的な検証スクリプト) │
│  │                                                        │
│  └── claude-code-pipe-tester-node-red/  (テスター)      │
│      ├── flows.json            (Node-RED フロー)         │
│      ├── package.json                                    │
│      ├── config/                                         │
│      │   └── claude-pipe-config.json                     │
│      ├── test-scenarios/                                 │
│      │   ├── basic-session.js                            │
│      │   ├── webhook-integration.js                      │
│      │   └── cancel-event.js                             │
│      └── README.md             (テスター専用ドキュメント)│
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 本体リポジトリ（claude-code-pipe）

**役割**: 本体コード、開発ツール、開発記録の管理

**含むもの**:
- ✅ `src/`: 本体ソースコード
- ✅ `docs/notes/`: 開発記録（知見の蓄積）
- ✅ `docs/actions/`: 開発者向けアクション指示書
- ✅ `docs/letters/`: セッション終了時の申し送り
- ✅ `.husky/`, `.secretlintrc.json`, `gitleaks.toml`: 開発ツール
- ✅ `test-receiver.js`, `test-cancel.sh`: 簡易的な検証スクリプト
- ✅ `package.json`: すべての依存関係（devDependencies 込み）
- ✅ `README.md`: 本体の使い方

**ブランチ戦略**:
- **main ブランチのみ**（release ブランチ不要）
- 開発も公開も main で一本化
- シンプルな Git 運用

**公開範囲**:
- GitHub パブリックリポジトリ
- すべてのファイルを公開（開発記録含む）
- 利用者は必要なファイルだけ使う

### テスターリポジトリ（claude-code-pipe-tester-*）

**役割**: 統合テスト環境、実際の組み込み利用シナリオ検証

**想定されるテスターの種類**:

#### 1. claude-code-pipe-tester-node-red
**用途**: Node-RED との連携テスト

**含むもの**:
- `flows.json`: Node-RED のフロー定義
- `package.json`: Node-RED 関連の依存関係
- `config/claude-pipe-config.json`: claude-code-pipe の設定
- `test-scenarios/`: テストシナリオスクリプト
- `README.md`: セットアップ手順

**テスト項目**:
- Webhook 受信
- イベントフィルタリング
- セッション管理
- エラーハンドリング

#### 2. claude-code-pipe-tester-basic（将来的）
**用途**: 最小構成での動作確認

**含むもの**:
- 最小限の設定ファイル
- 基本的な受信テストスクリプト
- クイックスタートガイド

### 同時起動による統合テスト

```bash
# repos/ ディレクトリ内で両方のリポジトリを起動

# ターミナル1: 本体を起動
cd /home/node/workspace/repos/claude-code-pipe
npm run pm2:start

# ターミナル2: テスターを起動
cd /home/node/workspace/repos/claude-code-pipe-tester-node-red
npm start
# または
node-red flows.json
```

**リアルな統合テスト**:
- 本体とテスターが独立したプロセスで動作
- Webhook 配信を実際に受信してテスト
- 利用者の環境を忠実に再現

## メリット

### 1. 本体リポジトリがクリーンに保たれる

- ✅ **ブランチ戦略不要**: main ブランチのみ
- ✅ **テストコード混入なし**: 統合テストは別リポジトリ
- ✅ **利用者の自由度**: 必要なファイルだけ使える

### 2. リアルな統合テスト環境

- ✅ **物理的な分離**: プロセスレベルで独立
- ✅ **実際の利用シナリオ**: ユーザーと同じ環境でテスト
- ✅ **外部ツール連携**: Node-RED などの設定を独立管理

### 3. クロスプラットフォーム開発

- ✅ **Windows PC でも同じ構成**: repos/ 配下に両方クローン
- ✅ **開発環境の一貫性**: Docker 内でも外でも同じ
- ✅ **複数テスター並行**: 用途別に複数のテスターを用意可能

### 4. 開発ツールの扱い

- ✅ **husky/secretlint/gitleaks**: 本体に残しても問題なし
  - 利用者は npm install 時に自動適用されるが、普通に使う分には影響しない
  - 開発に参加する人には有益
  - 機密情報混入のリスクが現状では低い

## 運用方針

### 本体リポジトリ（claude-code-pipe）

**公開範囲**:
- GitHub パブリックリポジトリ
- すべてのファイルを公開

**コミット方針**:
- 開発ツール込みでコミット
- セキュリティチェック（secretlint/gitleaks）は自動実行
- docs/notes/ で開発記録を蓄積

**利用者への案内**:
```markdown
# README.md に追記する内容

## 開発に参加する場合

このリポジトリには開発ツール（husky, secretlint, gitleaks）が含まれています。
npm install を実行すると、Git フックが自動的にセットアップされます。

```bash
npm install  # husky の prepare スクリプトが自動実行される
```

開発に参加しない場合でも、これらのツールは通常の利用には影響しません。
```

### テスターリポジトリ（claude-code-pipe-tester-*）

**公開範囲**:
- GitHub プライベートリポジトリ
- 開発者のみアクセス可能

**目的**:
- 統合テスト環境の構築
- 実際の組み込み利用シナリオの検証
- Node-RED などの外部ツール連携テスト

**管理方針**:
- 本体リポジトリとは独立して管理
- テストシナリオを自由に追加・変更
- 機密情報（APIキーなど）は .env で管理し .gitignore で除外

## 実装手順

### ステップ1: 既存ファイルの整理

**本体リポジトリで残すもの**:
- `test-receiver.js`: 簡易的なWebhook受信テスト
- `test-cancel.sh`: キャンセルイベントのクイックテスト

**テスターリポジトリへ移動するもの**:
- 将来的に作成する複雑な統合テストシナリオ
- Node-RED のフロー定義
- 外部ツール連携設定

### ステップ2: テスターリポジトリの作成

```bash
# 新しいテスターリポジトリを作成（本体とは別ディレクトリ）
cd /home/node/workspace/repos/
mkdir claude-code-pipe-tester-node-red
cd claude-code-pipe-tester-node-red

# 初期化
git init
npm init -y

# .gitignore を作成
cat > .gitignore <<EOF
node_modules/
.env
config/local-*.json
*.log
EOF

# README を作成
cat > README.md <<EOF
# claude-code-pipe テスター (Node-RED)

本体リポジトリ（claude-code-pipe）との統合テストを行うための環境。

## セットアップ

1. 本体リポジトリを起動
   \`\`\`bash
   cd ../claude-code-pipe
   npm run pm2:start
   \`\`\`

2. このテスターを起動
   \`\`\`bash
   npm install
   npm start
   \`\`\`

## テストシナリオ

- Webhook 受信テスト
- セッションライフサイクルテスト
- キャンセルイベントテスト
EOF

# GitHub にプライベートリポジトリとして作成してプッシュ
# （手動で GitHub にリポジトリを作成後）
git remote add origin git@github.com:YOUR_ACCOUNT/claude-code-pipe-tester-node-red.git
```

### ステップ3: 本体リポジトリの README 更新

本体リポジトリに以下を追記：

```markdown
## 開発者向け情報

### 開発ツールについて

このリポジトリには以下の開発ツールが含まれています：

- **husky**: Git フック管理
- **secretlint**: 機密情報検出
- **gitleaks**: Git リーク検出

`npm install` を実行すると自動的にセットアップされますが、通常の利用には影響しません。

### 統合テスト環境

統合テストを実行する場合は、別途テスターリポジトリを使用します。
詳細は開発者にお問い合わせください。
```

### ステップ4: Windows PC での同時起動

```powershell
# Windows PC でも同じ構成

# ディレクトリ構成
C:\workspace\repos\
├── claude-code-pipe\
└── claude-code-pipe-tester-node-red\

# 起動（PowerShell で2つのタブを開く）
# タブ1
cd C:\workspace\repos\claude-code-pipe
npm run pm2:start

# タブ2
cd C:\workspace\repos\claude-code-pipe-tester-node-red
npm start
```

## 比較：従来のブランチ戦略 vs リポジトリ分離戦略

| 項目 | ブランチ戦略 (main/release) | リポジトリ分離戦略 |
|------|----------------------------|-------------------|
| **ブランチ管理** | 2つのブランチを同期 | main のみ |
| **テストコード** | 本体に混在 | 別リポジトリで完全分離 |
| **統合テスト** | 同一リポジトリ内 | 物理的に独立したプロセス |
| **利用者の体験** | release をクローン | main をクローン |
| **開発の自由度** | main で自由に開発 | 本体とテスターで独立開発 |
| **同期作業** | main → release の手動同期 | 不要 |
| **複雑さ** | 中 | 低（各リポジトリはシンプル） |

## 学び

### 1. リポジトリ分離の威力

- 物理的な分離により、責任範囲が明確になる
- テストコードと本体コードの混在を根本的に防げる
- Docker の repos/ ディレクトリ構成を活かせる

### 2. ブランチ戦略の見直し

- 複雑なブランチ戦略は必ずしも必要ない
- リポジトリ分離で main ブランチのみで運用可能
- シンプルな Git 運用が保守性を高める

### 3. 開発ツールの扱い

- husky/secretlint/gitleaks は本体に残しても問題なし
- npm install で自動適用されるが、利用者には影響しない
- 開発参加者には有益なツール
- 現状では機密情報混入リスクが低い

### 4. クロスプラットフォーム開発

- repos/ ディレクトリ構成は Docker 内外で共通
- Windows PC でも同じ構成で開発可能
- 開発環境の一貫性が生産性を高める

## 今後の拡張

### 追加のテスターリポジトリ

1. **claude-code-pipe-tester-basic**
   - 最小構成での動作確認
   - クイックスタート用

2. **claude-code-pipe-tester-slack**（将来的）
   - Slack 連携テスト
   - Webhook → Slack 通知のフロー

3. **claude-code-pipe-tester-api**（将来的）
   - REST API の包括的なテスト
   - セッション管理 API のテスト

### ドキュメント整備

- テスターリポジトリごとに独立した README
- 統合テストのベストプラクティス
- トラブルシューティングガイド

## 注意事項

⚠️ **テスターリポジトリはプライベート**
- GitHub プライベートリポジトリとして管理
- 開発者のみアクセス可能
- 機密情報（APIキーなど）は .env で管理

⚠️ **本体リポジトリはパブリック**
- すべてのファイルを公開
- 開発記録（docs/notes/）も公開
- 機密情報は絶対に含めない

⚠️ **repos/ ディレクトリの管理**
- 複数のリポジトリを同列に配置
- 各リポジトリは独立した Git 管理
- Docker ボリュームマウントの構成を維持

## 関連ドキュメント

- [release ブランチ戦略（従来案）](./2026-02-23-10-00-00-release-branch-strategy.md)
- [Webhook配信エラーハンドリングと追加セッションイベントの申し送り](../letters/2026-02-28-09-25-00-webhook-error-handling-and-session-events.md)

---

**最終更新**: 2026-02-28
**作成者**: Claude Code (AI)
