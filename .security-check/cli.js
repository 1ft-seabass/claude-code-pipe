#!/usr/bin/env node

// setup-securecheck の単一エントリポイント。
// package.json 側は `"security": "node .security-check/cli.js"` の1行のみを持ち、
// git hook も `node .security-check/cli.js pre-commit` を直接呼ぶ。
// サブコマンドの実装は lib/ 配下に集約し、ここでは振り分けと exit code の一元管理のみ行う。

const path = require('path');

// lib/environment.js をはじめ各サブコマンドは process.cwd() 基準でパスを組み立てるため、
// `.security-check/` の中に cd してから `node cli.js` を実行すると、cwd + '.security-check'
// が二重にネストしたり存在しないパスになったりして誤動作する（例: gitleaksの導入先が
// .security-check/.security-check/bin/ になる）。このファイル自身の実の場所（__filename）は
// cwd に関わらず常に本物の .security-check/ を指すので、それと cwd 基準の期待値を比較して
// 検知する。
function assertRunFromProjectRoot() {
  const actualDir = path.dirname(__filename);
  const expectedDir = path.join(process.cwd(), '.security-check');
  if (path.resolve(actualDir) === path.resolve(expectedDir)) return;

  const projectRoot = path.dirname(actualDir);
  const cdHint = path.relative(process.cwd(), projectRoot) || '.';
  console.error('❌ プロジェクトルート（.security-check/ の一つ上の階層）から実行してください');
  console.error(`   現在地: ${process.cwd()}`);
  console.error(`   実行例: cd ${cdHint} && node .security-check/cli.js <subcommand>`);
  process.exit(1);
}

const SUBCOMMANDS = {
  'pre-commit': () => require('./lib/pre-commit').run(),
  'verify': (args) => require('./lib/verify').run(args),
  'install-gitleaks': () => require('./lib/install-gitleaks').run(),
  'uninstall': (args) => require('./lib/uninstall').run(args),
};

function printHelp() {
  console.log('setup-securecheck CLI');
  console.log('');
  console.log('使い方: node .security-check/cli.js <subcommand> [options]');
  console.log('        node .security-check/cli.js              引数なしで実行すると対話ウィザードが起動します（TTY時のみ）');
  console.log('');
  console.log('subcommands:');
  console.log('  verify [--simple|--test-run]   ヘルスチェック（--simpleはstagedのみ、--test-runは全ファイル+全履歴のスキャンも実行）');
  console.log('  pre-commit                     git pre-commit フックの実体（通常は直接叩かず simple-git-hooks 経由で呼ばれる）');
  console.log('  install-gitleaks               gitleaksバイナリを .security-check/bin/ に導入');
  console.log('  uninstall [--yes]              このパターンの導入物を除去（--yes無しはドライラン）');
}

const [sub, ...rest] = process.argv.slice(2);

// --help/-h はパスに触れないため、実行場所チェックより先に応答する。
if (sub === '--help' || sub === '-h') {
  printHelp();
  process.exit(0);
}

assertRunFromProjectRoot();

// 引数なし + TTY: 人間向けの対話ウィザードを起動する。
// 引数なし + 非TTY（CI/パイプ等での呼び間違い）は安全にヘルプ+exit 1へ縮退する。
if (!sub) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    run(() => require('./lib/wizard').run());
  } else {
    printHelp();
    process.exit(1);
  }
} else if (!SUBCOMMANDS[sub]) {
  console.error(`❌ 不明なサブコマンドです: ${sub}\n`);
  printHelp();
  process.exit(1);
} else {
  run(() => SUBCOMMANDS[sub](rest));
}

function run(exec) {
  Promise.resolve(exec())
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((e) => {
      console.error(e && e.stack ? e.stack : e);
      process.exit(1);
    });
}
