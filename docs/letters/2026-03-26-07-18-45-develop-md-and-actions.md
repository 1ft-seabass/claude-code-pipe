---
tags: [session-handoff, documentation, develop-branch, actions, worktree, v0.6.1]
---

# 申し送り（2026-03-26-07-18-45-develop-md-and-actions）

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
現在: 約78k/200k (39%) - まだ余裕あり

### 記録すべき内容を確認
- [x] 現在のセッションで決定した重要事項を記録したか？
- [x] 議論の流れと理由を記録したか？
- [x] 次のセッションで必要な「文脈」「空気感」を言語化したか？
- [x] 技術的な決定の「なぜ」を明記したか？
- [x] 注意事項に新しい学びを追加したか？

---

## 現在の状況（タスク別）

### ✅ 完了: DEVELOP.md と sync-to-main アクション指示書の構築

**ステータス**: ✅ 実装完了（コミット済み、プッシュは未実施）

**完了内容**:
- ✅ DEVELOP.md の作成（develop ブランチのみに存在、main には同期されない）
- ✅ docs/actions/sync_to_main.md の作成（AI への指示書、理解チェック付き）
- ✅ scripts/sync-to-main.js の worktree 必須化
- ✅ scripts/commit-main.js の worktree 必須化
- ✅ 実装記録ノート作成（`docs/notes/2026-03-26-07-13-56-develop-md-and-sync-to-main-action.md`）
- ✅ コミット完了（develop ブランチ）
  - `c869fdc` docs: DEVELOP.md と sync-to-main アクション指示書を追加
  - `215797d` refactor: sync-to-main と commit-main を worktree 必須に変更
  - `d706ffc` docs: DEVELOP.md と sync-to-main アクション構築の記録を追加

**実装内容**:

#### 1. DEVELOP.md
- **場所**: `/DEVELOP.md`
- **存在範囲**: develop ブランチのみ（main には同期されない）
- **目的**: develop ブランチの開発者向け運用ガイド
- **構成**:
  - ブランチの役割（薄く説明）
  - 環境セットアップ（worktree 必須）
  - develop → main への反映フロー（メインフォーカス）
    - Step 0: develop での作業完了（CHANGELOG 更新含む）
    - Step 1: sync-to-main
    - Step 2: package.json 確認
    - Step 3: commit-main（**ユーザーが実行**）
    - Step 4: タグ作成とプッシュ（**ユーザーが実行**）
  - よくある質問
  - 関連ドキュメント

**重要な工夫**:
- Step 3 と Step 4 に「**ユーザーが実行**」を明記（AI の自動実行を防ぐ）
- README.md にリンクを追加しない（main でリンク切れを防ぐ）

#### 2. docs/actions/sync_to_main.md
- **場所**: `/docs/actions/sync_to_main.md`
- **目的**: AI への指示書（develop → main への同期作業）
- **構成**:
  - 📋 理解チェック（他の指示書のパターンに従う）
  - 前提条件（変更がすべてコミット・プッシュ済み）
  - 詳細手順（DEVELOP.md を参照）
  - 注意事項（commit-main と タグ作成・プッシュは AI が実行しない）

**ダブル命令**:
- DEVELOP.md と docs/actions/sync_to_main.md の両方で「ユーザーが実行」を明記
- AI が勝手に実行するのを強く抑制

#### 3. worktree 必須化
- **scripts/sync-to-main.js**: ブランチ切り替えモードを削除、worktree 必須に
- **scripts/commit-main.js**: worktree 必須に
- **メリット**:
  - ブランチ切り替えによる AI のコンテキスト混乱を防止
  - main ブランチの自動作成を防止
  - 安全性向上

**検証コマンド** (次のセッションの AI が実行):
```bash
# DEVELOP.md の存在確認（develop ブランチ）
ls -la DEVELOP.md

# docs/actions/sync_to_main.md の存在確認
ls -la docs/actions/sync_to_main.md

# worktree の状態確認
git worktree list

# sync-to-main の動作確認（エラーが出ることを確認）
# ※ worktree がない環境で実行すると、エラーメッセージが表示されるはず
```

