---
tags: [session-handoff, branch-strategy, automation, script, development-workflow]
---

# 申し送り（2026-03-13-15-30-00-branch-strategy-and-sync-script）

> **⚠️ 機密情報保護ルール**
>
> この申し送りに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない
> - コミット前に git diff で内容を確認
> - プッシュはせずコミットのみ(人間がレビュー後にプッシュ)

## 🔔 Compact前チェックリスト

### トークン使用量の目安
現在: 約64k/200k (32%) - まだ余裕あり

### 記録すべき内容を確認
- [x] 現在のセッションで決定した重要事項を記録したか？
- [x] 議論の流れと理由を記録したか？
- [x] 次のセッションで必要な「文脈」「空気感」を言語化したか？
- [x] 技術的な決定の「なぜ」を明記したか？
- [x] 注意事項に新しい学びを追加したか？

---

## 現在の状況（タスク別）

### ✅ 完了: ブランチ戦略の再転換と同期スクリプトの実装

**ステータス**: ✅ 完了（実装済み、次セッションで実行予定）

**完了内容**:
- ✅ ブランチ戦略の方針ノート作成（`docs/notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md`）
- ✅ 同期スクリプトの実装ノート作成（`docs/notes/2026-03-13-15-00-00-sync-to-main-script-implementation.md`）
- ✅ 同期スクリプトの実装（`scripts/sync-to-main.js`）
- ✅ package.json に `sync-to-main` npm script を追加
- ✅ コミット3件完了（ノート2件 + スクリプト実装1件）
- ✅ 申し送り作成

**実装内容**:

#### 問題の背景

**実際の利用で発生した問題**:
- コーディングエージェント（Claude Code等）が `docs/notes/` や `.husky/` を見て「開発中のプロジェクト」と誤解
- 利用者として使いたいだけなのに、開発者モードで動作してしまう
- 開発記録の更新や husky のセットアップを提案してくる

**従来の戦略（2026-02-28）**:
- main ブランチのみで運用
- すべてを公開（docs/notes, husky, secretlint 含む）
- テストコードは別リポジトリ（`claude-code-pipe-tester-node-red`）

**失敗の理由**:
- 「利用者は必要なファイルだけ使う」という楽観的想定
- コーディングエージェントは「存在するファイル」から判断してしまう

#### 新しいブランチ戦略

**develop** (開発用・フル装備):
- 開発記録（`docs/notes/`, `docs/letters/`, `docs/actions/`）
- 開発ツール（`.husky/`, `secretlint`, `gitleaks`）
- devDependencies 含む完全な package.json
- テストスクリプト（`test-*.js`, `test-*.sh`）
- **開発者のみが使用**

**main** (公開用・軽量):
- 本体コード（`src/`）
- 利用ドキュメント（`README.md`, `README-ja.md`, `DETAILS.md`, `DETAILS-ja.md`）
- 最小限の設定（`config.example.json`）
- dependencies のみの package.json
- **利用者がクローンするブランチ**

**デフォルトブランチ**: `main`（GitHub設定）

#### 同期スクリプトの実装

**ファイル**: `scripts/sync-to-main.js`

**主な機能**:
1. **安全性チェック**
   - develop ブランチで実行されているか確認
   - 未コミットの変更がないか確認

2. **ファイル同期**
   - 指定されたファイルのみを develop から main へコピー
   - main ブランチの既存ファイルをクリーンアップ

3. **package.json のクリーンアップ**
   - `devDependencies` を削除
   - 開発用スクリプト（`prepare`, `sync-to-main`, `security:*` など）を削除

4. **差分表示と次のステップ案内**
   - 変更内容を表示
   - コミット・タグ付け・プッシュの手順を案内

**同期対象ファイル**:
- `src/` - 本体コード
- `README.md`, `README-ja.md`, `DETAILS.md`, `DETAILS-ja.md`, `LICENSE`
- `config.example.json`, `.gitignore`
- `package.json`, `package-lock.json`（クリーンアップ後）

**使い方**:
```bash
# develop ブランチで
npm run sync-to-main

# 差分確認後、コミット
git add .
git commit -m "sync: vX.Y.Z from develop"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z

# develop に戻る
git checkout develop
```

#### コミット履歴

```
25690c9 feat: develop から main への同期スクリプトを追加
2560c0b docs: develop→main 同期スクリプトの実装記録を追加
2922c1f docs: develop/main 2ブランチ体制への戦略転換方針を追加
```

---

## 次にやること

### 最優先: develop ブランチの作成と git worktree セットアップ

**ステップ1: develop ブランチの作成**
```bash
# 現在の main を develop にリネーム
git branch -m main develop
git push origin develop

# GitHub でデフォルトブランチを一時的に develop に設定
# （GitHub の Settings → Branches → Default branch）

# リモートの main を削除
git push origin :main
```

