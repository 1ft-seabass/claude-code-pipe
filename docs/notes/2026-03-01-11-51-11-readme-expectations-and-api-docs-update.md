---
tags: [documentation, readme, api-reference, project-philosophy, user-expectations]
---

# README 期待値調整と API ドキュメント更新 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-01
**関連タスク**: ドキュメント整備（API Reference 更新 + README 期待値調整）

## 背景

前回のセッションで実装されたセッション一覧API拡張（メタデータ取得機能）のドキュメント化と、プロジェクトの性質を明確にするためのREADME更新が必要だった。

### 実装済みの機能（前回セッション）
- セッション一覧API (`GET /sessions`) のメタデータ取得機能
- シンプル版（デフォルト）: メッセージプレビューを文字列で返す
- 詳細版 (`?detail=true`): メッセージを完全なオブジェクトで返す
- インメモリキャッシュ（mtime比較で無効化）

### ドキュメント更新の必要性
1. **API Reference の更新**: セッション一覧APIの新しいレスポンス形式をDETAILS.mdに記載
2. **Quick Start の改善**: README.mdのStep 2にレスポンス例を追加（初めて使う人の理解を助ける）
3. **期待値調整**: プロジェクトの性質（個人用ミニマルツール）を明確にする

## 実装内容

### 1. DETAILS.md / DETAILS-ja.md の API Reference 更新

**更新箇所**: `GET /sessions` セクション

**変更前**:
```markdown
#### `GET /sessions`

List all available sessions.

Response:
{
  "sessions": ["session-id-1", "session-id-2"]
}
```

**変更後**:
```markdown
#### `GET /sessions`

List all available sessions with metadata.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
| detail | boolean | No | false | Include detailed message objects |

**Simple Version (default):**
- メタデータフィールドの完全な説明
- メッセージプレビューは文字列
- レスポンス例（全フィールド含む）

**Detailed Version:**
- メッセージを完全なオブジェクトで返す
- timestamp, usage を含む
- レスポンス例

**Metadata Fields:**
- 各フィールドの詳細な説明テーブル

**Notes:**
- キャッシュ機能の説明
- mtime比較による自動無効化
```

**主なポイント**:
1. クエリパラメータ `detail` の説明
2. シンプル版/詳細版の使い分け
3. メタデータフィールドの完全な仕様
4. キャッシュ機能についての注意事項

### 2. README.md / README-ja.md の Quick Start 更新

**更新箇所**: Step 2（Watch Mode）

**追加内容**:
```markdown
You'll get session metadata including message counts, timestamps, and previews:

{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "messageCount": 12,
      "totalTokens": 15000,
      "firstUserMessage": "What is the project structure?",
      "lastAssistantMessage": "You're welcome!"
    }
  ]
}
```

**理由**:
- 初めて使う人が「何が返ってくるか」をすぐに理解できる
- 主要なフィールドのみ表示（詳細はDETAILS.mdで）
- 導入のハードルを下げる

### 3. README.md / README-ja.md に期待値調整セクションを追加

#### 3-1. 「できること/できないこと/やらないこと」セクション

**配置**: Overview の直後、Features の前

**内容**:
- ✅ できること: 4項目（監視、送信、配信、軽量実装）
- ❌ できないこと: 3項目（UI提供なし、Claude Code管理なし、互換性保証なし）
- 🚫 やらないこと: 3項目（エンタープライズ機能、DB永続化、後方互換性）

**目的**:
- 最初に範囲を明確にして、期待値を適切に設定
- ポジティブなトーンで「意図的な選択」であることを伝える

#### 3-2. 「プロジェクトの方針」セクション

**配置**: ドキュメント末尾、License の前

**メンテナンス方針**:
```markdown
- **Primary focus**: Features that improve the author's daily workflow
- **Claude Code updates**: Breaking changes will be followed on a best-effort basis
- **Issues**: Feel free to open them, but timely responses are not guaranteed
- **Pull requests**: Contributions are appreciated! However, PRs that add
  significant complexity or diverge from the minimal philosophy may not be
  merged. Consider forking for major feature additions.
```

**なぜこのアプローチなのか**:
```markdown
This tool was born from a real need: "I want to interact with Claude Code
sessions programmatically, with minimal overhead."

Instead of building a full-featured platform, we keep it simple:
- Small codebase that's easy to understand and modify
- Just enough features to be useful
- If you need more features, you're encouraged to fork or extend it
```

**トーンの工夫**:
- 「意図的にミニマル」→ 制限ではなく設計思想
- 「感謝します」→ コントリビューション歓迎しつつ、現実的な期待値設定
- 「フォークや拡張を推奨」→ ポジティブに代替案を提示

## 実装場所

- `DETAILS.md`: 189-296行目（`GET /sessions` セクション）
- `DETAILS-ja.md`: 189-296行目（`GET /sessions` セクション）
- `README.md`:
  - 13-29行目（できること/できないこと/やらないこと）
  - 70-86行目（Quick Start Step 2 レスポンス例）
  - 226-246行目（プロジェクトの方針）
- `README-ja.md`:
  - 13-29行目（できること/できないこと/やらないこと）
  - 71-86行目（Quick Start Step 2 レスポンス例）
  - 226-246行目（プロジェクトの方針）

## 学び

### ドキュメント設計の原則

**階層的な情報提供**:
1. README: 最もシンプル、主要フィールドのみのレスポンス例
2. DETAILS: 完全なAPIリファレンス、全フィールド詳細

**期待値調整の重要性**:
- プロジェクトの性質を明確にすることで、不要な期待を避ける
- 「できないこと」「やらないこと」をはっきり伝える
- ポジティブなトーンで「意図的な選択」として伝える

**トーンの工夫**:
- 英語版: "Contributions are appreciated!" → 歓迎しつつ条件を明記
- 日本語版: 「感謝します！」→ より謙虚なトーン
- 「フォークを推奨」→ 代替案を積極的に提示

### ユーザー体験の向上

**Quick Start の改善**:
- レスポンス例があることで「何が返ってくるか」が明確
- 導入のハードルが下がる
- 詳細はDETAILS.mdに任せることでREADMEをシンプルに保つ

**プロジェクトの哲学を伝える**:
- 「意図的にミニマル」→ 設計思想として強調
- 「個人用ツールを公開」→ スタンスを明確化
- フォーク・拡張を推奨 → オープンな姿勢を示しつつ、現実的な期待値設定

## 関連ドキュメント

- [セッション一覧メタデータとキャッシュ実装](./2026-03-01-11-17-29-session-list-metadata-and-cache.md)
- [README/DETAILS ドキュメント分離](./2026-03-01-10-55-45-readme-details-documentation-split.md)
- [前回の申し送り](../letters/2026-03-01-11-19-24-documentation-and-session-list-enhancement.md)

---

**最終更新**: 2026-03-01
**作成者**: Claude Code (AI)
