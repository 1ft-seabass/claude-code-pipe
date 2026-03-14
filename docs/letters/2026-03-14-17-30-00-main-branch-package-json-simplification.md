---
tags: [session-handoff, main-branch, package-json, cleanup, branch-strategy]
---

# 申し送り（2026-03-14-17-30-00-main-branch-package-json-simplification）

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
現在: 約52k/200k (26%) - まだ十分余裕あり

### 記録すべき内容を確認
- [x] 現在のセッションで決定した重要事項を記録したか？
- [x] 議論の流れと理由を記録したか？
- [x] 次のセッションで必要な「文脈」「空気感」を言語化したか？
- [x] 技術的な決定の「なぜ」を明記したか？
- [x] 注意事項に新しい学びを追加したか？

---

## 現在の状況（タスク別）

### ✅ 完了: main ブランチの package.json と README の簡素化

**ステータス**: ✅ 完了（コミット済み、プッシュ未実施）

**完了内容**:
- ✅ 問題発見: main ブランチに scripts フォルダがないため、開発用スクリプトが実行できない
- ✅ `sync-to-main.js` の `cleanPackageJson()` 関数を修正
  - `commit-main` を削除リストに追加
  - `security:*` で始まるスクリプトを削除
  - `dev:tmux:*` で始まるスクリプトを削除
- ✅ `README.md` から tmux の記述を削除
- ✅ `README-ja.md` から tmux の記述を削除
- ✅ ノート作成（`docs/notes/2026-03-14-17-00-00-main-branch-simplification-package-scripts-cleanup.md`）
- ✅ コミット2件完了（develop ブランチ）
  - `bd003c6` docs: main ブランチ簡素化の実装記録を追加
  - `b43b9f8` refactor: main ブランチの package.json と README を簡素化

**修正の詳細**:

**scripts/sync-to-main.js (cleanPackageJson 関数)**:
```javascript
// 削除するスクリプト
const scriptsToRemove = [
  'prepare',           // husky
  'sync-to-main',      // このスクリプト自体
  'commit-main',       // 開発用コミットウィザード (NEW!)
];

// パターンで削除
if (
  key.includes('husky') ||
  key.includes('secretlint') ||
  key.includes('gitleaks') ||
  key.startsWith('security:') ||      // NEW!
  key.startsWith('dev:tmux:')         // NEW!
) {
  // 削除
}
```

**main ブランチに残るスクリプト**:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js"
  }
}
```

**README/README-ja から削除した行**:
- ~~`- **Process Management**: Persistent session management with tmux`~~
- ~~`- **プロセス管理**: tmux による永続化セッション管理`~~

---

## 次にやること

### 優先度1: sync-to-main で動作確認（推奨）

main ブランチに今回の変更を反映して、実際に package.json がシンプルになるか確認:

```bash
# develop → main に同期
npm run sync-to-main

# main ブランチの package.json を確認
cat /home/node/workspace/repos/claude-code-pipe/package.json

