---
tags: [session-handoff, windows, native, send-mode, v0.8.3, design]
---

# 申し送り（2026-07-07-13-02-45-windows-native-send-mode-design）

> **⚠️ 機密情報保護ルール**
>
> この申し送りに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない
> - コミット前に git diff で内容を確認
> - プッシュはせずコミットのみ(人間がレビュー後にプッシュ)

---

## 🔍 次のセッション開始時の検証プロトコル

```bash
# バージョン確認（v0.8.3 が反映されているか）
curl http://localhost:3100/version

# main ブランチへの反映状況確認
git log main..develop --oneline
# → 空であること（前回申し送りの持ち越しは今回のセッションで解消済みのはず）
```

---

## 現在の状況（タスク別）

### ✅ 完了: v0.8.3 リリース

**ステータス**: ✅ 完了（コミット・タグ作成・プッシュ済み）

**完了内容**:
- ✅ CHANGELOG.md / CHANGELOG-ja.md に v0.8.3 エントリを追加
- ✅ package.json を 0.8.2 → 0.8.3 に更新
- ✅ `docs/actions/sync_to_main.md` の手順に従い main ブランチへ同期
- ✅ ユーザーが `commit-main` ウィザードでmainにコミット・プッシュ
- ✅ タグ `v0.8.3` を作成しプッシュ済み
- ✅ develop ブランチもユーザーがプッシュ済み

前回申し送り（`2026-06-21-00-26-41-v083-webhook-payload-overhaul.md`）の持ち越し事項はすべて解消。

### 🔧 設計固まり・実装未着手: Windows native Send Mode 対応

**ステータス**: 🔧 設計方針確定、実装はこれから（次セッションの本題）

**背景**: Windows（非WSL）では Send Mode が `501` で非対応（`isWindowsNonWSL()` によるガード）。2026-03-08 の過去調査で「直接spawnはバッファリング問題でハングする」と結論され意思決定されていたが、この結論を現行 CLI で再検証した。

**検証内容**（詳細は `docs/notes/2026-07-07-12-57-43-windows-native-send-mode-investigation.md` 参照）:
- 検証用スクリプト `scripts/windows-native-probe.js` を作成し、Windows実機（Claude Code CLI 2.1.158）で4回実行
- **結論**: 現行CLIでは PTY なしでも stdout がリアルタイムに届く。JSONLファイルの出現より stdout の方が常に100〜300ms速い（4回連続で再現）
- `shell:true` は不要（`shell:false` のデフォルト spawn で `.cmd` 解決も問題なし）。特殊文字・シェルメタ文字を含むプロンプトでもインジェクション兆候なし
- `--resume` でも同様の傾向を確認済み（`resumedSessionIdMatches: true`）

**確定した設計方針**:
- 当初検討していた fire-and-forget + cwd/session_id相関 + FIFOキューという複雑な設計は不要と判断
- 既存 `sender.js` のロジック（stdoutから`system/init`を読みresolveする、タイムアウト、`managedProcesses`登録、イベント発行）をほぼそのまま流用
- 唯一プラットフォームで分岐すべきは「プロセスの起動方法」のみ：
  - Unix（既存・変更なし）: `script -q -c "<Bashエスケープ済みコマンド>" /dev/null`
  - Windows（新規）: `spawn('claude', claudeArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })`（配列渡し、shell不要、エスケープ不要）
- `claudeArgs`（引数配列組み立て）と stdoutパース/resolve/reject/timeout/イベント発行ロジックは共通化してよい（プラットフォーム非依存の純粋処理のため）
- Bashエスケープ・`script`ラッパーの組み立てはUnix側にのみ残し、Windows側には一切通さない

**次セッションでの実装タスク**:
1. `sender.js` に `spawnClaudeProcess(claudeArgs, cwd)` を切り出し、`isWindowsNonWSL()` で分岐する実装
2. `api.js` の 501 ガード（`POST /sessions/new`, `POST /sessions/:id/send` の2箇所）を撤去し、通常フローに乗せる
3. Windows実機で `POST /sessions/new` / `POST /sessions/:id/send` の結合テスト
4. README.md / DETAILS.md の Platform Support テーブル更新（Windows native も Send Mode 対応済みに）
5. 未検証: 実際のツール呼び出し（Bash/Edit等）を含むエージェントループ全体のWindows挙動

**検証コマンド**（次のセッションのAIが実行、実装後）:
```bash
# Windows実機で（PowerShell）
curl -X POST http://localhost:3100/sessions/new -H "Content-Type: application/json" -d "{\"prompt\":\"hello\",\"projectPath\":\"C:\\path\\to\\project\"}"
# → sessionId, pid, model 等が返ること（501にならないこと）
```

---

## 次にやること

1. **最優先**: Windows native Send Mode 実装（上記4タスク）
2. **その後**: 長期持ち越し事項（下記）の着手要否をユーザーと相談

### 長期持ち越し（2026-05-24付け申し送りより、未着手のまま）

