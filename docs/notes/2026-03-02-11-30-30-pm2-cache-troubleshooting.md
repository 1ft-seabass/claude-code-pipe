---
tags: [pm2, troubleshooting, cache, node.js, deployment]
---

# PM2 キャッシュ問題のトラブルシューティング - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-03-02
**関連タスク**: PM2 運用のベストプラクティス

## 問題

コード変更後に PM2 で再起動（`pm2 restart`）してもエラーが解消せず、古いコードが実行され続ける現象が発生。

**症状**:
```
ReferenceError: sessionTimestamps is not defined
    at handleSubscriberEvent (/home/node/workspace/repos/claude-code-pipe/src/subscribers.js:125:31)
```

しかし、実際のコードでは `sessionTimestamps` は引数として正しく渡されている:
```javascript
// src/subscribers.js:70
handleSubscriberEvent(subscriber, event, sessionTimestamps, serverInfo);

// src/subscribers.js:142
function handleSubscriberEvent(subscriber, event, sessionTimestamps, serverInfo) {
  // ...
}
```

**環境**:
- Node.js
- PM2 v6.0.14
- CommonJS モジュール

## 試行錯誤

### アプローチA: pm2 restart のみ

**試したこと**: `npm run pm2:restart` で再起動

**結果**: 失敗

**理由**: PM2 がモジュールキャッシュまたはプロセスを保持していた可能性

---

### アプローチB: pm2 delete + pm2 start

**試したこと**:
1. `npm run pm2:delete` でプロセスを完全削除
2. `npm run pm2:start` で新規起動

**結果**: 失敗

**理由**: エラーログファイルに古いエラーが残っており、新しいエラーかどうか判断できなかった

---

### アプローチC: pm2 delete + ログクリア + pm2 start（成功）

**試したこと**:
1. `npm run pm2:delete` でプロセスを完全削除
2. `rm -f logs/pm2-*.log` でログファイルをクリア
3. `npm run pm2:start` で新規起動

**結果**: 成功

**実行コマンド**:
```bash
npm run pm2:delete && rm -f logs/pm2-*.log && npm run pm2:start
```

## 解決策

PM2 でコード変更が反映されない場合の確実な対処法

**実行手順**:

1. **プロセスを完全削除**:
   ```bash
   npm run pm2:delete
   # または
   PM2_HOME=./.pm2 pm2 delete claude-code-pipe
   ```

2. **ログファイルをクリア**:
   ```bash
   rm -f logs/pm2-*.log
   ```

3. **新規起動**:
   ```bash
   npm run pm2:start
   # または
   PM2_HOME=./.pm2 pm2 start ecosystem.config.js
   ```

4. **エラーログを確認**:
   ```bash
   tail -20 logs/pm2-error.log
   ```

**ワンライナー**:
```bash
npm run pm2:delete && rm -f logs/pm2-*.log && npm run pm2:start
```

## 学び

この経験から得た知見

- **学び1: pm2 restart の限界**: `pm2 restart` は既存プロセスを再利用するため、モジュールキャッシュが残る場合がある
- **学び2: ログクリアの重要性**: 古いエラーログが残っていると、新しいエラーかどうか判断できない
- **学び3: pm2 delete の効果**: プロセスを完全に削除してから起動すると、確実にコードが反映される
- **学び4: 確認手順**: エラーログファイルのサイズや最終更新時刻を確認することで、新しいエラーかどうか判断できる

## PM2 運用のベストプラクティス

### 通常の再起動（コード変更なし）
```bash
npm run pm2:restart
```

### コード変更後の再起動（確実に反映）
```bash
npm run pm2:delete && rm -f logs/pm2-*.log && npm run pm2:start
```

### エラーログの確認
```bash
# 最新20行
tail -20 logs/pm2-error.log

# リアルタイム監視
npm run pm2:logs -- --err

# ファイルサイズと最終更新時刻
ls -lh logs/pm2-error.log
```

### ステータス確認
```bash
npm run pm2:status
```

## 関連する問題パターン

### Node.js の require() キャッシュ
Node.js は `require()` でロードしたモジュールをキャッシュする。PM2 が既存プロセスを再利用する場合、このキャッシュが残る可能性がある。

**対策**: プロセスを完全に削除してから起動

### PM2 の cluster mode
`cluster` モードでは複数ワーカープロセスが起動する。`restart` では全ワーカーが確実に再起動されるが、`reload` はゼロダウンタイム再起動のため、古いワーカーが残る場合がある。

**対策**: `delete` + `start` で確実に全ワーカーを再起動

## 今後の改善案

- 開発用と本番用で PM2 設定を分ける（`ecosystem.dev.js` と `ecosystem.prod.js`）
- 開発時は `watch: true` を有効にして自動再起動
- CI/CD パイプラインでは必ず `delete` + `start` を実行

## 関連ドキュメント

- [PM2 公式ドキュメント](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Node.js モジュールキャッシュ](https://nodejs.org/api/modules.html#modules_caching)

---

**最終更新**: 2026-03-02
**作成者**: Claude Code (AI)
