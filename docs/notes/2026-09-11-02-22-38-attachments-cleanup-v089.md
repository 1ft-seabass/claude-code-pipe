---
tags: [attachments, cleanup, tmp, config, v0.8.9]
---

# `/attachments` 古いファイルの自動クリーンアップ実装とv0.8.9リリース - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダー(`YOUR_API_KEY`等)で記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-11
**関連タスク**: `/attachments`の保存先(`/tmp/claude-code-pipe/`)に溜まるファイルの自動削除

## 問題

`POST /attachments`でアップロードされたファイルは`/tmp/claude-code-pipe/`にUUIDプレフィックス付きで保存されるが、削除する仕組みが一切なかった(前回申し送りから継続していた長期持ち越し事項)。

コンテナ自体の削除でいずれ消えるとはいえ、稼働中はずっと溜まり続ける。ユーザーへのヒアリングで「瞬間的に読むだけで振り返りはほぼしない」という利用実態が分かり、保持期間の目安を相談した。

## 解決策

### 保持期間の決定

ユーザーとの相談で「1週間」に決定。判断根拠:
- 利用実態が「アップロード直後に一度読むだけ」なので、長く残す価値は薄い
- コンテナのライフサイクルでどのみち消えるため、ディスク容量面で安全側に長めに倒す必要性も薄い
- 短すぎると「アップロードした直後にセッションをまたいでもう一度参照したい」ケースを壊すリスクがあるため、1日等の極端な短さは避ける

### 削除ロジックの前提の確認(実装前にユーザーと認識合わせ)

`mtime`基準で「起動時 + 定期実行」方式にする場合の挙動をユーザーと事前にすり合わせた:
- **アップデート(サーバー再起動)した瞬間から7日カウントが始まるわけではない**。起動時点で既に7日を超えているファイルは即座に削除される
- 新バージョンにアップデートすると、それまで溜まっていた7日超えの古いファイルがまとめて一括削除され、以降は7日ローリングで自然に掃除され続ける

この前提をユーザーが理解・合意した上で実装に着手した。

### 実装

`src/api.js`に`cleanupOldAttachments(config)`関数を追加:

```js
const ATTACHMENTS_TMP_DIR = '/tmp/claude-code-pipe';

function cleanupOldAttachments(config) {
  const maxAgeDays = config.upload?.maxAgeDays || 7;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  // ATTACHMENTS_TMP_DIR 配下のファイルを走査し、
  // mtime が maxAgeMs を超えたものを fs.unlinkSync で削除
}
```

既存の`POST /attachments`ハンドラ内でハードコードされていた`'/tmp/claude-code-pipe'`を`ATTACHMENTS_TMP_DIR`定数に統一(ユーザーから「保存先が揃っていて探しやすい」と好評だった設計を維持)。

`src/index.js`の`server.listen`コールバック内で、起動時に1回 + `setInterval`で1時間ごとに`cleanupOldAttachments(config)`を呼び出す。

**実装場所**: `src/api.js`(`cleanupOldAttachments`関数、`module.exports`に追加)、`src/index.js`(呼び出し箇所)

**設定**: `config.upload.maxAgeDays`(未設定時デフォルト`7`)。`config.example.json`にも明記。

## 検証

`node -e`でモジュールを直接読み込み、サーバーを起動せずにロジックだけを検証:

```bash
# 8日前・1日前のダミーファイルを用意
touch -d "8 days ago" /tmp/claude-code-pipe/old-test-file.txt
touch -d "1 day ago" /tmp/claude-code-pipe/new-test-file.txt

node -e "
const { cleanupOldAttachments } = require('./src/api');
cleanupOldAttachments({}); // デフォルト7日
"
# → old-test-file.txt のみ削除、new-test-file.txt は残存(期待通り)

node -e "
const { cleanupOldAttachments } = require('./src/api');
cleanupOldAttachments({ upload: { maxAgeDays: 0.5 } }); // 半日基準
"
# → 残っていた new-test-file.txt も削除される(期待通り)
```

本番tmuxセッションを再起動し、クラッシュなく起動すること、`/attachments-config`が引き続き正常応答することも確認。

## 学び

- **利用実態のヒアリングが保持期間の妥当性を決める**: 「振り返りはほぼしない」という一言から、保持期間を短くしすぎるリスク(セッションをまたいだ再参照ができなくなる)と長くしすぎる意味の薄さの両方を評価でき、1週間という具体的な数字に落とし込めた
- **`mtime`基準の「起動時+定期実行」方式は、アップデート直後に効果が一気に出る**: カウントがゼロからではなく、既存ファイルの実際の経過時間で判定されるため、長期間放置されていた環境ほど初回起動時の掃除量が大きくなる。この挙動はユーザーと事前にすり合わせておくべき重要な前提だった
- **保存先パスを定数化しておくメリット**: `'/tmp/claude-code-pipe'`という文字列が2箇所にハードコードされていたのを`ATTACHMENTS_TMP_DIR`に統一したことで、クリーンアップ関数からも安全に同じパスを参照できた

## 今後の改善案

- （長期持ち越し、引き続き）画像アップロード周りの残りの拡張: マジックナンバー検証、Send APIとの連携、容量制限。今回はクリーンアップのみ対応
- クリーンアップの実行間隔(1時間)や`maxAgeDays`のデフォルト値は、実運用でファイル数が想定以上に増えるようなら調整余地あり

## 関連ドキュメント

- [`/attachments`デフォルト拡張子拡充ノート](./2026-09-09-06-21-44-attachments-allowed-extensions-v088.md)
- [前回申し送り（v0.8.6/v0.8.7リリース）](../letters/2026-09-07-05-14-10-projects-file-api-v086-v087-release.md)

---

**最終更新**: 2026-09-11
**作成者**: AI
