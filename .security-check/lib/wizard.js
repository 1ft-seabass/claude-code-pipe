// 引数なし + TTY で起動する対話メニュー。人間が手で操作するときの入口で、
// 非TTY（git hook / CI 経由）では cli.js 側が呼び分けるためここには来ない。
// pre-commit は git hook専用のためメニューには出さない。

const { select, confirm } = require('./prompt');

async function run() {
  const choice = await select({
    message: '実行したい操作を選んでください',
    choices: [
      { label: 'verify              設定と動作のヘルスチェック', value: 'verify' },
      { label: 'install-gitleaks    gitleaksバイナリを導入', value: 'install-gitleaks' },
      { label: 'uninstall           このパターンの導入物を除去', value: 'uninstall' },
    ],
  });

  if (!choice) {
    console.log('キャンセルしました');
    return 0;
  }

  if (choice === 'verify') {
    const mode = await select({
      message: 'verify のモードを選んでください',
      choices: [
        { label: 'ヘルスチェックのみ', value: [] },
        { label: '+ staged ファイルの簡易スキャン (--simple)', value: ['--simple'] },
        { label: '+ 全ファイル・全履歴のフルスキャン (--test-run)', value: ['--test-run'] },
      ],
    });
    if (mode === null) {
      console.log('キャンセルしました');
      return 0;
    }
    return require('./verify').run(mode);
  }

  if (choice === 'install-gitleaks') {
    const ok = await confirm({
      message: 'gitleaks バイナリを .security-check/bin/ に導入します。よいですか？',
      default: true,
    });
    if (!ok) {
      console.log('キャンセルしました');
      return 0;
    }
    return require('./install-gitleaks').run();
  }

  if (choice === 'uninstall') {
    // ドライランで削除計画を先に見せてから、実行するかどうかを確認する。
    require('./uninstall').run([]);
    const ok = await confirm({
      message: '\n上記の内容で実際にアンインストールしますか？',
      default: false,
    });
    if (!ok) {
      console.log('キャンセルしました');
      return 0;
    }
    return require('./uninstall').run(['--yes']);
  }
}

module.exports = { run };