**ステップ2: 新しい main ブランチを作成（軽量版）**
```bash
# develop から main を作成
git checkout develop
git checkout -b main

# 不要なファイルを削除
rm -rf docs/notes docs/letters docs/actions
rm -rf .husky .secretlintrc.json gitleaks.toml
rm -rf bin/ scripts/
rm -f test-*.js test-*.sh test-*.log

# package.json から devDependencies を削除
# （手動で編集、または jq コマンドで自動化）

# README.md を利用者向けに調整
# （開発者向けの記述を削除、利用方法に集中）

git add .
git commit -m "chore: create lightweight main branch for users"
git push origin main
```

**ステップ3: GitHub でデフォルトブランチを main に設定**
- GitHub の Settings → Branches → Default branch を `main` に変更

**ステップ4: git worktree でのセットアップ（推奨）**
```bash
# develop を別ディレクトリにチェックアウト
git worktree add ../claude-code-pipe-develop develop

# 以降は develop ディレクトリで作業
cd ../claude-code-pipe-develop

# main への同期が必要な時だけ
npm run sync-to-main  # これが元の main ディレクトリを操作
```

**ステップ5: スクリプトの動作確認（develop で）**
```bash
# develop ブランチで同期スクリプトを実行
npm run sync-to-main

# 差分を確認
git diff

# 問題なければコミット
git add .
git commit -m "sync: v1.0.0 from develop"
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

---

## 注意事項

### ブランチ戦略の重要な変更

- ⚠️ **2026-02-28 の戦略を覆す**: main のみ運用 → develop/main の2ブランチ体制
- ⚠️ **実害ベースの判断**: 理論ではなく、実際にコーディングエージェントが誤解する問題が発生
- ⚠️ **テストリポジトリ分離は継続**: `claude-code-pipe-tester-node-red` は引き続き別リポジトリ

### 同期スクリプトの設計判断

- ✅ **Node.js で実装**: クロスプラットフォーム、package.json 操作が簡単
- ✅ **明示的なファイルリスト**: 同期対象を明示的に管理、ミスを防ぐ
- ✅ **main のクリーンアップ**: develop でファイル削除した場合も main に反映
- ⚠️ **手動確認必須**: 自動プッシュはしない、差分確認後に手動コミット

### scripts/start-tmux.js を除外した判断

- ✅ **基本は npm run dev で十分**: フォアグラウンド起動が最もシンプル
- ✅ **VSCode のターミナルで起動**: 最も自然な使い方
- ✅ **tmux は開発者向けのオプション**: 必要な人は自分で tmux を使える

### git worktree の有効性

- ✅ **ブランチ切り替え不要**: develop と main が物理的に別ディレクトリ
- ✅ **同期スクリプトで main を直接操作**: develop で作業中でも main を更新可能
- ✅ **コーディングエージェントも混乱しない**: develop では開発者扱い、main では利用者扱い

### コミット運用ルール（継続）

- ⚠️ **不用意なコミットは絶対にしない**
- ⚠️ **コミット前に必ずユーザーに確認を取る**
- ⚠️ **公開リポジトリであることを常に意識する**
- ⚠️ **AI署名（Co-Authored-By）は不要**
- ⚠️ **プレフィックス**: `feat:` / `docs:` / `refactor:` + 日本語メッセージ

---

## 技術的な文脈

### 使用技術
- **Node.js**: CommonJS形式（JavaScript のまま維持）
- **Express**: v4.18.2
- **ws**: v8.14.2（WebSocket）
- **chokidar**: v3.5.3（ファイル監視）
- **EventEmitter**: Node.js標準モジュール

### 重要ファイル
- `src/index.js`: エントリポイント
- `src/api.js`: REST API ルート定義
- `src/watcher.js`: JSONL監視
- `src/parser.js`: JSONL解析
- `src/sender.js`: `claude -p` プロセス管理
- `src/subscribers.js`: Webhook配信
- `src/canceller.js`: キャンセル処理
- `scripts/sync-to-main.js`: develop → main 同期スクリプト（新規追加）
- `scripts/start-tmux.js`: tmux セッション管理
- `config.json`: 設定ファイル（.gitignore で除外済み）

### プロジェクト起動方法

#### 基本起動（推奨）
```bash
# フォアグラウンド起動
npm start
# または
npm run dev
```

#### tmux での起動（開発者向け）
```bash
# 起動
npm run dev:tmux:start

# ステータス確認
npm run dev:tmux:status

# ログ確認
npm run dev:tmux:logs

# リアルタイムログ
npm run dev:tmux:logs:realtime

# 停止
npm run dev:tmux:stop

# 再起動
npm run dev:tmux:restart
```

### ステータス確認方法
```bash
# サーバー稼働確認
curl http://localhost:3100/sessions