- `-` 始まりプロンプトの対応（必要になったら `--` 区切り or 別経路）
- 画像アップロード周りの拡張（古いtmpファイルの自動クリーンアップ、マジックナンバー検証、Send APIとの連携、容量制限）
- `getGitStatus` の大量ファイル時の限界値処理
- npx 駆動の相談
- `/managed` と `/processes` の重複エンドポイント統合
- `GET /sessions` 一覧のチャットフィルタ検討

---

## 注意事項

- ⚠️ `logs/server.log` に認証情報が記録されており、pre-commit フックが毎回警告を出す。今回のセッションでも変更とは無関係の既知事象として継続中。ログファイルをクリアするかフックの除外設定を検討してもよい
- ⚠️ Windows native の検証は**1台のマシン・CLIバージョン2.1.158のみ**。実装後、可能であればもう一度・別環境でも確認できると安心
- ⚠️ `scripts/windows-native-probe.js` はリポジトリに残っているので、実装後の回帰確認や別環境での再検証にそのまま使える

---

## 技術的な文脈

### 起動方法
```bash
# 起動
npm run dev:tmux:start

# 再起動
npm run dev:tmux:restart

# 停止
npm run dev:tmux:stop

# ステータス確認
npm run dev:tmux:status
curl http://localhost:3100/health
```

### テスト手法（正式フレームワークなし、手動確認）
```bash
# バージョン確認
curl http://localhost:3100/version

# Windows native 挙動の検証（実機が必要）
node scripts/windows-native-probe.js
```

### 重要ファイル
- `src/sender.js`: Claude CLI プロセス管理（Windows native 対応の実装対象）
- `src/api.js`: REST API ルート定義（501ガード2箇所を撤去予定）
- `scripts/windows-native-probe.js`: Windows native 検証用スクリプト
- `docs/notes/2026-07-07-12-57-43-windows-native-send-mode-investigation.md`: 今回の調査詳細
- `docs/notes/2026-03-08-windows-support-investigation.md`: 今回覆した過去の意思決定

### 現在のバージョン
- v0.8.3（リリース完了・プッシュ済み）

---

## セッション文脈サマリー

### 核心的な設計決定

**「Windowsは複雑にならざるを得ない」という前提の転換**
- 理由: 過去の意思決定（2026-03-08）はCLIの当時のバージョンに基づくもので、現行バージョンでは再現しなかった
- 影響範囲: Windows native 実装の設計全体。複雑な相関ロジックが不要になり、Unix実装とほぼ共通化できる見込み

**「共通化してよい部分」と「危険地帯」の切り分け**
- 理由: 引数配列組み立て・stdoutパースはプラットフォーム非依存の純粋処理。Bashエスケープ・シェル起動はUnix固有の危険地帯（過去に2回バグを踏んだ実績あり）
- 影響範囲: `sender.js` のリファクタ方針。共通化はDRYのため積極的に行い、危険地帯だけは厳格に分離する

### 議論の流れ

1. ユーザーから Windows native 対応の設計ドキュメント（fire-and-forget + watcher相関案）を共有された
2. レビューの過程で「stdoutバッファリング問題は本当に今も存在するか」という疑問が浮上
3. `docs/notes/` を確認し、2026-03-08 に既に実機検証済み・意思決定済みだったことが判明
4. それでも「今のCLIバージョンでは変わっているかもしれない」という仮説のもと、検証スクリプトを作成
5. Windows実機で5種類のテストを複数回実行し、一貫して「PTYなしでもstdoutは速く届く」という結果を確認
6. 設計を「既存sender.jsロジックの流用＋起動方法だけ分岐」に転換
7. 「共通化」と「分離」のどちらを優先すべきかの議論を経て、危険地帯（エスケープ）だけを分離する方針で合意

### 次のセッションに引き継ぐべき「空気感」

- **このプロジェクトの優先順位**: CLI 透過性 > 最小依存 > 独自機能。今回もWindows対応において「本当にネイティブに存在する制約か」を実地検証した上で判断する姿勢を重視
- **ユーザーの意思決定スタイル**: 慎重に進めたい、実装が完成度高くまとまってきたら安易に手放さず「うまく入れ込みたい」という意向。断念の可能性も許容しつつ、まずは実地検証で前提を疑う
- **重視している価値観**: 過去の意思決定を鵜呑みにせず再検証する姿勢、DRYと安全性の両立、危険地帯の見極め
- **現在の開発フェーズ**: v0.8.3リリース完了、Windows native実装は設計確定・次セッションで本実装

---

## 関連ドキュメント

- [v0.8.3 Webhookペイロード強化の申し送り](./2026-06-21-00-26-41-v083-webhook-payload-overhaul.md)
- [Windows native Send Mode 再検証ノート](../notes/2026-07-07-12-57-43-windows-native-send-mode-investigation.md)
- [Windows対応調査と意思決定（今回覆した過去の結論）](../notes/2026-03-08-windows-support-investigation.md)

---

**作成日時**: 2026-07-07 13:02:45
**作成者**: AI
