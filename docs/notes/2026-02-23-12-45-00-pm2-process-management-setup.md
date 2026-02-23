---
tags: [pm2, process-management, stability, deployment, devops]
---

# PM2プロセス管理のセットアップ - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-02-23
**関連タスク**: API入力テストとサーバー安定化

## 問題

サーバーが頻繁に落ちており、検証作業に支障が出ていた。バックグラウンドで起動しても、プロセスが終了してしまい、API経由のテストが継続できない状態だった。

## 試行錯誤

### アプローチA: npm start をバックグラウンド実行
**試したこと**: `npm start &` でバックグラウンド実行

**結果**: 失敗

**理由**: プロセスが不安定で頻繁に落ちる。再起動も手動で必要。ログの確認も困難。

---

### アプローチB: PM2でプロジェクト内管理（成功）
**試したこと**:
- PM2をdevDependenciesにインストール
- `PM2_HOME=./.pm2` でプロジェクト内に封じ込め
- `ecosystem.config.js` で設定を管理

**結果**: 成功

**コード例**:
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'claude-code-pipe',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PM2_HOME: './.pm2'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
};
```

## 解決策

PM2をプロジェクトローカルにインストールし、`PM2_HOME` を `.pm2/` ディレクトリに設定することで、グローバル環境を汚さずにプロセス管理を実現。

**実装場所**:
- `ecosystem.config.js`: PM2設定ファイル
- `package.json:8-14`: PM2コマンドのnpmスクリプト追加
- `.gitignore:154`: `.pm2/` ディレクトリを除外

**主なポイント**:
1. **PM2_HOME の封じ込め**: グローバルPM2と競合しないよう、プロジェクト内で完結
2. **自動再起動**: クラッシュ時に自動的に再起動（max_restarts: 10）
3. **メモリ制限**: 500MBを超えたら自動再起動
4. **ログ管理**: `logs/pm2-out.log` と `logs/pm2-error.log` に分離

## 利用可能なコマンド

```bash
# サーバー起動
npm run pm2:start

# ステータス確認
npm run pm2:status

# ログ表示（リアルタイム）
npm run pm2:logs

# サーバー停止
npm run pm2:stop

# サーバー再起動
npm run pm2:restart

# プロセス削除
npm run pm2:delete

# モニタリング
npm run pm2:monit
```

## 検証結果

### PM2起動確認
```
┌────┬─────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name                │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ claude-code-pipe    │ default     │ 1.0.0   │ cluster │ 8256     │ 5s     │ 0    │ online    │ 0%       │ 71.1mb   │ node     │ disabled │
└────┴─────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

### API動作確認
- ✅ `GET /managed` が正常に応答
- ✅ サーバーが落ちずに継続動作
- ✅ ログが `logs/pm2-out.log` に記録

## 学び

- PM2は `PM2_HOME` 環境変数でデータディレクトリを変更できる
- プロジェクトローカルにPM2を封じ込めることで、ポータビリティと再現性が向上
- `ecosystem.config.js` で設定を管理することで、チーム全体で同じ環境を構築可能
- クラッシュ時の自動再起動により、開発・検証の中断が大幅に減少

## 今後の改善案

- ログローテーションの実装（PM2のログが肥大化する可能性）
- 本番環境では `pm2 startup` で自動起動設定を検討
- クラスタモード（instances > 1）でのロードバランシング検討

## 関連ドキュメント

- [Claude Code コマンド動作分析](./2026-02-23-12-45-30-claude-code-command-behavior.md)
- [前回の申し送り](../letters/2026-02-23-11-30-00-logging-and-testing-implementation.md)

---

**最終更新**: 2026-02-23
**作成者**: Claude Code (AI)
