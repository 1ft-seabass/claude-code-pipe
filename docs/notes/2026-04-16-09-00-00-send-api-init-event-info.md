---
tags: [api, verbose, init-event, model, observability]
---

# Send API の init イベント情報追加 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-04-16
**関連タスク**: v0.7.5 モデル観測性の向上

## 問題

`claude -p "message" --model "sonnet"` を指定しても実際に opus が使われるなど、モデル指定が不安定な挙動が報告されていた。しかし：

- AI に「今何のモデル？」と聞いても信頼性が低い（自分の状態を正確に答えられない）
- API レスポンスにモデル情報がなく、外部から観測する手段がなかった

## 調査

### --verbose は既に付いていた

`sender.js` では `startNewSession` / `sendToSession` ともに `--verbose` フラグが常時付与されていた（`claudeArgs` 構築時）。

### init イベントの中身

`claude -p "hi" --output-format stream-json --verbose` の最初の行（init イベント）に以下の情報が含まれることを確認：

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "UUID",
  "model": "claude-opus-4-6[1m]",
  "cwd": "/path/to/project",
  "tools": ["Bash", "Read", "Write", ...],
  "permissionMode": "default",
  "claude_code_version": "2.1.84",
  "apiKeySource": "none",
  "fast_mode_state": "off"
}
```

### モデル指定の挙動（重要な発見）

検証で以下を確認：

1. `--model sonnet` 指定 → init の `model` は `claude-sonnet-4-6`（正しい）
2. 同じセッションに `--resume` でモデル未指定で送信 → `claude-opus-4-6[1m]`（デフォルトに戻る）

**結論**: `--model` はターン単位の指定であり、セッションに紐づかない。毎回明示的に指定しないとデフォルトモデルに戻る。

### disallowedTools の反映確認

`--disallowedTools "Bash"` 指定時、init イベントの `tools` から `Bash` が除外されていることを確認（24→23ツール）。

## 解決策

### 1. sender.js: init イベントから情報を抽出

**実装場所**: `src/sender.js`

`startNewSession` は元々 init イベントから `session_id` を取得していたが、他のフィールドは捨てていた。以下を追加で抽出：

- `model`, `cwd`, `permissionMode`, `claude_code_version`, `apiKeySource`, `tools`

### 2. sendToSession の Promise 化

**実装場所**: `src/sender.js`

`sendToSession` は同期的に即 `{ pid, sessionId }` を返していたが、init イベントのモデル情報を取得するために Promise 化。init が来たら resolve するパターンに変更（`startNewSession` と同様）。

タイムアウト（60秒）も追加。元々 `startNewSession` にはあったが `sendToSession` にはなかった。

### 3. API レスポンスにフィールド追加

**実装場所**: `src/api.js`

`POST /sessions/new` と `POST /sessions/:id/send` のレスポンスに追加：

```json
{
  "sessionId": "...",
  "pid": 12345,
  "model": "claude-sonnet-4-6",
  "cwd": "/path/to/project",
  "permissionMode": "default",
  "claudeCodeVersion": "2.1.84",
  "apiKeySource": "none",
  "tools": ["Bash", "Read", "Write", "Grep"]
}
```

### 4. session-started webhook に model 追加

**実装場所**: `src/sender.js`, `src/subscribers.js`

- `session-started` イベント emit 時に `model` を含める
- `sendToSession` では emit タイミングを init 後に移動（正確な model を含めるため）
- `subscribers.js` の payload 構築に `model` フィールドを追加

## 学び

- `--verbose` + `--output-format stream-json` の init イベントはリッチな情報源
- `--model` はセッション単位ではなくターン単位。resume 時に再指定が必要
- 既存の stdout パース箇所で追加フィールドを拾うだけなので追加コストはほぼゼロ

## 関連ドキュメント

- [前回の申し送り](../letters/2026-04-10-00-51-00-v074-release-and-docs.md)

---

**最終更新**: 2026-04-16
**作成者**: Claude Code (AI)
