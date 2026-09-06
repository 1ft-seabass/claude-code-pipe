---
tags: [api, security, design, viewer, pipe-viewer]
---

# `/projects/file` API 設計相談 - 開発記録

> **⚠️ 機密情報保護ルール**
>
> このノートに記載する情報について:
> - API キー・パスワード・トークンは必ずプレースホルダーで記載
> - 実際の機密情報は絶対に含めない
> - .env や設定ファイルの内容をそのまま転記しない

**作成日**: 2026-09-06
**関連タスク**: pipe-viewer 連携 — プロジェクト配下のテキストファイルをビューワーで閲覧できるようにする

## 問題

pipe-viewer 側で、ノート等のファイルパスにリンクを張り、クリックしたら中身をその場で表示したい。既存の添付ファイルAPI（`POST /attachments`）はpipe→Claude方向の逆で、今回はpipe側のファイルをpipe-viewer側に返す方向。画像等のバイナリはcode-serverで代替可能なので対象外、テキストファイル限定でよい。

## 検討・決定事項

### 1. エンドポイント形状: GET vs POST

- 既存の`/git/status` `/git/log`はGETで`projectPath`をクエリに乗せているが、あれらは件数・ステータスまでで中身は返さない
- 今回はファイルの生の中身を返すため、GETだとクエリ文字列にパスが乗り、アクセスログ・プロキシログ・ブラウザ履歴に残る。トークン未設定運用（Tailscale信頼モデル）だとURL直打ちで誰でも見えてしまう
- **結論: POST**。`{ projectPath, filePath }`をボディで受け取る。ブックマーク性は失うが、pipe-viewer側はSPA的にfetchする想定なので問題なし

### 2. projectPathの検証範囲

- `/git/status` `/git/log`と同じく「呼び出し元を信頼する」モデルを踏襲。既知プロジェクト一覧との突合はしない
- 一方で「一覧・列挙系API」（projectPath配下のファイル名を列挙するAPI）は別物として却下。パスを知らない第三者にも存在を暴露してしまい、開示範囲の質が変わるため。詳細は[[feedback_api_design_point_lookup_vs_listing]]

### 3. レスポンス形式

`{ content, mtime, size }` のJSON。生テキスト直返しではなく、pipe-viewer側でメタ情報も使えるようにJSON化。

### 4. サイズ上限

1MB（設定可能: `config.viewer.maxFileSize`）。ノート・ドキュメント用途なら十分。

### 5. 拡張子制限（allowlist → denylistへの転換）

最初は`.md .json .txt`のallowlistで実装したが、pipe-viewer運用を始めたら`.js` `.html`等も見たくなり、allowlistの都度追記が非現実的と判明。「実際にUIを作ってみないと分からない世界」（作者談）。

denylist方式（画像・pdf・zip・実行ファイル等の既知バイナリだけ拒否）に切り替え。ただしこれだけだと`.env`（拡張子なし、旧allowlistでは偶然ブロックされていた）が素通りしてしまうリスクに気づき、以下2層を追加:

- **ドットファイル/ドットディレクトリは常にブロック**（`.env` `.git/` `.ssh/`等、gitの有無に関係なく効く安いガード）
- **`.gitignore`対象もブロック**（`git check-ignore`をシェルアウト、git-info.jsの既存流儀を踏襲。git repoでない場合はベストエフォートでスキップ）

これで「見せたくないもの（secrets, .env, gitignore対象）は自動的に弾かれつつ、拡張子は実質フリーで見られる」という設計に着地。

## 学び

- allowlist方式は「思いつく限りの安全な拡張子を先に決める」発想だが、実際にUIを触ると「あれも見たい」が次々出てくる。denylist＋別軸の安全装置（ドットファイル・gitignore）の方が運用に強い
- `path.extname('.env')`はNodeでは`''`になる（先頭ドットのみのファイル名は拡張子なし扱い）。allowlist時代はこれが偶然のガードになっていたが、denylistに切り替えると同じ理由で素通りするようになるため、明示的な対策が必須
- セキュリティ判断は「公開サイトならNG、隔離ネットワーク内の利便性としてはOK」という前提込みで評価する。詳細は[[project_deployment_model_and_audience]]

## 今後の改善案

- pipe-viewer側の実際の利用状況を見て、denylistの過不足を調整
- 一覧・列挙系APIが本当に必要になった場合は`docs/notes/`等の特定サブディレクトリ限定・非再帰に絞って再検討

## 関連ドキュメント

- [実装ノート](./2026-09-06-04-38-00-projects-file-api-implementation.md)
- [認証再確認ノート](./2026-09-06-04-39-00-websocket-auth-gap-confirmation.md)

---

**最終更新**: 2026-09-06
**作成者**: Claude
