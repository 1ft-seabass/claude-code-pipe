# ドキュメント目次

このディレクトリには、AI協働開発に必要なドキュメントが整理されています。

## 📂 ディレクトリ構成

アジャイル的な開発の初期段階で効果的な、**最小限の4つのフォルダ**で構成されています。

### [actions/](./actions/) - タスク自動化指示書
繰り返し実行するタスクの指示書を格納しています。

- `@actions/ファイル名.md` で呼び出すことで、AIが自動的にタスクを実行
- 提供アクション: git_commit_and_push, current_create_knowledge, simple_start_from_latest_letter

### [letters/](./letters/) - 申し送り
セッション間の引き継ぎ、作業状況の記録を時系列で格納しています。

- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`
- **テンプレート**: [TEMPLATE.md](./letters/TEMPLATE.md)

### [tasks/](./tasks/) - タスク管理
セッション跨ぎのタスクを管理しています。申し送りのサブツールです。

- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`
- **テンプレート**: [TEMPLATE.md](./tasks/TEMPLATE.md)
- **関係**: 申し送りが主役、タスクは補助

### [notes/](./notes/) - 開発ノート
技術的な試行錯誤、問題解決の記録を格納しています。

- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`
- **テンプレート**: [TEMPLATE.md](./notes/TEMPLATE.md)

## 📁 必要に応じて追加できるフォルダ

プロジェクトが成熟し、letters や notes がたまってきたら、以下のようなフォルダを追加できます：

- `ai-collaboration/` - AI協働開発ガイド
- `architecture/` - アーキテクチャ設計・ADR
- `development/` - 開発ガイド・ベストプラクティス
- `spec/` - 仕様書

**重要**: 使っていないフォルダがあると、AIも人間も混乱します。必要になったタイミングで追加してください。

## 🔍 ドキュメント検索について

**README の一覧は不要です。** AI は Grep/Glob で検索できるため、手動管理の一覧は更新漏れのリスクがあります。

### 検索例
```bash
# タグで検索
grep -r "tags:.*api" docs/notes/

# タイトルで検索
ls docs/notes/ | grep authentication

# 内容で検索
grep -r "失敗した理由" docs/notes/
```

詳細な検索方法は各ディレクトリの TEMPLATE.md を参照してください。

## 🤖 AIへの指示例

### セッション開始時（actionsを使用）
```
@actions/simple_start_from_latest_letter.md
```

### セッション開始時（手動）
```
「docs/README.md を読んで、最新の申し送りを確認してください」
```

### 申し送り作成（actionsを使用）
```
@actions/current_create_knowledge.md
```

### 申し送り作成（手動）
```
「今日の作業内容を docs/letters/ に申し送りとして記録してください」
```

### コミット&プッシュ（actionsを使用）
```
@actions/git_commit_and_push.md
```

## 📝 ドキュメント管理の原則

1. **検索駆動**: README の一覧管理は不要。Grep/Glob で検索する
2. **階層を浅く**: 3〜4層まで
3. **小分けの原則**: 1ファイル = 1知見（50-150行が目安）
4. **命名規則の統一**: `yyyy-mm-dd-hh-mm-ss-{title}.md` 形式

## 🔗 関連リンク

- [トップREADME](../README.md) - リポジトリ概要
- [SETUP.md](../SETUP.md) - セットアップ指示書
