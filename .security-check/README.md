# .security-check/

setup-securecheck パターンが導入した secretlint + gitleaks の毎コミット検証一式です。
`.husky/` や `.github/` と同様、通常は中身を直接編集せず「ツール領域」として扱ってください。

## 使い方

すべて `node .security-check/cli.js <subcommand>` から実行します（`npm run security -- <subcommand>` でも同じ）。**必ずプロジェクトルートから実行してください**（`.security-check/`の中に`cd`してから実行するとパス解決が壊れ、誤検知・誤動作します。ルート外から実行した場合はエラーで検知されます）。

```bash
node .security-check/cli.js verify              # ヘルスチェック（設定・導入状態の確認のみ）
node .security-check/cli.js verify --simple      # + stagedファイルの簡易スキャン
node .security-check/cli.js verify --test-run    # + 全ファイル・全履歴のフルスキャン
node .security-check/cli.js install-gitleaks    # gitleaksバイナリの導入
node .security-check/cli.js uninstall           # アンインストール計画の表示（ドライラン）
node .security-check/cli.js uninstall --yes     # 実際にアンインストール
```

引数なしでTTYから実行すると、上下キーで選ぶ対話ウィザードが起動します（`node .security-check/cli.js`）。非TTY（CI等）では従来通りヘルプ表示になります。

`pre-commit` サブコマンドは git の pre-commit フックから自動的に呼ばれます（`simple-git-hooks` 経由）。手動で叩く必要は通常ありません。

## 中身

- `cli.js` — 単一エントリポイント。サブコマンドの振り分け・実行場所ガード・exit codeの一元管理のみ行う
- `lib/environment.js` — gitleaksバイナリの探索、v1/v2旧構成の検知など、pre-commit/verify双方が共有する判定ロジック
- `lib/pre-commit.js` — 毎コミット実行される検証本体（secretlint + gitleaks + 自動カナリア自己検証）。gitleaksが見つからない場合はフェイルクローズでコミットをブロックする
- `lib/verify.js` — ヘルスチェック（`security:verify`相当）
- `lib/install-gitleaks.js` — gitleaksバイナリのダウンローダー
- `lib/uninstall.js` — このパターンの導入物を除去する
- `lib/prompt.js` — ウィザード用の対話プリミティブ（select/confirm、依存ゼロ）
- `lib/wizard.js` — 引数なし+TTY起動時の対話メニュー本体
- `bin/` — 導入したgitleaksバイナリ（gitignore対象）
- `logs/pre-commit.log` — 毎コミットの実行記録（gitignore対象）

## 設計方針

- **フェイルクローズ**: gitleaksが未導入の状態は「secretlintのみで守られている」半端な状態であり、気づかれないまま運用が続くこと自体がリスクなので、警告に留めずコミットをブロックします。中途半端な状態を許容するオプトイン設定は用意していません。「全部入れる」か「`uninstall`で全部外す」かの二択です。
- **設定ファイルはここに置かない**: `gitleaks.toml` / `.secretlintrc.json` はユーザーが直接編集する対象なので、リポジトリルートに残しています。このフォルダに集約しているのはロジック・バイナリ・ログ・エントリポイントのみです。