**検証が失敗した場合の対処**:
- DEVELOP.md が存在しない → コミットログを確認
- sync-to-main.js が worktree 必須になっていない → git diff で変更内容を確認

---

## 次にやること

### 優先度1: docs/actions/sync_to_main.md の実戦テスト

次回のリリース（v0.6.2 以降）で、実際に `docs/actions/sync_to_main.md` を使って main への反映を試す。

**テスト手順**:
1. ユーザーが「`docs/actions/sync_to_main.md` を見て」と指示
2. AI が理解チェックを提示
3. AI が Step 1（sync-to-main）を実行
4. AI が Step 2（package.json 確認）を実行
5. AI が Step 3（commit-main）をユーザーに案内（**実行しない**）
6. AI が Step 4（タグ作成・プッシュ）をユーザーに案内（**実行しない**）

**確認ポイント**:
- AI が勝手に commit-main を実行しないか
- AI が勝手にタグ作成・プッシュを実行しないか
- 理解チェックが機能しているか

### 優先度2: Node-RED テスターでの動作確認（前回からの持ち越し）

callbackUrl とバージョンAPI の実装が完了しているため、実際の動作を確認:

```bash
# Node-RED テスターを起動
cd /home/node/workspace/repos/claude-code-pipe-tester-node-red
npm start

# claude-code-pipe でテストセッション作成
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Test version API and callbackUrl", "projectPath":"/home/node/workspace/repos/claude-code-pipe-develop"}'

# Node-RED で Webhook ペイロードを確認
# → http://localhost:1880/ccpipe/webhook で受信内容を確認
```

**確認ポイント**:
- ペイロードに `"callbackUrl": "http://localhost:3100"` が含まれているか
- projectPath が正しく送信されているか

### 優先度3: npx 駆動の相談（長期持ち越しタスク）

前々回のセッションからの持ち越しタスク:
- npx 駆動の要件を確認
- package.json の bin フィールド設定
- CLI エントリーポイントの作成

---

## 注意事項

### ⚠️ Git コミットルールの厳守

**今回守れたこと:**
- ✅ AI 署名なしでコミット
- ✅ プッシュせず、コミットのみで完了
- ✅ 従来のコミットスタイル（プレフィックス、言語）を踏襲
- ✅ `docs/actions/git_commit.md` を意識

**今後も守るべきルール:**
- ✅ **必ず `docs/actions/00_session_end.md` を確認すること**
- ✅ **コミット前にユーザーにスタイルを確認**
- ✅ **プッシュはせず、コミットのみで完了**

### ⚠️ DEVELOP.md の運用ルール

**重要**:
- DEVELOP.md は develop ブランチのみに存在
- main ブランチには同期されない（`filesToSync` に含まれていない）
- README.md にリンクを追加しない（main でリンク切れを防ぐ）

### ⚠️ docs/actions/sync_to_main.md の使い方

**明示的に呼び出す指示書**:
- ユーザーが「`docs/actions/sync_to_main.md` を見て」と言ったときに初めて読む
- 自動で気づくものではない

**AI が実行してはいけないこと**:
- commit-main の実行
- タグ作成とプッシュ

**AI が実行できること**:
- sync-to-main の実行
- main の package.json の確認
- ユーザーへの案内

### ⚠️ worktree 必須化の影響

**変更内容**:
- sync-to-main.js と commit-main.js は worktree 必須に
- ブランチ切り替えモードは削除済み

**エラーメッセージ**:
- worktree が見つからない場合、セットアップ方法を案内するエラーメッセージを表示
- `git worktree add ../claude-code-pipe main` を案内

---

## セッション文脈サマリー

### 核心的な決定事項

#### 決定1: DEVELOP.md の構成

**問題**:
- develop → main への反映フローが文書化されていない
- 新しい開発者が運用方法を把握しづらい

**解決**:
- DEVELOP.md を作成（develop ブランチのみに存在）
- メインフォーカスは develop → main への反映フロー
- 詳細は既存の docs/notes に任せる（薄く）

#### 決定2: worktree 必須化

**問題**:
- sync-to-main.js にブランチ切り替え機能があり、main ブランチが存在しなければ自動作成
- AI のコンテキストが混乱する可能性
- 意図しないタイミングで main が作られるリスク

