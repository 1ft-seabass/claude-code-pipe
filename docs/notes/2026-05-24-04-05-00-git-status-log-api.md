---
tags: [api, git, status, log, observability]
---

# Git API（status/log）追加 - 開発記録

**作成日**: 2026-05-24
**関連タスク**: ビューワーから未プッシュ状況を観測できるよう、Git の status と log を API として提供

## 問題

ビューワー側から「リポジトリの状態」「未プッシュコミットの有無」を知る手段がなかった。Git コマンド経由なので低負荷だが、API として標準化したい。

懸念点として、変更ファイルが大量にあるリポジトリで `staged`/`unstaged` をフルリストで返すとレスポンスが膨らむ。

## 解決策

**実装場所**: `src/git-info.js`、`src/api.js`

### 1. `getGitStatus(projectPath)` を追加

`git status --porcelain` を解析して以下を返す：

```javascript
{
  branch: "develop",
  ahead: 0,
  behind: 0,
  staged: [...],
  unstaged: [...],
  untracked: [...],
  isClean: false
}
```

ahead/behind は `git rev-list --left-right --count HEAD...@{u}` で取得。

### 2. `getGitLog(projectPath, limit)` を追加

`git log` を `\x1f` 区切りでパース。未プッシュコミットの判定には `git rev-list HEAD @{u}..HEAD` を使い、各コミットに `unpushed` フラグを付ける。

### 3. エンドポイント

| エンドポイント | レスポンス |
|--------------|----------|
| `GET /git/status?projectPath=...` | 既定はカウントのみ（`stagedCount`, `unstagedCount`, `untrackedCount`） |
| `GET /git/status?projectPath=...&files=true` | ファイル一覧フル |
| `GET /git/log?projectPath=...&limit=20` | コミット一覧 + `unpushedCount` |

ファイル一覧を opt-in にすることで、大量変更リポジトリでもデフォルトのレスポンスサイズを小さく保つ。`limit` は最大100に制限。

## 副次的に発見したバグ: `execGitCommand` の `.trim()` 問題

実装中、`staged: ["rc/api.js"]` という奇妙な結果に遭遇。

### 原因

`execGitCommand` が結果全体を `.trim()` で処理していたため、複数行出力の **最初の行の先頭スペースまで消えていた**。

```
入力: " M src/api.js\n M src/git-info.js\n"
.trim() 後: "M src/api.js\n M src/git-info.js"
            ^^^ 先頭スペース消失
```

最初の行が `M src/api.js`（先頭スペースなし）になると：

- `xy = "M "` → `x = 'M'` で staged と誤判定
- `file = line.substring(3) = "rc/api.js"`（インデックスがずれて `s` が欠落）

### 修正

`.trim()` → `.trimEnd()` に変更（1文字）。

- 単一行出力（`git rev-parse --short HEAD` など）: 末尾改行のみ除去で挙動同じ
- 複数行出力（`git status --porcelain` など）: 各行の先頭スペースが保持される

既存の `getGitInfo` が呼ぶコマンド（`rev-parse`, `branch --show-current`, `worktree list`）はいずれも先頭スペースを持たないため、後方互換性に影響なし。

## 設計判断

### Q: なぜ `/git/summary` を別エンドポイントにしなかったか

`?files=true` オプションで切り替える方式（案A）を採用。理由：

- エンドポイント名（`/git/status`）は同じ意味なので分けると冗長
- 既定を軽量にしつつ詳細を opt-in にする RESTful なパターン
- ビューワー側の実装も URL 一本で済む

## 学び

- **`.trim()` は単一行用と割り切る**。複数行のシェル出力には `.trimEnd()` 一択
- **先頭スペースに意味がある出力形式**（git porcelain など）は要注意
- **デフォルトを軽く、詳細を opt-in にする** クエリパラメータ設計はビューワー連携で有用

## 今後の改善案

- `getGitStatus` で大量ファイル時の限界値（例: 100ファイル超え）でカウント強制返却
- `unpushedCount` のみ取得する超軽量エンドポイント（ダッシュボードのバッジ用）

## 関連ドキュメント

- [バッククォート・$ シェルエスケープ修正](./2026-05-24-04-00-00-backtick-shell-escape-fix.md)
- [画像アップロード API 追加](./2026-05-24-04-10-00-image-upload-api.md)
- [Webhook Git 情報実装](./2026-03-14-15-00-00-webhook-git-info-implementation.md)

---

**最終更新**: 2026-05-24
**作成者**: AI（Claude）