# プロジェクト一覧
curl http://localhost:3100/projects
```

### テスト手法

#### Node-RED テスター（推奨）
```bash
# テスターリポジトリで起動
cd /home/node/workspace/repos/claude-code-pipe-tester-node-red
npm start
# → http://localhost:1880/ccpipe/webhook で Webhook 受信
```

---

## セッション文脈サマリー

### 核心的な設計決定

#### 決定1: develop/main 2ブランチ体制への回帰

- **決定事項**: 2月28日の「main のみ」戦略を覆し、develop/main の2ブランチ体制へ
- **理由**:
  - コーディングエージェントが docs/notes や .husky を見て「開発中」と誤解する実害が発生
  - 「利用者は必要なファイルだけ使う」という想定は現実的でなかった
  - AI 時代では、リポジトリ構成が AI の挙動を左右する
- **影響範囲**: リポジトリ全体、開発フロー、GitHub設定

#### 決定2: Node.js による同期スクリプト

- **決定事項**: シェルスクリプトではなく Node.js で実装
- **理由**:
  - package.json の操作が簡単（JSON パース・整形）
  - クロスプラットフォーム（Windows/Linux/Mac）
  - 複雑なロジックも書きやすい
  - GitHub Actions は現段階では過剰
- **影響範囲**: `scripts/sync-to-main.js`, `package.json`

#### 決定3: scripts/start-tmux.js を main から除外

- **決定事項**: tmux 管理スクリプトは develop のみに残す
- **理由**:
  - 基本は `npm run dev` で十分（フォアグラウンド起動）
  - VSCode のターミナルで起動するのが最もシンプル
  - tmux は「知ってる人向けのオプション」
  - main ブランチをよりシンプルに保つ
- **影響範囲**: `scripts/sync-to-main.js` の同期対象リスト

#### 決定4: git worktree の推奨

- **決定事項**: develop を別ディレクトリにチェックアウトする方式を推奨
- **理由**:
  - ブランチ切り替え不要（develop と main が物理的に別）
  - 同期スクリプトで main を直接操作できる
  - コーディングエージェントが混乱しない
- **影響範囲**: 開発フロー

### 議論の流れ

1. **問題提起**:
   - 「実際に使っていてコーディングエージェントが開発中と誤解する」
   - docs/notes を中心に見て、main 軽量化の話があったはず

2. **過去の戦略確認**:
   - 2月23日: main/release の2ブランチ体制（当初案）
   - 2月28日: main のみで運用（現行）
   - 今回: develop/main の2ブランチ体制（新戦略）

3. **方針ノートの作成**:
   - 実害の記録
   - 新戦略の詳細
   - 戦略の変遷表

4. **同期スクリプトの設計**:
   - 自動化のアプローチ（シェル vs Node.js vs GitHub Actions）
   - Node.js を選択
   - 同期対象ファイルの精密な選定

5. **同期対象の検討**:
   - README-ja.md も含める
   - scripts/start-tmux.js は除外（基本は npm run dev で十分）

6. **実装とコミット**:
   - 方針ノート作成
   - 実装ノート作成
   - スクリプト実装
   - 申し送り作成

### 次のセッションに引き継ぐべき「空気感」

#### このプロジェクトの優先順位
1. **シンプルさ**: 利用者がすぐに使える、開発者がすぐ改造できる
2. **使いやすさ**: 最小限の設定で動作、段階的に学べる
3. **正確性**: 正しい情報を提供する
4. **実用性**: 実際の運用で役立つ情報を提供
5. **AI との共存**: コーディングエージェントが混乱しない構成

#### 避けるべきアンチパターン
- ❌ **ユーザー承認なしでコミット** - 公開リポジトリであることを常に意識
- ❌ **複雑な実装** - シンプルさを優先、必要になってから最適化
- ❌ **楽観的な想定** - 「利用者が賢く使う」は期待できない、構造で解決
- ❌ **AI の誤解を軽視** - コーディングエージェントの挙動は重要な判断材料

#### 重視している価値観
- **シンプルさ**: 標準ツールで解決、追加依存を避ける
- **個人用ツール**: 作者のワークフロー改善が主な焦点
- **オープンさ**: フォーク・拡張を推奨、コントリビューション歓迎
- **現実的**: 迅速な対応は保証できない、エンタープライズサポートなし
- **慎重さ**: 公開リポジトリへのコミットは必ずユーザー承認を得る
- **実害ベース**: 理論ではなく、実際に困った問題を優先

#### 現在の開発フェーズ
- **Phase 8 完了**: ブランチ戦略の再転換と同期スクリプトの実装
- **次のフェーズ**: develop ブランチの作成と運用開始

---

## 関連ドキュメント

### 今回作成したノート
- [ブランチ戦略再転換の方針](../notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)
- [同期スクリプトの実装記録](../notes/2026-03-13-15-00-00-sync-to-main-script-implementation.md)

### 前回のセッション
- [Send API とプロジェクトパス統合](./2026-03-02-14-50-00-send-api-project-path-integration.md)

### 関連する過去のノート
- [リポジトリ分離テスト戦略（2月28日の現行戦略）](../notes/2026-02-28-09-45-00-repository-separation-testing-strategy.md)
- [release ブランチ戦略（2月23日の当初案）](../notes/2026-02-23-10-00-00-release-branch-strategy.md)
- [pm2 から tmux への移行](../notes/2026-03-07-07-38-30-pm2-to-tmux-migration-and-readme-cleanup.md)

---

**作成日時**: 2026-03-13 15:30:00
**作成者**: Claude Code (AI)
