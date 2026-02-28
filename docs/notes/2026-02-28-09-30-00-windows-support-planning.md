---
tags: [windows, powershell, cross-platform, cli, planning]
---

# Windows対応計画 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-28
**関連タスク**: Windows環境でのClaude CLIバッファリング問題解決

## 問題

現在の実装では、`script` コマンドを使用してClaude CLIのバッファリング問題を解決していますが、**`script` コマンドはLinux/Unix専用**のため、Windows環境では動作しません。

### 現在の実装（Linux/Unix）

**実装場所**: `src/sender.js:32-43`, `src/sender.js:143-154`

```javascript
// script コマンドで PTY を提供してバッファリングを回避
const claudeCommand = `claude ${claudeArgs.map(arg => {
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

### 課題

- ✅ **Linux/Unix**: `script` コマンドで正常動作
- ❌ **Windows**: `script` コマンドが存在しない
- ⚠️ **クロスプラットフォーム**: 同じコードで両環境をサポートする必要がある

## 要件

### 機能要件

1. **バッファリング問題の解決**: Claude CLIの即座の出力取得
2. **プラットフォーム分岐**: `process.platform` で自動判定
3. **軽量実装**: `node-pty` などの重量級依存を避ける（ユーザー要望）
4. **動作保証**: 既存のLinux/Unix実装に影響を与えない

### 非機能要件

- シンプルさ: 標準ツールで解決
- 保守性: プラットフォーム固有の複雑なロジックを避ける
- 拡張性: 将来的に他のプラットフォーム対応も可能な設計

## 検討中のアプローチ

### アプローチA: PowerShell経由の実行（推奨）

**概要**: PowerShellを使ってClaude CLIを実行し、バッファリング問題を回避

**実装イメージ**:
```javascript
function spawnClaudeProcess(prompt, cwd = null, sessionId = null) {
  const isWindows = process.platform === 'win32';

  let claudeArgs = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  if (sessionId) {
    claudeArgs.push('--session-id', sessionId);
  }

  let proc;

  if (isWindows) {
    // Windows: PowerShell経由で実行
    const claudeCommand = `claude ${claudeArgs.map(arg => {
      // PowerShellのエスケープ処理
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '`"')}"`; // PowerShellのバッククォート
      }
      return arg;
    }).join(' ')}`;

    proc = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      claudeCommand
    ], {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } else {
    // Linux/Unix: 既存の script コマンド
    const claudeCommand = `claude ${claudeArgs.map(arg => {
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    }).join(' ')}`;

    proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  return proc;
}
```

**メリット**:
- PowerShellはWindows標準搭載（Windows 7以降）
- 追加依存なし
- 比較的シンプルな実装

**デメリット**:
- PowerShellのエスケープルールがBashと異なる（要注意）
- PowerShellの起動オーバーヘッド（数百ms程度？要検証）
- バッファリング問題が完全に解決するかは要検証

**検証が必要な点**:
1. PowerShell経由でClaude CLIを実行してもバッファリング問題が発生しないか
2. エスケープ処理が正しく動作するか（特殊文字、改行、クォートなど）
3. エラーハンドリング（PowerShellが存在しない環境への対応）
4. パフォーマンス（起動時間、メモリ使用量）

---

### アプローチB: Windows用の代替コマンド調査

**概要**: `script` コマンドに相当するWindows標準ツールを探す

**候補**:
- `winpty`: Git for Windowsに同梱されているPTYエミュレータ
  - ❌ **デメリット**: Git for Windowsが必須、標準ではない
- `conpty`: Windows 10以降のConPTY API
  - ❌ **デメリット**: Node.jsから直接使うのは困難、`node-pty` が必要

**評価**: 標準ツールで適切なものが見つからない

---

### アプローチC: 直接spawn（バッファリング問題を受け入れる）

**概要**: Windowsでは `script` なしで直接 `spawn` を使い、バッファリング問題を受け入れる

```javascript
if (isWindows) {
  // Windows: 直接spawn（バッファリング問題あり）
  proc = spawn('claude', claudeArgs, {
    cwd: cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
} else {
  // Linux/Unix: script コマンド
  // ...
}
```

**メリット**:
- 実装が最もシンプル
- 追加依存なし

**デメリット**:
- ❌ **バッファリング問題が解決しない**: セッションID取得が遅延する可能性
- ❌ **機能制限**: Windowsでは正常に動作しないリスク

**評価**: 推奨しない（機能要件を満たさない）

---

## 推奨アプローチ

