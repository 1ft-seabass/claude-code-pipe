# setup_securecheck - セキュリティチェック導入ガイド

secretlint + gitleaks によるシークレットスキャンの**ウィザード形式**導入ガイド

**二重チェック体制**: secretlint と gitleaks を両方使うことで、より確実にシークレットを検出します。

---

## 🚀 新規プロジェクト / 既存プロジェクト 共通

> **🤖 AIへのワンショット指示（コピペ用）**
>
> ```
> https://github.com/1ft-seabass/my-ai-collaboration-patterns/patterns/setup-pattern/setup_securecheck
> このパターンを使ってセキュリティチェック（secretlint + gitleaks）を導入したいです。
>
> npx degit 1ft-seabass/my-ai-collaboration-patterns/patterns/setup-pattern/setup_securecheck ./tmp/security-setup
>
> tmp/security-setup/setup_securecheck.md を読んで、ウィザード形式で導入を案内してください。
> ```

**ウィザード形式の特徴**:
- AI が各ステップの**コマンドを提示**
- 人間が**コマンドを実行して結果を報告**
- AI と人間が**対話しながら進める**
- 人間に**責任と記憶が残る**

**導入の流れ**:
- **Phase 0**: ヘルスチェック（既存設定の確認）
  - 既に導入済み → 10/10 で完了
  - 未導入 or 設定不足 → Phase 1 へ
- **Phase 1**: 初動スキャン（現状把握）
- **Phase 2**: 手動運用（npm scripts）
- **Phase 3 または 4**: pre-commit 自動化（確認してから進める）

---

## 📦 このパターンについて

### 解決する問題

- **AI に設定を任せると揺れる**: toml が空、カスタムパターンが甘い、設定漏れ等が発生
- **クロスプラットフォーム問題**: Windows/WSL2/Docker で gitleaks のインストールがカオス化
- **確認の仕組みがない**: AI が「できました」と報告するが、実際には設定が抜けている

### このパターンの特徴

#### 四層構造の思想を適用
- **確実に動く層**: Node.js スクリプト、テンプレートファイル（AIが生成しない）
- **揺れる層**: AI によるウィザード案内（生成ではなく案内に徹する）

#### 人間が実行、AIが案内
- AI がコマンドを提示 → 人間が叩く → 結果を報告 → AI が次を案内
- 人間に**責任と記憶が残る**（サーバーセットアップと同じ体験）

#### 2段階のチェック
- **ヘルスチェック**: 設定ファイルの存在・中身・動作確認
- **テストラン**: 実際のスキャンを走らせて検出テスト

---

## 📂 作成される構造

```
tmp/security-setup/                   # 一時ディレクトリ（導入完了後に削除）
├── README.md                         # このファイル（導入ガイド）
├── setup_securecheck.md              # ウィザード手順書（AI が読むメイン文書）
└── templates/
    ├── .secretlintrc.json            # secretlint 設定テンプレート
    ├── gitleaks.toml                 # gitleaks 設定テンプレート
    ├── gitignore.example             # .gitignore 追記サンプル
    ├── package.json.example          # package.json 追記サンプル
    └── scripts/
        ├── install-gitleaks.js       # gitleaks インストーラー（OS 自動判定）
        ├── security-verify.js        # ヘルスチェック + テストラン
        └── pre-commit.js             # Node.js 版 pre-commit フック
```

**注**: `tmp/` は一時ディレクトリとして使用します。導入完了後は `rm -rf tmp/security-setup/` で削除できます。

### ファイルの役割