**解決**:
- A案（worktree 必須）を採用
- ブランチ切り替えモードを削除
- worktree が見つからない場合はエラーで止める

#### 決定3: docs/actions/sync_to_main.md の作成

**問題**:
- AI が勝手に commit-main を実行してバグる
- ユーザーが実行すべきステップを AI が実行してしまう

**解決**:
- docs/actions/sync_to_main.md を作成
- 理解チェックのフェーズを追加
- commit-main と タグ作成・プッシュは AI が実行しないことを明記
- DEVELOP.md と docs/actions/sync_to_main.md の両方で「ユーザーが実行」を明記（ダブル命令）

### 議論の流れ

1. **セッション開始**:
   - ユーザー: 「DEVELOP.md で develop だけにいさせる感じでまとめたいです」
   - ユーザー: 「定常の develop から main への反映系を直下の DEVELOP.md でまとめたい」

2. **計画段階**:
   - AI: 既存文献を確認せずに新しいノートを作成してしまった
   - ユーザー: 「ちょっとまってね勝手に進めすぎかな。私に聞いてほしかったかな」
   - AI: 反省し、計画を立て直す

3. **worktree の必須性**:
   - AI: スクリプトを確認し、worktree がオプションであることを発見
   - ユーザー: 「ブランチ切り替えってやったことないんですが、main ブランチが存在しなければ作成も含めてめちゃ怖い仕様ですね」
   - AI: A案（worktree 必須）を提案
   - ユーザー: 「A がよさそうですね！」

4. **対話の改善**:
   - ユーザー: 「ああ、うれしい。ちゃんと「対話」になってきてる！」
   - AI: 一方的に実装するのではなく、ユーザーと対話しながら進める

5. **README.md のリンク問題**:
   - ユーザー: 「README.md って main に公開されるので DEVELOP.md は develop のみのものなのでリンク切れになりますね？」
   - AI: README.md から DEVELOP.md へのリンクを削除

6. **ユーザー実行の明示**:
   - ユーザー: 「npm run commit-main は人間が実行するのを明示で。これかってに AI がやりがちでバグるのでw」
   - AI: DEVELOP.md と docs/actions/sync_to_main.md の両方で明示

7. **理解チェックの追加**:
   - ユーザー: 「actions のほかの指示書を見てほしいのですが、初手で、理解しているかのチェックをこちらに知らせるフェーズがあると、伝達度が増します」
   - AI: 他の指示書を参考に、理解チェックを追加

8. **v0.6.1 に含める**:
   - ユーザー: 「まあ、6.0.1 として、このあたりも全部含めちゃえばいいですよね。やってるな感も出ますし」

### 次のセッションに引き継ぐべき「空気感」

#### このセッションで学んだ重要なルール

**✅ 守れたこと:**
- セッション終了フロー（`docs/actions/00_session_end.md`）を正しく実行
- コミットスタイルをユーザーに確認
- AI 署名なしでコミット
- プッシュせず、コミットのみで完了
- ユーザーと対話しながら進める

**反省点:**
- 最初に既存文献を確認せずに新しいノートを作成してしまった
- ユーザーに計画を確認せずに実装を進めてしまった
- → 今後は必ず計画を立てて、ユーザーに確認してから実装

**今後も継続すべきこと:**
- **必ずセッション終了フローに従う**
- **コミット前にユーザーに確認する**
- **プッシュはしない、コミットのみ**
- **ユーザーと対話しながら進める**
- **疑問点や選択肢をユーザーに提示し、承認を得る**

#### このプロジェクトの優先順位

1. **対話**: ユーザーとの対話を重視し、一方的に実装しない
2. **安全性**: AI が勝手にコミット・プッシュしないよう、ダブル命令で抑制
3. **シンプルさ**: 利用者がすぐに使える、開発者がすぐ改造できる
4. **使いやすさ**: 最小限の設定で動作、段階的に学べる
5. **一貫性**: Webhook と API で同じ概念は同じ名前を使う
6. **正確性**: 正しい情報を提供する
7. **実用性**: 実際の運用で役立つ
8. **ドキュメント**: 変更履歴を継続的に記録

#### 避けるべきアンチパターン

