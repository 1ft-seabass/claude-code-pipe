---
tags: [docs, structure, ai-collaboration, setup]
---

# docs-structure パターン導入 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: AI協働開発用ドキュメント構造の導入

## 問題

プロジェクト開始時にAI協働開発に適したドキュメント管理構造が必要だった。以下の課題を解決する必要があった：

- セッション間での引き継ぎ（申し送り）の仕組み
- 技術的な試行錯誤の記録方法
- タスク管理の方法
- 繰り返し実行するタスクの自動化

## 解決策

### 導入したパターン

`1ft-seabass/my-ai-collaboration-patterns` リポジトリの `patterns/docs-structure` パターンを導入。

**取得コマンド**:
```bash
npx degit 1ft-seabass/my-ai-collaboration-patterns/patterns/docs-structure/templates ./docs
```

### ディレクトリ構成

最小限の4つのフォルダで構成：

```
docs/
├── README.md          # ドキュメント目次・ガイド
├── actions/           # タスク自動化指示書
├── letters/           # 申し送り（セッション間の引き継ぎ）
├── notes/             # 開発ノート（技術的な試行錯誤）
└── tasks/             # タスク管理
```

### 各ディレクトリの役割

#### actions/ - タスク自動化指示書
- 繰り返し実行するタスクの指示書を格納
- `@actions/ファイル名.md` で呼び出し可能（システム依存）
- 提供される主なアクション:
  - `git_commit.md` - gitコミット
  - `git_push.md` - gitプッシュ
  - `doc_letter.md` - 申し送り作成
  - `doc_note.md` - ノート作成
  - `dev_security.md` - セキュリティチェック
  - `help.md` - ヘルプ表示

#### letters/ - 申し送り
- セッション間の引き継ぎ、作業状況の記録を時系列で格納
- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`
- **テンプレート**: `TEMPLATE.md` を参照

#### notes/ - 開発ノート
- 技術的な試行錯誤、問題解決の記録を格納
- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`
- **テンプレート**: `TEMPLATE.md` を参照
- **FrontMatter**: tags を3-5個推奨

#### tasks/ - タスク管理
- セッション跨ぎのタスクを管理
- 申し送りの補助ツール（申し送りが主役）
- **命名規則**: `yyyy-mm-dd-hh-mm-ss-{title}.md`

## 実装場所

`docs/` ディレクトリ全体

## 主なポイント

1. **検索駆動**: README の一覧管理は不要。Grep/Glob で検索する
2. **階層を浅く**: 3〜4層まで
3. **小分けの原則**: 1ファイル = 1知見（50-150行が目安）
4. **命名規則の統一**: `yyyy-mm-dd-hh-mm-ss-{title}.md` 形式

### 検索例

```bash
# タグで検索
grep -r "tags:.*api" docs/notes/

# タイトルで検索
ls docs/notes/ | grep authentication

# 内容で検索
grep -r "失敗した理由" docs/notes/
```

## 学び

- **初期段階ではシンプルに**: 4つのフォルダで十分。プロジェクトが成熟してから追加する
- **AI は検索できる**: 手動で一覧を管理する必要はない。Grep/Glob で検索可能
- **テンプレートは後でカスタマイズ**: 初期段階では一般化されたテンプレートのまま使用し、要件が明確になった段階でカスタマイズ

## 今後の改善案

プロジェクトが成熟し、letters や notes がたまってきたら、以下のようなフォルダを追加可能：

- `ai-collaboration/` - AI協働開発ガイド
- `architecture/` - アーキテクチャ設計・ADR
- `development/` - 開発ガイド・ベストプラクティス
- `spec/` - 仕様書

**重要**: 使っていないフォルダがあると、AIも人間も混乱する。必要になったタイミングで追加すること。

## 関連ドキュメント

- [docs/README.md](../README.md) - ドキュメント目次
- [docs/notes/TEMPLATE.md](./TEMPLATE.md) - ノートのテンプレート
- [docs/letters/TEMPLATE.md](../letters/TEMPLATE.md) - 申し送りのテンプレート
- [docs/tasks/TEMPLATE.md](../tasks/TEMPLATE.md) - タスクのテンプレート

## 参考リンク

- [1ft-seabass/my-ai-collaboration-patterns](https://github.com/1ft-seabass/my-ai-collaboration-patterns)
- [patterns/docs-structure](https://github.com/1ft-seabass/my-ai-collaboration-patterns/tree/main/patterns/docs-structure)

---

**最終更新**: 2026-02-23
**作成者**: AI (Claude Sonnet 4.5)
