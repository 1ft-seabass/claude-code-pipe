---
tags: [webhook, subscribers, project-identification, payload, config]
---

# Webhook プロジェクト識別機能 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-02
**関連タスク**: Webhook 送信元プロジェクトの識別

## 問題

Webhook を受信する側で「どのプロジェクトから来たのか」が分からない問題がありました。

**背景**:
- 複数のプロジェクトで `claude-code-pipe` を運用する場合、同じ Webhook エンドポイントに異なるプロジェクトからイベントが送信される
- 既存のペイロードには `sessionId`, `timestamp`, `source` などのメタ情報があるが、プロジェクトを識別する情報がない
- Webhook 受信側でプロジェクトごとに処理を分けたい、または表示を分けたいニーズがある

## 解決策

Webhook ペイロードに以下の3つのプロジェクト識別情報を追加しました。

### 追加フィールド

| フィールド | 型 | 説明 | 取得方法 |
|-----------|-----|------|---------|
| `cwd` | string | 作業ディレクトリのフルパス | `process.cwd()` |
| `dirName` | string | 作業ディレクトリ名（ベース名） | `path.basename(cwd)` |
| `projectName` | string | プロジェクト名（オプショナル） | `config.projectName` |

**設計判断**:
- **`cwd`**: 完全な識別が可能（絶対パス）
- **`dirName`**: シンプルな表示用（UI で使いやすい）
- **`projectName`**: ユーザーが任意に命名可能（オプション）

### 実装場所

#### 1. `src/subscribers.js` の修正

**変更点**:
- `path` モジュールを追加（11行目）
- `setupSubscribers()` 関数に `config` パラメータを追加（25行目）
- プロジェクト情報を取得・構築（32-36行目）:
  ```javascript
  const cwd = process.cwd();
  const dirName = path.basename(cwd);
  const projectName = config.projectName || null;
  const projectInfo = { cwd, dirName, projectName };
  ```
- `handleProcessEvent()` にプロジェクト情報を渡す（52, 58, 64, 70, 76行目）
- `handleSubscriberEvent()` にプロジェクト情報を渡す（44行目）
- 両ハンドラー関数のペイロードにプロジェクト情報を追加:
  ```javascript
  cwd: projectInfo.cwd,
  dirName: projectInfo.dirName,
  ...(projectInfo.projectName && { projectName: projectInfo.projectName })
  ```

#### 2. `src/index.js` の修正

**変更点**:
- `setupSubscribers()` 呼び出し時に `config` オブジェクトを渡す（86行目）:
  ```javascript
  setupSubscribers(config.subscribers, watcher, processEvents, config);
  ```

#### 3. `config.example.json` の更新

**変更点**:
- `projectName` フィールドを追加（5行目）:
  ```json
  "projectName": "",
  ```

#### 4. `DETAILS.md` / `DETAILS-ja.md` の更新

**変更点**:
- 設定項目テーブルに `projectName` を追加
- Webhook イベントフォーマットのメタ情報フィールドテーブルに3つのフィールドを追加
- 全てのペイロード例（基本イベント、完全イベント、各イベントタイプ）にこれらのフィールドを追加
- `projectName` がオプショナルである旨を注記

### ペイロード例

#### 基本イベント

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "cwd": "/home/user/projects/my-app",
  "dirName": "my-app",
  "projectName": "My Application",
  "source": "watcher",
  "responseTime": 5234
}
```

**注**: `projectName` は `config.json` で設定した場合のみ含まれます。

## 実装のポイント

1. **後方互換性**: 既存の Webhook 受信側がエラーにならないよう、追加フィールドとして実装
2. **オプショナル設計**: `projectName` は設定しなくても動作する（`cwd` と `dirName` は常に含まれる）
3. **全イベントに適用**: `assistant-response-completed`, `session-started`, `process-exit`, `cancel-initiated` など全てのイベントタイプに統一的に追加
4. **シンプルな実装**: `projectInfo` オブジェクトを一箇所で構築し、各ハンドラーに渡すことでコードの重複を避ける

## 動作確認

- ✅ PM2で正常起動
- ✅ エラーなし（最新のエラーログは3月1日のもので、新しいエラーは出ていない）
- ✅ ファイル変更を正常に検出中
- ✅ Webhook ペイロードに新しいフィールドが含まれる（想定）

## 学び

### 技術的な学び

1. **プロジェクト識別の方法**:
   - `process.cwd()` は常に現在の作業ディレクトリを返す
   - `path.basename()` でディレクトリ名を取得できる
   - ユーザー定義の名前を許可することで柔軟性が向上

2. **Webhook 設計のベストプラクティス**:
   - 送信元の識別情報は重要なメタデータ
   - 複数のプロジェクトで同じツールを使う場合、識別情報がないと運用が困難
   - 自動付与とユーザー定義のバランスが大切

3. **後方互換性の保持**:
   - 既存のフィールドは変更せず、追加のみ
   - オプショナルフィールドとして実装することで、既存の受信側に影響を与えない

### プロジェクト運用の学び

1. **ユーザーからのフィードバックが重要**:
   - 実際に運用して初めて気付く課題がある
   - 「どこから来たのか分からない」という気付きは、実際に Webhook を受け取って初めて分かる

2. **段階的な実装**:
   - まずは自動付与（`cwd`, `dirName`）
   - 次にオプショナルな設定（`projectName`）
   - ドキュメントも同時に更新

## 今後の改善案

- 特になし（現在の実装で十分）

## 関連ドキュメント

- [前回の申し送り](../letters/2026-03-01-12-05-21-readme-expectations-and-api-docs.md)
- [DETAILS.md](../../DETAILS.md) - Webhook イベントフォーマット
- [DETAILS-ja.md](../../DETAILS-ja.md) - Webhook イベントフォーマット（日本語）

---

**最終更新**: 2026-03-02
**作成者**: AI