- ❌ **ユーザー承認なしでコミット・プッシュ** - 公開リポジトリであることを常に意識
- ❌ **指示書の無視** - `docs/actions/` の指示は必ず守る
- ❌ **AI 署名の勝手な追加** - Contributors に Claude が混入する
- ❌ **勝手に進めすぎる** - 計画を立てて、ユーザーに確認してから実装
- ❌ **既存文献を確認しない** - 必ず既存の docs/notes を確認してから作業
- ❌ **一方的な実装** - ユーザーと対話しながら進める

#### 重視している価値観

- **対話重視**: ユーザーとの対話で方針を決める
- **シンプルさ**: 標準ツールで解決、追加依存を避ける
- **個人用ツール**: 作者のワークフロー改善が主な焦点
- **オープンさ**: フォーク・拡張を推奨、コントリビューション歓迎
- **現実的**: 迅速な対応は保証できない、エンタープライズサポートなし
- **慎重さ**: 公開リポジトリへのコミットは必ずユーザー承認を得る
- **実害ベース**: 理論ではなく、実際に困った問題を優先
- **継続性**: 変更履歴を継続的に記録し、今後のペースを作る

#### 現在の開発フェーズ

- **Phase 13 完了**: バージョンAPI の実装（v0.5.0）
- **Phase 14 完了**: v0.6.0 リリース - cwd→projectPath 移行
- **Phase 15 完了**: v0.6.1 リリース - CHANGELOG 整備
- **Phase 16 完了**: DEVELOP.md と sync-to-main アクション構築（今回のセッション）
- **次のフェーズ**: docs/actions/sync_to_main.md の実戦テスト、または Node-RED テスターでの動作確認

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
- `src/subscribers.js`: Webhook配信
- `src/canceller.js`: キャンセル処理
- `src/git-info.js`: Git 情報取得ユーティリティ

**開発ツール**:
- `scripts/sync-to-main.js`: develop → main 同期スクリプト（**worktree 必須**）
- `scripts/commit-main.js`: main ブランチ用コミットウィザード（**worktree 必須**）
- `scripts/start-tmux.js`: tmux セッション管理

**設定**:
- `config.json`: 設定ファイル（.gitignore で除外済み）
- `config.example.json`: 設定ファイルの例
- `package.json`: パッケージ情報（**バージョン 0.6.1**）

**ドキュメント**:
- `CHANGELOG.md`: 英語版変更履歴
- `CHANGELOG-ja.md`: 日本語版変更履歴
- `README.md`: 利用者向け README
- `DEVELOP.md`: 開発者向けガイド（**develop ブランチのみ**）← 今回追加
- `docs/actions/sync_to_main.md`: sync-to-main アクション指示書← 今回追加

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

# バージョン確認
curl http://localhost:3100/version

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

## 関連ドキュメント

### 今回作成したドキュメント
- [DEVELOP.md](../../DEVELOP.md) - develop ブランチの運用ガイド← **今回作成**
- [docs/actions/sync_to_main.md](../actions/sync_to_main.md) - sync-to-main アクション指示書← **今回作成**
- [DEVELOP.md と sync-to-main アクション構築の記録](../notes/2026-03-26-07-13-56-develop-md-and-sync-to-main-action.md) ← **今回作成**

### 前回のセッション
- [v0.6.1 CHANGELOG 整備と次のステップ](./2026-03-25-09-30-00-v0-6-1-changelog-setup.md)

### 関連する過去のノート
- [ブランチ戦略の変遷](../notes/2026-03-13-14-30-00-branch-strategy-revision-develop-main.md)
- [sync-to-main と commit-main の併走フロー](../notes/2026-03-15-13-15-00-sync-to-main-commit-main-workflow.md)
- [sync-to-main の worktree 対応](../notes/2026-03-14-10-00-00-sync-to-main-worktree-support.md)
- [commit-main ウィザードの実装](../notes/2026-03-14-14-00-00-commit-main-wizard-implementation.md)
- [v0.6.0 cwd→projectPath 移行記録](../notes/2026-03-25-04-00-00-v0-6-0-cwd-to-project-path-migration.md)

---

**作成日時**: 2026-03-26 07:18:45
**作成者**: Claude Code (AI)
