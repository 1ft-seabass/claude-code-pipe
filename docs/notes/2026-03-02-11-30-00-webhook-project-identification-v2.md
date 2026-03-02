---
tags: [webhook, project-identification, path-encoding, performance, cache]
---

# Webhook プロジェクト識別機能 v2 実装 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-02
**関連タスク**: Webhook プロジェクト識別機能（v2）

## 問題

v1 では `cwd` フィールドがサーバー（claude-code-pipe）の実行パスを返していたため、実際のプロジェクトパスが取得できなかった。

**v1 の問題点**:
```json
{
  "cwd": "/home/node/workspace/repos/claude-code-pipe",
  "dirName": "claude-code-pipe",
  "projectName": "My Application"
}
```

- `cwd` はサーバーのパスであり、セッションが実行されているプロジェクトのパスではない
- 複数プロジェクトで同じサーバーを使う場合、送信元プロジェクトを特定できない

## 試行錯誤

### アプローチA: JSONLファイルパスから単純変換

**試したこと**: JSONLファイルのディレクトリ名 `-home-node-workspace-repos-my-app` の `-` を全て `/` に変換

**結果**: 失敗

**理由**: 元のパス名に `-` が含まれる場合、誤った変換が発生
- 例: `-home-node-workspace-repos-claude-code-pipe`
  - 期待: `/home/node/workspace/repos/claude-code-pipe`
  - 実際: `/home/node/workspace/repos/claude/code/pipe` ❌

**実装コード**:
```javascript
function extractProjectPath(jsonlFilePath) {
  const dir = path.dirname(jsonlFilePath);
  const projectDirName = path.basename(dir);

  if (projectDirName.startsWith('-')) {
    return '/' + projectDirName.substring(1).replace(/-/g, '/');
  }

  return null;
}
```

---

### アプローチB: ビットマスクで全パターン探索

**試したこと**: `-` の全組み合わせを試して、実際に存在するパスを探す

**結果**: 成功するが高コスト

**理由**:
- `-` が n個あると 2^n パターンを試行
- `claude-code-pipe` なら 2^8 = 256パターン
- 各パターンで `fs.existsSync()` を実行するため非常に遅い

**実装コード**:
```javascript
function extractProjectPath(jsonlFilePath) {
  const fs = require('fs');
  const dir = path.dirname(jsonlFilePath);
  const projectDirName = path.basename(dir);
  const encoded = projectDirName.substring(1);

  // "-" の位置を取得
  const dashPositions = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '-') dashPositions.push(i);
  }

  // 全パターンを試す（2^n 通り）
  for (let mask = 0; mask < (1 << dashPositions.length); mask++) {
    let decoded = '/' + encoded;
    for (let i = dashPositions.length - 1; i >= 0; i--) {
      if (mask & (1 << i)) {
        const pos = dashPositions[i] + 1;
        decoded = decoded.substring(0, pos) + '/' + decoded.substring(pos + 1);
      }
    }
    if (fs.existsSync(decoded)) return decoded;
  }

  return '/' + encoded.replace(/-/g, '/');
}
```

---

### アプローチC: 一般的な深さ優先 + キャッシュ（成功）

**試したこと**:
1. 一般的なパス深さ（3-5階層）を優先的に試す
2. 一度解決したパスをキャッシュして再利用

**結果**: 成功

**コード例**:
```javascript
// プロジェクトパスのキャッシュ（パフォーマンス最適化）
const projectPathCache = new Map();

function extractProjectPath(jsonlFilePath) {
  const fs = require('fs');
  const dir = path.dirname(jsonlFilePath);
  const projectDirName = path.basename(dir);

  if (!projectDirName.startsWith('-')) return null;

  // キャッシュをチェック
  if (projectPathCache.has(projectDirName)) {
    return projectPathCache.get(projectDirName);
  }

  const encoded = projectDirName.substring(1);

  // 一般的な深さ（3-5）を優先的に試す
  const commonDepths = [3, 4, 5, 2, 6];

  for (const depth of commonDepths) {
    const parts = encoded.split('-');
    if (parts.length >= depth) {
      const candidatePath = '/' + parts.slice(0, depth).join('/') +
                           (parts.length > depth ? '-' + parts.slice(depth).join('-') : '');

      if (fs.existsSync(candidatePath)) {
        projectPathCache.set(projectDirName, candidatePath);
        return candidatePath;
      }
    }
  }

  // フォールバック: 全置換
  const fullPath = '/' + encoded.replace(/-/g, '/');
  projectPathCache.set(projectDirName, fullPath);
  return fullPath;
}
```

## 解決策

最終的な実装方法の詳細

**実装場所**:
- `src/watcher.js:82-83, 97-98` - イベントに `jsonlFilePath` を追加
- `src/subscribers.js:19-83` - `extractProjectPath()` 関数
- `src/subscribers.js:159-161` - プロジェクト情報の抽出
- `config.example.json:5` - `projectName` → `projectTitle` に変更

**主なポイント**:

1. **watcher.js でファイルパスを追加**:
   - パース後のイベントに `jsonlFilePath` プロパティを追加
   - subscribers.js で利用可能に

2. **extractProjectPath() 関数**:
   - 一般的なパス深さ（3-5階層）を優先的に試す
   - 実際に存在するパスを探す
   - 一度解決したパスはキャッシュに保存

3. **v2 フィールド設計**:
   - サーバー情報: `cwdPath`, `cwdName`
   - プロジェクト情報: `projectPath`, `projectName` (JSONL パスから抽出)
   - ユーザー定義: `projectTitle` (config.json から)

4. **パフォーマンス最適化**:
   - 初回のみ探索（最大5回の `fs.existsSync()`）
   - 2回目以降はキャッシュから O(1) で取得

**v2 ペイロード例**:
```json
{
  "type": "assistant-response-completed",
  "sessionId": "...",
  "timestamp": "...",
  "cwdPath": "/home/node/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "projectPath": "/home/node/workspace/repos/my-app",
  "projectName": "my-app",
  "projectTitle": "My Application",
  "source": "cli",
  "tools": [],
  "responseTime": 5234
}
```

## 学び

この経験から得た知見

- **学び1: Claude のパスエンコーディング**: Claude は単純に `/` を `-` に変換するため、元のパスに `-` が含まれると復元が曖昧
- **学び2: パフォーマンスとキャッシュ**: 高コストな処理でもキャッシュを使えば実質1回のみで許容範囲
- **学び3: 一般的なパターンを優先**: 深さ3-5のパスが大半なので、優先的に試すことで探索回数を削減
- **学び4: フォールバック戦略**: 見つからない場合は全置換でフォールバック（後方互換性）

## 今後の改善案

- 起動時に全プロジェクトをスキャンしてキャッシュを事前構築（必要になったら）
- より賢いパス推測アルゴリズム（機械学習ベース？）

## 関連ドキュメント

- [Webhook プロジェクト識別機能 v1](./2026-03-02-10-13-49-webhook-project-identification.md)
- [前回の申し送り](../letters/2026-03-02-10-57-16-webhook-project-identification-v1.md)

---

**最終更新**: 2026-03-02
**作成者**: Claude Code (AI)