### ✅ アプローチA: PowerShell経由の実行

**理由**:
1. Windows標準搭載（追加依存なし）
2. 軽量実装（`node-pty` 不要）
3. バッファリング問題を解決できる可能性が高い

**実装ステップ**:
1. ✅ **設計**: プラットフォーム分岐ロジックの設計（このノート）
2. ⬜ **検証**: Windows PCでPowerShell経由のClaude CLI実行をテスト
3. ⬜ **実装**: `src/sender.js` にプラットフォーム分岐を追加
4. ⬜ **テスト**: Windows環境で動作確認
   - セッションID取得（`/home/.../.config/claude/sessions/XXXXXXXX-XXXX-...`）
   - stdout/stderr の即座の出力
   - エラーハンドリング
5. ⬜ **エラーハンドリング**: PowerShellが存在しない環境への対応
6. ⬜ **ドキュメント更新**: README にWindows対応を追記
7. ⬜ **コミット**: ユーザー承認後にコミット

## 技術的な考慮事項

### PowerShellのエスケープルール

PowerShellはBashと異なるエスケープルールを持つため、注意が必要です。

| 文字 | Bash | PowerShell |
|------|------|------------|
| `"` (ダブルクォート) | `\"` | `` `" `` (バッククォート) |
| `'` (シングルクォート) | `\'` | `''` (2つ重ねる) |
| バッククォート | `\`` | ``` `` ``` (2つ重ねる) |
| 変数展開 | `$VAR` | `$VAR` (同じ) |

**対策**:
```javascript
function escapeForPowerShell(arg) {
  if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('`')) {
    // ダブルクォートで囲み、内部のダブルクォートとバッククォートをエスケープ
    return `"${arg.replace(/"/g, '`"').replace(/`/g, '``')}"`;
  }
  return arg;
}
```

### PowerShellのバッファリング動作

PowerShellは標準でUTF-16出力を使用するため、バッファリング動作が異なる可能性があります。

**検証項目**:
- Claude CLIの出力がすぐに取得できるか
- 文字エンコーディングの問題がないか（UTF-8 vs UTF-16）
- ANSI エスケープシーケンスが正しく処理されるか

### エラーハンドリング

```javascript
proc.on('error', (err) => {
  if (err.code === 'ENOENT') {
    if (isWindows) {
      console.error('[sender] PowerShell not found. Please ensure PowerShell is installed.');
    } else {
      console.error('[sender] script command not found. Please install util-linux.');
    }
  }
  // エラーイベントを発行
  processEvents.emit('session-error', {
    sessionId: sessionId || `temp-${Date.now()}`,
    pid: proc.pid || null,
    error: err.message,
    timestamp: new Date().toISOString()
  });
});
```

## 代替案（将来的な検討）

### node-ptyの導入

**条件**: PowerShell経由でもバッファリング問題が解決しない場合のみ検討

**メリット**:
- クロスプラットフォームでPTYを提供
- バッファリング問題を確実に解決

**デメリット**:
- ネイティブモジュール（ビルドが必要）
- 依存が増える
- インストールが複雑になる

**判断基準**: アプローチAで問題が解決しない場合のみ導入を検討

## 学び

### プラットフォーム固有の問題

- `script` コマンドはUnix系専用のツール
- Windowsには直接の代替コマンドが存在しない
- PowerShellは標準搭載だが、エスケープルールが異なる

### 軽量実装の重要性

- ユーザー要望: `node-pty` のような重量級依存を避ける
- 標準ツール（PowerShell、script）で解決できるか検証が必要

### クロスプラットフォーム開発のベストプラクティス

- `process.platform` で分岐
- プラットフォーム固有のロジックは最小限に
- 各プラットフォームで動作検証が必須

## 次のステップ

### 優先度: 中（ユーザーが他の作業を優先中）

1. Windows PCで動作検証
2. PowerShell経由の実装
3. テスト＆エラーハンドリング
4. ドキュメント更新
5. ユーザー承認後にコミット

### 保留中の理由

- ユーザーが他の作業を優先したいため
- Windows環境でのテストが必要なため

## 関連ドキュメント

- [scriptコマンドによるCLIバッファリング問題の解決](./2026-02-23-13-40-00-script-command-for-cli-buffering.md)
- [Webhook配信エラーハンドリングと追加セッションイベントの申し送り](../letters/2026-02-28-09-25-00-webhook-error-handling-and-session-events.md)

---

**最終更新**: 2026-02-28
**作成者**: Claude Code (AI)