# commit-main でコミット
npm run commit-main
```

### 優先度2: DEVELOP.md の作成（将来的）

開発者向けの情報を別ドキュメントにまとめる:
- tmux での起動・停止方法
- `sync-to-main` / `commit-main` の使い方
- worktree 環境のセットアップ
- 開発用スクリプトの説明
- コミット規約
- テスト方法
- ノート・申し送りの運用ルール

**重要**: DEVELOP.md は develop ブランチのみに存在し、main には同期しない

---

## 注意事項

### 運用ルールの遵守（今回守れた）

- ✅ **不用意なコミットはしない**: 計画を提案して承認を得た
- ✅ **プッシュはしない**: develop はユーザーがプッシュ
- ✅ **コミットスタイル確認**: 従来スタイルを踏襲（日本語、プレフィックス、AI署名なし）
- ✅ **指示書の遵守**: `docs/actions/00_session_end.md` に従って作業

### ブランチ役割の明確化

**main ブランチの目的**:
- ✅ 利用者向けのシンプルなブランチ
- ✅ `npm start` または `npm run dev` だけで起動できる
- ✅ 開発ツールは含まない
- ✅ README は利用者向けの情報のみ

**develop ブランチの目的**:
- ✅ 開発者向けの完全な環境
- ✅ 開発ツール完備（tmux、sync-to-main、commit-main など）
- ✅ 開発記録（docs/notes、docs/letters）を含む
- ✅ テストツール、セキュリティスキャンツールを含む

### sync-to-main の動作

`npm run sync-to-main` を実行すると:
1. develop ブランチから main ブランチへファイルを同期
2. package.json を自動的にクリーンアップ（開発用スクリプトを削除）
3. `git add` まで自動実行
4. 次のステップとして `npm run commit-main` を案内

---

## 技術的な文脈

### 使用技術
- **Node.js**: CommonJS形式（JavaScript のまま維持）
- **Express**: v4.18.2
- **ws**: v8.14.2（WebSocket）
- **chokidar**: v3.5.3（ファイル監視）
- **EventEmitter**: Node.js標準モジュール

### 重要ファイル

**コア機能**:
- `src/index.js`: エントリポイント
- `src/api.js`: REST API ルート定義
- `src/watcher.js`: JSONL監視
- `src/parser.js`: JSONL解析
- `src/sender.js`: `claude -p` プロセス管理
- `src/subscribers.js`: Webhook配信（Git 情報含む）
- `src/canceller.js`: キャンセル処理
- `src/git-info.js`: Git 情報取得ユーティリティ

**開発ツール**:
- `scripts/sync-to-main.js`: develop → main 同期スクリプト（**今回修正**）
- `scripts/commit-main.js`: main ブランチ用コミットウィザード
- `scripts/start-tmux.js`: tmux セッション管理

**設定**:
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

#### 決定1: main ブランチの package.json を利用者向けにシンプル化

- **決定事項**: 開発用スクリプト（tmux、security、commit-main）を main ブランチから除外
- **理由**:
  - main ブランチには scripts フォルダがない（同期対象外）
  - 実行できないスクリプトが残っていると混乱を招く
  - 利用者は `npm start` だけで使えるべき
- **影響範囲**: scripts/sync-to-main.js の cleanPackageJson() 関数

#### 決定2: README から tmux の記述を削除

- **決定事項**: README/README-ja から "Process Management: tmux" の行を削除
- **理由**:
  - main ブランチには tmux 起動スクリプトがない
  - tmux は開発者が独自に設定できる（利用者向け機能ではない）
  - ドキュメントとコードの一貫性を保つ
- **影響範囲**: README.md, README-ja.md

#### 決定3: DEVELOP.md の将来的な作成（今回は見送り）

- **決定事項**: 開発者向け情報を DEVELOP.md にまとめる構想を記録
- **理由**:
  - README はシンプルに保つ
  - 開発者向け情報（tmux、sync-to-main など）は別ドキュメントに集約
  - develop ブランチのみに存在（main には同期しない）
- **影響範囲**: なし（将来的な構想のみ）

### 議論の流れ

1. **問題発見**:
   - ユーザー: 「develop から main への精査をしているが、main の package.json に scripts フォルダを参照するコマンドが残っている」
   - 私: 「main ブランチには scripts フォルダがないため、実行できないスクリプトが残っている」

2. **誤解の修正**:
   - 私: 「main ブランチの package.json を直接編集すべきか？」（誤解）
   - ユーザー: 「develop の package.json はそのまま。sync-to-main で main に持っていくときに編集する」（正しい理解）

3. **修正方針の決定**:
   - `cleanPackageJson()` 関数を強化
   - README からも tmux の記述を削除
   - 将来的に DEVELOP.md を作成する構想を記録

4. **npx 駆動の見送り**:
   - ユーザー: 「npx 駆動を相談したかったが、npm run dev でも問題ない」
   - 私: 「現状で十分、必要になったときに追加すれば良い」

### 次のセッションに引き継ぐべき「空気感」

#### このセッションで守れたルール

- ✅ **不用意なコミットはしない**: ユーザーに計画を提案して承認を得た
- ✅ **プッシュ禁止**: develop はユーザーがプッシュ
- ✅ **コミットスタイル確認**: 従来スタイルを踏襲
- ✅ **指示書の遵守**: `docs/actions/00_session_end.md` の指示に従って作業

#### このプロジェクトの優先順位

1. **シンプルさ**: 利用者がすぐに使える、開発者がすぐ改造できる
2. **使いやすさ**: 最小限の設定で動作、段階的に学べる
3. **安全性**: 事故を防ぐ仕組み（確認フロー、プッシュ禁止など）
4. **正確性**: 正しい情報を提供する
5. **実用性**: 実際の運用で役立つ情報を提供
6. **AI との共存**: コーディングエージェントが混乱しない構成

#### 避けるべきアンチパターン

- ❌ **ユーザー承認なしでコミット** - 公開リポジトリであることを常に意識
- ❌ **ユーザー承認なしでプッシュ** - 特に main ブランチは慎重に
- ❌ **指示書の無視** - `docs/actions/` の指示は必ず守る
- ❌ **複雑な実装** - シンプルさを優先、必要になってから最適化
- ❌ **ドキュメントとコードの不整合** - 使えない機能は記載しない
- ❌ **ブランチの役割混同** - main = 利用者向け、develop = 開発者向け

#### 重視している価値観

- **シンプルさ**: 標準ツールで解決、追加依存を避ける
- **個人用ツール**: 作者のワークフロー改善が主な焦点
- **オープンさ**: フォーク・拡張を推奨、コントリビューション歓迎
- **現実的**: 迅速な対応は保証できない、エンタープライズサポートなし
- **慎重さ**: 公開リポジトリへのコミットは必ずユーザー承認を得る
- **実害ベース**: 理論ではなく、実際に困った問題を優先
- **対話重視**: ユーザーとの対話で方針を決める
- **一貫性**: ドキュメントとコードは一致すべき

#### 現在の開発フェーズ

- **Phase 12 完了**: main ブランチの package.json と README のシンプル化
- **次のフェーズ**: sync-to-main で動作確認、または新しい機能追加

---

## 関連ドキュメント

### 今回作成したノート
- [main ブランチ簡素化の実装記録](../notes/2026-03-14-17-00-00-main-branch-simplification-package-scripts-cleanup.md)

### 前回のセッション
- [Webhook Git 情報と commit-main テスト運用の申し送り](./2026-03-14-16-00-00-webhook-git-info-and-commit-wizard-test.md)

### 関連する過去のノート
- [sync-to-main worktree 対応の実装記録](../notes/2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装記録](../notes/2026-03-14-14-00-00-commit-main-wizard-implementation.md)
- [Webhook Git 情報追加の実装記録](../notes/2026-03-14-15-00-00-webhook-git-info-implementation.md)

---

**作成日時**: 2026-03-14 17:30:00
**作成者**: Claude Code (AI)
