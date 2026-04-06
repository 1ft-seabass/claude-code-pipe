---
tags: [api, cli-options, process-management, model, disallowedTools]
---

# v0.7.2 CLI オプション追加とプロセス管理 API - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-06
**関連タスク**: v0.7.2 機能追加（CLI オプション透過、プロセス管理）

## 背景

ユーザーから以下の機能要望があった:
1. `allowedTools` / `disallowedTools` / `model` オプションの API 対応
2. Claude Code バージョン取得 API
3. 管理中プロセス一覧 API（ps 的なもの）
4. 全プロセス強制終了 API（緊急用）
5. 個別プロセス強制終了 API

Claude Code CLI ドキュメントを参照し、CLI フラグを透過的に使えるようにする方針で実装。

## 実装内容

### 1. CLI オプションの追加（sender.js）

**実装場所**: `src/sender.js:68-78`, `src/sender.js:259-273`

```javascript
// startNewSession / sendToSession 両方に追加
if (allowedTools && allowedTools.length > 0) {
  claudeArgs.push('--allowedTools', allowedTools.join(' '));
}

if (disallowedTools && disallowedTools.length > 0) {
  claudeArgs.push('--disallowedTools', disallowedTools.join(' '));
}

if (model) {
  claudeArgs.push('--model', model);
}
```

**オプション**:
- `allowedTools`: 許可ツールのリスト（配列）
- `disallowedTools`: 禁止ツールのリスト（配列）
- `model`: 使用モデル（"sonnet", "opus", "claude-sonnet-4-6" など）

### 2. API エンドポイントの追加（api.js）

**POST /sessions/new, POST /sessions/:id/send**:
- `allowedTools`, `disallowedTools`, `model` パラメータを追加
- `dangerouslySkipPermissions` と併用可能

**GET /claude-version**:
- `claude -v` を実行して Claude Code CLI バージョンを取得
- レスポンス: `{ version: "2.0.45", raw: "2.0.45 (Claude Code)" }`

**GET /processes**:
- 管理中の Claude Code プロセス一覧を返す
- レスポンス: `{ processes: [{ sessionId, pid, startedAt, alive }] }`

**DELETE /processes/:sessionId**:
- 指定セッションのプロセスを強制終了
- レスポンス: `{ message, sessionId, pid, killed }`

**DELETE /processes**:
- 全プロセスを強制終了（緊急用）
- レスポンス: `{ message, killed, sessions }`

### 3. プロセス管理関数の追加（sender.js）

**killProcess(sessionId)**:
- 個別プロセスを SIGTERM で終了
- 存在しない場合は null を返す

**killAllProcesses()**:
- 全プロセスを SIGTERM で終了
- managedProcesses マップをクリア

## API パラメータ名

camelCase を採用（JavaScript/Node.js との一貫性）:
- `projectPath`
- `allowedTools`
- `disallowedTools`
- `model`
- `dangerouslySkipPermissions`

## テスト結果

```bash
# Claude バージョン取得
curl -s http://localhost:3100/claude-version
# {"version":"2.0.45","raw":"2.0.45 (Claude Code)"}

# プロセス一覧（空）
curl -s http://localhost:3100/processes
# {"processes":[]}

# 新規セッション作成（オプション併用）
curl -s -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "テスト",
    "projectPath": "/path/to/project",
    "model": "sonnet",
    "disallowedTools": ["Edit", "Write"],
    "dangerouslySkipPermissions": true
  }'
# {"message":"Session started","sessionId":"...","pid":...}

# 個別プロセス削除
curl -s -X DELETE http://localhost:3100/processes/{sessionId}
# {"message":"Process terminated","sessionId":"...","pid":...,"killed":true}

# 全プロセス削除
curl -s -X DELETE http://localhost:3100/processes
# {"message":"All processes terminated","killed":1,"sessions":["..."]}
```

## 学び

### CLI フラグ名の確認の重要性

- 当初 `--allowed-tools` と実装していたが、公式ドキュメントでは `--allowedTools`
- CLI ドキュメントを事前に確認することでミスを防げた

### オプション併用の設計

- `dangerouslySkipPermissions` と `disallowedTools` / `model` は独立して機能
- 全オプションは併用可能な設計に

## 残タスク

- [ ] DETAIL.md への API ドキュメント反映
- [ ] package.json のバージョンを 0.7.2 に更新
- [ ] CHANGELOG の更新

## 関連ドキュメント

- [v0.7.1 バグ修正](./2026-04-05-00-00-00-api-session-call-signature-fix.md)
- [前回の申し送り](../letters/2026-04-05-00-30-00-v0-7-1-api-session-bugfix.md)

---

**最終更新**: 2026-04-06
**作成者**: Claude Code (AI)
