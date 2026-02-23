---
tags: [cli, buffering, script-command, pty, debugging]
---

# scriptコマンドによるCLIバッファリング問題の解決 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: sender.jsの改修（UUID形式のセッションID取得）

## 問題

sender.jsで `claude -p` コマンドを `spawn()` で実行したとき、stdoutから出力が取得できない問題が発生していました。

### 症状
```javascript
const proc = spawn('claude', ['-p', 'Hello', '--verbose'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

proc.stdout.on('data', (data) => {
  console.log('Got data:', data); // ← 何も出力されない！
});
```

- ターミナルで直接実行すると正常に出力される
- Node.jsの `spawn` + `pipe` モードだと出力が取得できない

## 試行錯誤

### アプローチA: stdbuf コマンドでバッファリング無効化

**試したこと**: `stdbuf -o0` でバッファリングを無効化

```javascript
const proc = spawn('stdbuf', ['-o0', 'claude', '-p', 'Hello', '--verbose'], {
  stdio: ['pipe', 'pipe', 'pipe']
});
```

**結果**: 失敗

**理由**: Claude CLIの内部バッファリングには効果がなかった

---

### アプローチB: 環境変数で制御

**試したこと**: 環境変数でバッファリングを制御

```javascript
spawn('claude', args, {
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    FORCE_COLOR: '0',
  }
});
```

**結果**: 失敗

**理由**: Claude CLIには効かなかった（言語やフレームワークによって有効な環境変数が異なる）

---

### アプローチC: stdio: 'inherit' で確認

**試したこと**: stdioを `inherit` にしてターミナルに直接出力

```javascript
const proc = spawn('claude', args, {
  stdio: ['ignore', 'inherit', 'inherit']
});
```

**結果**: 成功（出力が確認できた）

**発見**: TTY（ターミナル）があれば出力される → バッファリング問題であることが確認できた

---

### アプローチD: script コマンドでPTY提供（成功）

**試したこと**: `script` コマンドで擬似端末（PTY）を提供

```javascript
const claudeCommand = `claude -p "Hello" --output-format stream-json --verbose`;
const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

proc.stdout.on('data', (data) => {
  console.log('Got data:', data.toString()); // ← 正常に出力される！
});
```

**結果**: 成功

**仕組み**:
```
┌──────────────┐
│  Node.js     │
│  (sender.js) │
└──────┬───────┘
       │ spawn
       ▼
┌──────────────┐
│   script     │ ← PTY (擬似端末) を作成
└──────┬───────┘
       │ fork & exec
       ▼
┌──────────────┐
│  claude CLI  │ ← isTTY() = true と認識
└──────────────┘   行バッファリングで即座に出力
```

## 解決策

`script` コマンドを使ってPTY（擬似端末）を提供することで、Claude CLIがターミナルと認識し、即座に出力するようになりました。

**実装場所**: `src/sender.js:32-43`, `src/sender.js:143-154`

**主なポイント**:
1. `script -q -c "コマンド" /dev/null` でPTYを作成
2. `-q` (quietモード) で `script` 自身のメッセージを抑制
3. `/dev/null` にログを捨てる（不要なため）
4. 引数にスペースや特殊文字が含まれる場合はクォート処理

**コード例**:
```javascript
// claude コマンドの引数を構築
let claudeArgs = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

// script コマンドで PTY を提供してバッファリングを回避
const claudeCommand = `claude ${claudeArgs.map(arg => {
  // 引数にスペースや特殊文字が含まれる場合はクォートする
  if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}).join(' ')}`;

const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
  cwd: cwd || process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe']
});
```

## 学び

### CLIツールのバッファリング動作

多くのCLIツールは、**stdout が TTY（端末）かパイプかを検出**して動作を変えます：

```javascript
// 多くのCLIツールの内部実装（擬似コード）
if (process.stdout.isTTY) {
  // TTY: 行バッファリング（改行で即座にフラッシュ）
  setLineBuffering();
} else {
  // パイプ: フルバッファリング（バッファが満杯になるまで溜める）
  setFullBuffering();
}
```

### script コマンドの利点

1. **標準ツール**: ほぼすべてのLinux/Unixに最初から入っている
2. **シンプル**: `script -q -c "コマンド" /dev/null` で完結
3. **軽量**: プロセス1つ挟むだけのオーバーヘッド
4. **汎用性**: Claude CLI以外にも使える（Python、Go製CLIなど）

### 他の解決策との比較

| 方法 | メリット | デメリット |
|------|---------|-----------|
| `script` コマンド | 標準搭載、シンプル | プロセス1つ余分に起動 |
| `node-pty` | Node.jsネイティブ | 追加依存、ビルド必要 |
| `stdbuf` | 軽量 | CLIによっては効かない |

### 汎用的な応用例

```javascript
// Python スクリプトのバッファリング問題
spawn('script', ['-q', '-c', 'python script.py', '/dev/null']);

// Go製CLIのプログレスバー表示
spawn('script', ['-q', '-c', 'go build -v', '/dev/null']);

// npm install の進捗表示
spawn('script', ['-q', '-c', 'npm install', '/dev/null']);
```

## 今後の改善案

- エラーハンドリングの強化（`script` コマンドが存在しない環境への対応）
- プラットフォーム依存の考慮（Linux/macOS/Windows）
- パフォーマンス計測（`script` を挟むことのオーバーヘッド）

## 関連ドキュメント

- [キャンセルイベントシステムの実装](./2026-02-23-13-45-00-cancel-event-system.md)
- [PM2とAPIテストの申し送り](../letters/2026-02-23-13-00-00-pm2-and-api-testing.md)

---

**最終更新**: 2026-02-23
**作成者**: Claude Code (AI)