| ファイル | 役割 | AI の扱い |
|---------|------|----------|
| **setup_securecheck.md** | ウィザード手順書 | AI が読んで人間に案内 |
| **templates/.secretlintrc.json** | secretlint 設定 | **コピーのみ**（AI は生成しない） |
| **templates/gitleaks.toml** | gitleaks 設定 | **コピーのみ**（AI は生成しない） |
| **templates/scripts/*.js** | 確定的スクリプト | **コピーして実行**（AI は変更しない） |
| **package.json.example** | scripts 追記サンプル | AI が既存 package.json に統合 |
| **gitignore.example** | .gitignore 追記サンプル | AI が既存 .gitignore に統合 |

---

## 🎯 導入の流れ（Phase 0-4）

| Phase | 内容 | ここで止めてもOK？ |
|-------|------|------------------|
| **Phase 0** | ヘルスチェック（既存設定の確認） | ✅ 10/10 なら完了 |
| **Phase 1** | 初動スキャン（現状把握） | ✅ 問題発見したらまず対応 |
| **Phase 2** | 手動運用（npm scripts） | ✅ ライトに運用したい場合 |
| **Phase 3** | pre-commit 強制（チーム全員） | ✅ チーム開発の場合 |
| **Phase 4** | pre-commit 強制（個人用） | ✅ 個人開発の場合 |

---

## 💻 提供されるコマンド

セットアップ完了後、以下のコマンドが使えるようになります：

| コマンド | 用途 |
|---------|------|
| `npm run security:verify` | ヘルスチェック（設定確認のみ） |
| `npm run security:verify:simple` | ヘルスチェック + staged ファイルスキャン（軽量・pre-commit相当） |
| `npm run security:verify:testrun` | ヘルスチェック + 全ファイル + 全履歴スキャン（重い） |
| `npm run security:install-gitleaks` | gitleaks バイナリのインストール（OS 自動判定） |
| `npm run secret-scan` | secretlint で全ファイルスキャン |
| `npm run secret-scan:full` | secretlint + gitleaks で全スキャン |

---

## 🔧 技術的な特徴

### bash 依存を完全に排除
- 全スクリプトを **Node.js で実装**
- Windows/macOS/Linux で同じスクリプトが動く
- `process.platform` で OS 自動判定

### gitleaks のクロスプラットフォーム対応
- Linux: x64/arm64 対応（tar.gz 展開）
- macOS: x64/arm64 対応（tar.gz 展開）
- Windows: x64 対応（PowerShell Expand-Archive）
- 冪等性あり（既にインストール済みならスキップ）

### verify の 10 項目チェック
**存在チェック（4項目）**:
- .secretlintrc.json
- gitleaks.toml
- .husky/pre-commit
- package.json の lint-staged 設定

**中身チェック（3項目）**:
- .secretlintrc.json に preset-recommend が含まれているか
- gitleaks.toml が空でないか
- .husky/pre-commit に secretlint の記述があるか

**動作チェック（3項目）**:
- secretlint コマンドが動くか
- lint-staged コマンドが動くか
- gitleaks バイナリが動くか

### テストラン（--test-run）
- ヘルスチェックが全て ✅ → 実際のスキャンを実行
- secretlint "**/*" を実行（全ファイル）
- gitleaks detect を実行（全履歴）
- 検出があれば詳細表示（最初の 20-30 行）

**重要**: secretlint と gitleaks の両方が正常に動作することを確認します。

---

## 📖 設計思想

### 四層構造アーキテクチャの適用

**確実に動くパート**（揺れない）:
- Node.js スクリプト（OS 判定、ファイルコピー、ヘルスチェック）
- テンプレートファイル（AI が生成しない、コピーのみ）

**揺れるパート**（AI の役割）:
- ウィザード案内（コマンドを提示、結果を受けて次を案内）
- 検出結果の解釈（本物のシークレットか、プレースホルダーか）

### AI に任せすぎない
- **設定ファイルは AI が生成しない**（テンプレートからコピー）
- **スクリプトは AI が変更しない**（確定的に動作する）
- **verify は人間が叩く**（AI が設定 → AI が確認のループを断ち切る）

### ワンショット型の一貫性
- my-ai-collaboration-patterns の他パターンと同じ思想
- `npx degit` で一式取得 → AI に手順書を読ませる
- 人間が責任を持ってコマンドを実行

---

## 🔗 関連パターン

- [docs-structure](../../docs-structure/) - ドキュメント構造パターン
- [actions-pattern](../../actions-pattern/) - AI への指示テンプレート

---

## 📝 ライセンス

MIT License - 自由に使用・改変・配布できます
