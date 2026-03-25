---
tags: [documentation, changelog, release, v0.6.1, maintenance]
---

# v0.6.1 CHANGELOG 整備 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-25
**関連タスク**: v0.6.1 リリースノートの整備

## 背景

### 問題意識
- v0.5.0 以前はがりがり実装していた時期で、詳細な変更履歴が残っていない
- 今後のリリースでペースを作りたい
- ユーザーから「README にリリースノート/変更履歴を追加してほしい」という要望

### 目的
- 標準的な CHANGELOG.md を導入し、今後のリリースノート運用の基盤を作る
- 過去のリリース（v0.4.0 以前、v0.5.0、v0.6.0）を簡潔にまとめる
- 今後は変更履歴を継続的に整備できる体制を整える

## 実装内容

### 1. CHANGELOG.md の作成

**フォーマット**: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) に準拠

**構成**:
```markdown
# Changelog

## [0.6.0] - 2026-03-25
### Breaking Changes
- パラメータ名変更: cwd → projectPath

### Added
- projectPath パラメータ追加
- callbackUrl 設定例追加

### Changed
- デフォルト値削除
- ドキュメント強化

## [0.5.0] - 2026-03-17
### Added
- バージョンAPI (`GET /version`)

## [0.4.0 以前] - 初期開発フェーズ
### コア機能
- Watch Mode, Send Mode, Cancel Mode, Webhook Distribution

### API
- (簡潔に箇条書き)

### 設定
- (簡潔に箇条書き)
```

**v0.4.0 以前の記載方針**:
- 詳細に書くのは難しいため、README / DETAILS-ja.md から基礎機能を抽出
- 簡潔に箇条書きで記載（ゆるい粒度）
- プラットフォームサポート情報は含めない（ゆるくしたい）

**参照元**:
- v0.6.0: `docs/notes/2026-03-25-04-00-00-v0-6-0-cwd-to-project-path-migration.md`
- v0.5.0: `docs/letters/2026-03-17-01-00-00-version-api-implementation.md`
- v0.4.0 以前: `DETAILS-ja.md` の API リファレンスと設定詳細

### 2. CHANGELOG-ja.md の作成

**理由**:
- このプロジェクトは日本語でも運用されている
- 日英両対応でドキュメントを整備

**内容**: CHANGELOG.md の日本語版

### 3. README.md への CHANGELOG リンク追加

**場所**: Documentation セクションの最初に配置

```markdown
## Documentation

- **[CHANGELOG.md](./CHANGELOG.md)** - Release notes and version history
- **[DETAILS.md](./DETAILS.md)** - Complete API reference...
- **[DETAILS-ja.md](./DETAILS-ja.md)** - 日本語版の詳細ドキュメント
```

### 4. package.json のバージョン更新

**変更**: `0.6.0` → `0.6.1`

**理由**:
- CHANGELOG 整備は新しいリリースとして記録
- ドキュメント追加は patch レベルのバージョンアップ

## 実装ファイル

| ファイル | 変更内容 |
|---------|---------|
| `CHANGELOG.md` | 新規作成（英語版） |
| `CHANGELOG-ja.md` | 新規作成（日本語版） |
| `README.md:247` | CHANGELOG.md へのリンク追加 |
| `package.json:3` | バージョン 0.6.1 に更新 |

## 動作確認

### 確認コマンド
```bash
# サーバー再起動
npm run dev:tmux:restart

# バージョン確認
curl http://localhost:3100/version
```

### 確認結果
```json
{
  "name": "claude-code-pipe",
  "version": "0.6.1",
  "description": "A pipe for Claude Code input/output using JSONL and Express + WebSocket"
}
```

✅ 正常に 0.6.1 として認識されている

## 学び

### 1. 初期開発フェーズの記録は「ゆるく」でOK
- 詳細に遡るのは困難
- README / DETAILS から抽出して簡潔にまとめる
- 重要なのは「今後のペースを作ること」

### 2. Keep a Changelog フォーマットの採用
- 標準的なフォーマットに従うことで、他プロジェクトとの一貫性を保つ
- セマンティックバージョニングとの相性が良い

### 3. 日英両対応の継続
- 日本語でも運用されているため、両方を整備
- 今後は CHANGELOG も日英で同期して更新

## 今後の運用

### リリース時のフロー
1. 開発内容を実装
2. CHANGELOG.md / CHANGELOG-ja.md の先頭に新バージョンセクションを追加
3. package.json のバージョンを更新
4. docs/notes に実装記録を作成（必要に応じて）
5. コミット・タグ作成

### CHANGELOG 記載内容
- **Breaking Changes**: 破壊的変更（必須）
- **Added**: 新機能
- **Changed**: 既存機能の変更
- **Deprecated**: 非推奨化
- **Removed**: 削除
- **Fixed**: バグ修正
- **Security**: セキュリティ修正

## 関連ドキュメント

- [v0.6.0 cwd→projectPath 移行記録](./2026-03-25-04-00-00-v0-6-0-cwd-to-project-path-migration.md)
- [v0.6.0 リリースと次のステップ（申し送り）](../letters/2026-03-25-04-30-00-v0-6-0-release-and-next-steps.md)

---

**最終更新**: 2026-03-25
**作成者**: Claude Code (AI)
