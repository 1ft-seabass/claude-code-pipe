---
tags: [api, image, base64, viewer, projects-file]
---

# `/projects/file` の画像対応（base64） - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-07
**関連タスク**: v0.8.6でリリースした`/projects/file`（テキストファイル閲覧API）の拡張

## 問題

`/projects/file`はv0.8.6でテキスト限定（画像はdenylistでブロック）としてリリースした。画像はcode-serverで見れば良いという想定だったが、実運用で以下の理由から画像も見たいというニーズが出た:

- code-serverはHTTPで見ることが多く、プレビューが出にくい場面がある
- pipe-viewerのチャット内で画像を見ながら検討したい（別ツールに切り替えずに済む）

## 解決策

### 拡張子を denylist ではなく別枠の image リストで扱う

- `DEFAULT_VIEWER_IMAGE_EXTENSIONS`（`.jpg .jpeg .png .gif .bmp .webp .ico .svg`）を新設し、`DEFAULT_VIEWER_DENIED_EXTENSIONS`からは画像拡張子を除去
- `config.viewer.imageExtensions`で設定変更可能（デフォルト値は上記と同じ）

### レスポンス形式: `encoding`フィールドで分岐

**実装場所**: `src/api.js`（`POST /projects/file`）

```json
// テキスト
{ "content": "...", "mtime": "...", "size": 1234, "encoding": "utf8" }

// 画像
{ "content": "<base64>", "mtime": "...", "size": 45678, "encoding": "base64", "mimeType": "image/png" }
```

- 既存のテキストレスポンスには`encoding: "utf8"`フィールドが増えるだけで、`content`/`mtime`/`size`は無変更（後方互換）
- 画像は`fs.readFileSync(realPath)`でBufferとして読み、`.toString('base64')`でエンコード。`mimeType`は拡張子→MIMEタイプの小さな固定マップ（`IMAGE_MIME_TYPES`）から算出
- pipe-viewer側は`` `data:${mimeType};base64,${content}` ``でそのまま`<img>`に使える

### サイズ上限を分離

画像はスクリーンショット等でテキストより大きくなりがちなため、上限を分離:
- `config.viewer.maxFileSize`（テキスト用、既存のまま1MB）
- `config.viewer.maxImageFileSize`（新設、デフォルト5MB）

### ドットファイル・gitignoreブロックは画像にもそのまま適用

拡張子の扱いを変えただけで、既存の2層（ドットファイル即ブロック・gitignore対象ブロック）は画像かテキストかに関係なく効き続ける。denylistを緩めたのは「バイナリを許可するかどうか」という表示可否の話であり、secrets系の防御とは独立している。

## 動作確認

一時ポート(3101)で確認:

| テスト | 結果 |
|---|---|
| PNG画像取得 → base64デコードして元ファイルとバイト完全一致 | ✅ |
| 通常テキスト（回帰） → `encoding`が増えるだけで従来通り取得 | ✅ |
| `.zip`（denylist継続） | ✅ 400ブロック |
| 画像サイズ超過（6MB > デフォルト5MB） | ✅ 413 |

途中、テスト用サーバー停止に`pkill -f "node src/index.js"`を使い、**本番tmuxセッション(port 3100)を誤って巻き込んで落としてしまう事故**があった。`npm run dev:tmux:restart`で即復旧。以後はポート/PID単位で確実に対象を絞るよう徹底。

## 学び

- 「今は使わないから対象外」と決めた機能（今回で言う画像）でも、実運用でニーズが出たら見直すのは自然。denylist/allowlistのような拡張子リストは、最初から「別グループに分けて後で拡張しやすくする」設計にしておくと変更が楽になる
- テスト用に別ポートでサーバーを立てる際、`pkill -f`のようなパターンマッチkillは本番プロセスも巻き込むリスクがある。ポート番号からPIDを特定して`kill <pid>`する方式に統一すべき

## 今後の改善案

- PDF・ドキュメント系（.doc, .xls等）も同様のニーズが出たら、image方式と同じ「別枠+base64」パターンを踏襲できる

## 関連ドキュメント

- [`/projects/file` 設計相談ノート（v0.8.6）](./2026-09-06-04-37-00-projects-file-api-design.md)
- [`/projects/file` 実装ノート（v0.8.6）](./2026-09-06-04-38-00-projects-file-api-implementation.md)

---

**最終更新**: 2026-09-07
**作成者**: Claude
