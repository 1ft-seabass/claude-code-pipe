---
tags: [windows, wsl, cross-platform, investigation, decision]
---

# Windows対応調査と意思決定

作成日: 2026-03-08

## 背景

claude-code-pipe は Linux/Unix 環境で `script` コマンドを使って Claude CLI のバッファリング問題を回避している。Windows では `script` コマンドが存在しないため、Windows対応の方針を検討した。

## バッファリング問題とは

Node.js でサブプロセスを起動すると、子プロセスは出力先がターミナル（TTY）かパイプかを検知する。パイプの場合、フルバッファモードに切り替わり、セッションIDのような小さなデータはバッファが溜まるまで届かず、最悪プロセス終了まで届かない。

`script` コマンドはPTY（疑似端末）を提供することで、子プロセスに「ターミナルに繋がっている」と思わせ、行バッファモードで動作させる。

## 検証の経緯

### Linux実機での検証

本物のClaude CLIを使って `script` ありとなしを比較検証した結果、`script` なしではハングすることを確認。バッファリング問題は実在する。

### Windows対応の検討

以下のアプローチを検討:

- **PowerShell経由**: バッファリング問題が解決しなかった
- **Git Bash + script**: MinGW環境に `script` コマンドが含まれていない
- **直接spawn**: パイプ検知でハングする
- **node-pty**: 解決策にはなるが、ネイティブコンパイルが必要で導入難易度が高まる

軽量な解決策が見つからなかった。

## 意思決定

**Windows（非WSL）では送信機能（sender.js）は対応しない。Webhook受信（watcher.js）のみをサポートする。**

### 理由

- 軽量な解決策が見つからなかった
- node-pty はネイティブコンパイルが必要で、プロジェクトの設計思想に合わない
- Windows での主な用途は並行セッションの観測（Webhook）であり、送信は Claude Code CLI から直接行えば十分
- WSL環境であればLinux実装がそのまま動くため、フル機能が使える

## 技術的な考察

### Watch Mode（Webhook）の安定性

Webhook機能（watcher.js）は`script`コマンドとは無関係で、chokidarでJSONLファイルを監視してHTTPで配信するだけのシンプルな実装です。そのため、すべてのプラットフォームで安定して動作する可能性が高いです。

### 他の言語での実装可能性について

「Pythonで書けばWindowsでも動くのでは？」という検討も行いましたが、Pythonの`subprocess.run`はプロセス終了まで待って結果をまとめて返す設計のため、バッファリングを回避しているのではなく「最終的にバッファがフラッシュされるまで待つ」だけです。セッションIDをリアルタイムに取得したい用途には使えないため、言語を変えても本質的な問題は解決しません。

### プラットフォーム検証状況

現時点での検証状況:

- **Linux**: 動作確認済み
- **WSL**: 動作確認済み
- **Windows (native)**: Send Modeは非対応（Watch Modeのみサポート）
- **macOS**: 未検証（動作する可能性は高いと考えていますが、BSD版の`script`コマンドは引数の順序が異なる可能性があります）

## 実装

- sender.js に `isWindowsNonWSL()` 関数を追加し、Windows (non-WSL) の場合はエラーを返す
- API側（/sessions/new と /sessions/:id/send）で 501 エラーを返す
- README.md に Platform Support テーブルを追加
- DETAILS.md に Platform-specific issues セクションを追加

## 関連ドキュメント

- [README.md - Platform Support](../../README.md#platform-support)
- [DETAILS.md - Platform-specific issues](../../DETAILS.md#platform-specific-issues)

---

**最終更新**: 2026-03-08
