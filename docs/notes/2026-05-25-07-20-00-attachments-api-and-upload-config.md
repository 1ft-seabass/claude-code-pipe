---
tags: [api, upload, config, attachments, viewer]
---

# attachments API 改名・attachments-config 追加・upload 設定の config 化 - 開発記録

**作成日**: 2026-05-25
**関連タスク**: v0.8.1 — アップロード設定の config 化とエンドポイント整理

## 問題

v0.8.0 で追加した `POST /images` エンドポイントに以下の課題が出てきた。

1. **エンドポイント名が不正確**: 画像だけでなく PDF・テキストも扱うのに `/images` という名前は誤解を招く
2. **ボディサイズ上限が Express のデフォルト 100KB**: base64 エンコードされたファイルはすぐに上限を超える
3. **許可拡張子がハードコード**: ビューワー側が「何が送れるか」を知る手段がない

## 試行錯誤

### アプローチA: `.env` でボディサイズを制御

**試したこと**: `process.env.MAX_BODY_SIZE` で制御する方式

**結果**: 採用せず

**理由**: このプロジェクトは `config.json` ベースのスタイルで統一されている。`.env` を混在させると設定の読み先が分散する

---

### アプローチB: `config.json` の `upload` セクションで制御（採用）

**試したこと**: `config.upload.maxBodySize` と `config.upload.allowedExtensions` を追加

**結果**: 成功

**設計のポイント**:
- 未設定時は `||` でデフォルト値にフォールバックするため、既存ユーザーは `config.json` を変更しなくてもよい
- `maxBodySize` は Express の `json({ limit })` にそのまま渡せる文字列形式（`"10mb"` など）を採用

## 解決策

### 1. エンドポイント改名: `POST /images` → `POST /attachments`

使い始めたばかりで後方互換は不要と判断し、シンプルに置き換え。

### 2. 設定確認エンドポイント追加: `GET /attachments-config`

ビューワー側が「この pipe は何を受け入れるか」を動的に取得できるようにした。

```bash
curl http://localhost:3100/attachments-config
# → {"maxBodySize":"10mb","allowedExtensions":[".jpg",".jpeg",".png",".pdf",".txt",".md"]}
```

### 3. upload 設定を `config.json` から読む

**`config.example.json`**:
```json
"upload": {
  "maxBodySize": "10mb",
  "allowedExtensions": [".jpg", ".jpeg", ".png", ".pdf", ".txt", ".md"]
}
```

**`src/index.js`**:
```js
app.use(express.json({ limit: config.upload?.maxBodySize || '10mb' }));
```

**`src/api.js`**:
```js
const allowed = config.upload?.allowedExtensions || ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.md'];
```

**実装場所**:
- `src/index.js:22` — JSON ボディサイズ上限
- `src/api.js` — `/attachments-config` エンドポイント・`/attachments` エンドポイント

## 学び

- **ビューワー連携を意識したエンドポイント設計**: 設定値をハードコードするだけでなく、`-config` エンドポイントとして公開することでビューワーが動的に対応できる。UI の「許可ファイル種別」表示や「サイズ警告」に活用できる
- **`||` フォールバックで後方互換を保つ**: `config.upload?.maxBodySize || '10mb'` のパターンにより、既存ユーザーは設定追加不要。オプトイン方式で安全に設定を拡張できる
- **エンドポイント名は早めに正確に**: 使い始め直後に改名するのが最小コスト。ビューワーとの繋ぎ込みが進んでから変えると修正範囲が広がる

## 今後の改善案

- 古い `/tmp/claude-code-pipe/` ファイルの自動クリーンアップ（現在は手動削除のみ）
- マジックナンバー検証（拡張子だけでなくファイルヘッダーでも検証）
- `POST /attachments` と Send API の連携設計（アップロードしたファイルをプロンプトに添付する経路）

## 関連ドキュメント

- [画像アップロード API 追加ノート（v0.8.0）](./2026-05-24-04-10-00-image-upload-api.md)
- [DETAILS.md — attachments API リファレンス](../../DETAILS.md)

---

**最終更新**: 2026-05-25
**作成者**: Claude Code (AI)
