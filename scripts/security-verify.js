#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const testRun = args.includes('--test-run');
const simpleRun = args.includes('--simple');

console.log('🔍 Security Setup Health Check');
console.log('================================\n');

const results = {
  passed: 0,
  failed: 0,
  warning: 0,
  skipped: 0
};

const checks = {
  existence: [],
  content: [],
  operation: []
};

// Helper functions
function fileExists(filePath) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
  } catch (e) {
    return null;
  }
}

function execCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function checkResult(passed, message, type = 'normal') {
  if (type === 'warning') {
    console.log(`  ⚠️  ${message}`);
    results.warning++;
  } else if (type === 'skip') {
    console.log(`  ⏭️  ${message}`);
    results.skipped++;
  } else if (passed) {
    console.log(`  ✅ ${message}`);
    results.passed++;
  } else {
    console.log(`  ❌ ${message}`);
    results.failed++;
  }
}

// ===========================
// husky (v1) 先行検知
// ===========================
// 「共通」ワンショット指示（README）は version-detect を経由せず直接このスクリプトを
// 呼ぶため、ここで検知しないと v1(husky) 構成が素通りし、Phase 1 の新規導入フローが
// 既存の husky 設定の上に simple-git-hooks を重ねてしまうリスクがある。
// 判定ロジックは version-detect/scripts/detect-version.js と同一。
(function checkHuskyLegacy() {
  const pkgRaw = readFile('package.json');
  let pkg = null;
  if (pkgRaw) {
    try {
      pkg = JSON.parse(pkgRaw);
    } catch (e) {
      // parse error
    }
  }

  const hasHusky = !!(pkg && ((pkg.devDependencies && pkg.devDependencies['husky']) || (pkg.dependencies && pkg.dependencies['husky'])));
  const hasLintStaged = !!(pkg && ((pkg.devDependencies && pkg.devDependencies['lint-staged']) || (pkg.dependencies && pkg.dependencies['lint-staged']) || pkg['lint-staged']));
  const huskyDirExists = fileExists('.husky');

  if (hasHusky || hasLintStaged || huskyDirExists) {
    const reasons = [];
    if (hasHusky) reasons.push('husky が devDependencies に存在');
    if (hasLintStaged) reasons.push('lint-staged が devDependencies/設定に存在');
    if (huskyDirExists) reasons.push('.husky/ ディレクトリが存在');

    console.log('⚠️  husky/lint-staged ベースの v1 構成を検出しました（' + reasons.join(' / ') + '）');
    console.log('    このまま Phase 1 以降を進めると、既存の v1 設定の上に v2 が重なり混在状態になる可能性があります。');
    console.log('    先に migration/MIGRATION_GUIDE_v1_to_v2.0.1.md を参照してください。');
    console.log('');
  }
})();

// ===========================
// 存在チェック
// ===========================
console.log('[存在チェック]');

// 1. .secretlintrc.json
const secretlintrcExists = fileExists('.secretlintrc.json');
checkResult(secretlintrcExists, '.secretlintrc.json' + (!secretlintrcExists ? ' — ファイルが見つかりません' : ''));
checks.existence.push({ name: '.secretlintrc.json', exists: secretlintrcExists });

// 2. gitleaks.toml
const gitleaksTomlExists = fileExists('gitleaks.toml');
checkResult(gitleaksTomlExists, 'gitleaks.toml' + (!gitleaksTomlExists ? ' — ファイルが見つかりません' : ''));
checks.existence.push({ name: 'gitleaks.toml', exists: gitleaksTomlExists });

// 3. .git/hooks/pre-commit
const gitHookExists = fileExists('.git/hooks/pre-commit');
checkResult(gitHookExists, '.git/hooks/pre-commit' + (!gitHookExists ? ' — ファイルが見つかりません（npx simple-git-hooks を実行してください）' : ''));
checks.existence.push({ name: '.git/hooks/pre-commit', exists: gitHookExists });

// 4. package.json の simple-git-hooks 設定
const packageJsonExists = fileExists('package.json');
let simpleGitHooksExists = false;
let packageJsonData = null;
if (packageJsonExists) {
  const packageJson = readFile('package.json');
  if (packageJson) {
    try {
      packageJsonData = JSON.parse(packageJson);
      simpleGitHooksExists = !!packageJsonData['simple-git-hooks'];
    } catch (e) {
      // parse error
    }
  }
}
checkResult(simpleGitHooksExists, 'package.json simple-git-hooks 設定' + (!simpleGitHooksExists ? ' — 設定が見つかりません' : ''));
checks.existence.push({ name: 'simple-git-hooks', exists: simpleGitHooksExists });

// 5. package.json の npm scripts
const requiredScripts = [
  'security:verify',
  'security:verify:simple',
  'security:verify:testrun',
  'security:install-gitleaks'
];

let scriptsCheckPassed = true;
const missingScripts = [];

if (packageJsonData && packageJsonData.scripts) {
  for (const scriptName of requiredScripts) {
    if (!packageJsonData.scripts[scriptName]) {
      scriptsCheckPassed = false;
      missingScripts.push(scriptName);
    }
  }
}

if (scriptsCheckPassed && packageJsonData) {
  checkResult(true, 'package.json に必須 npm scripts あり');
} else {
  checkResult(false, `package.json に必須 npm scripts — 不足: ${missingScripts.join(', ')}`);
}
checks.existence.push({ name: 'npm-scripts', exists: scriptsCheckPassed });

console.log('');

// ===========================
// 中身チェック
// ===========================
console.log('[中身チェック]');

// 6. .secretlintrc.json の内容
if (secretlintrcExists) {
  const secretlintrc = readFile('.secretlintrc.json');
  const hasPresetRecommend = secretlintrc && secretlintrc.includes('preset-recommend');
  checkResult(hasPresetRecommend, '.secretlintrc.json に preset-recommend' + (hasPresetRecommend ? ' あり' : ' が含まれていません'));
} else {
  checkResult(false, '.secretlintrc.json — 存在チェックが ❌ のためスキップ', 'skip');
}

// 7. gitleaks.toml の内容
if (gitleaksTomlExists) {
  const gitleaksToml = readFile('gitleaks.toml');
  // [allowlist] だけで [extend]/[rules] が無いと検出ルール 0 個で動作してしまう。
  // 「空でないこと」だけの確認では見逃すため、検出ルールの有無を確認する。
  const hasRules = gitleaksToml && (/\[extend\]/.test(gitleaksToml) || /\[\[rules\]\]/.test(gitleaksToml));
  checkResult(hasRules, 'gitleaks.toml に検出ルール（[extend] または [[rules]]）' +
    (hasRules ? ' あり' : ' が見つかりません — [allowlist] のみの場合、検出ルール 0 個で動作します'));
} else {
  checkResult(false, 'gitleaks.toml — 存在チェックが ❌ のためスキップ', 'skip');
}

// 8. .git/hooks/pre-commit の内容
if (gitHookExists) {
  const precommit = readFile('.git/hooks/pre-commit');
  const hasPreCommitJs = precommit && precommit.includes('pre-commit.js');
  const hasSuppression = precommit && /\|\|\s*true/.test(precommit);
  if (hasSuppression) {
    checkResult(false, '.git/hooks/pre-commit — || true が含まれており exit code が握りつぶされています（コミットがブロックされません）');
  } else {
    checkResult(hasPreCommitJs, '.git/hooks/pre-commit に pre-commit.js' + (hasPreCommitJs ? ' あり' : ' が含まれていません'));
  }
} else {
  checkResult(false, '.git/hooks/pre-commit — 存在チェックが ❌ のためスキップ', 'skip');
}

console.log('');

// ===========================
// 動作チェック
// ===========================
console.log('[動作チェック]');

// 9. secretlint
const secretlintVersion = execCommand('npx secretlint --version');
if (secretlintVersion) {
  checkResult(true, `secretlint ${secretlintVersion}`);
} else {
  checkResult(false, 'secretlint — コマンドが見つかりません');
}

// 10. gitleaks バイナリ（bin/gitleaks のみをチェック）
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'gitleaks.exe' : 'gitleaks';
const localBinary = path.join(process.cwd(), 'bin', binaryName);

let gitleaksVersion = null;
if (fs.existsSync(localBinary)) {
  gitleaksVersion = execCommand(`"${localBinary}" version`);
  if (gitleaksVersion) {
    checkResult(true, `gitleaks ${gitleaksVersion}`);
  } else {
    checkResult(false, `gitleaks — bin/${binaryName} が実行できません（実行権限またはバイナリが壊れている可能性）`);
  }
} else {
  checkResult(false, `gitleaks — bin/${binaryName} が見つかりません（node scripts/install-gitleaks.js で導入してください）`);
}

// 11. gitleaks 機能的カナリアテスト
// 「[extend]/[rules] という文字列が書いてある」だけでは、実際に検出ルールが
// 機能しているかは分からない（存在確認・内容確認と動作確認は別物）。
// 合成シークレットを実際にスキャンし、検出できるかで確認する。
if (gitleaksVersion) {
  // 相対パスで指定する（絶対パスを渡すと、プロジェクトが "/tmp/..." 配下に
  // チェックアウトされている場合などに gitleaks.toml の allowlist paths
  // "tmp/.*" に誤爆し、カナリア自体が除外されてしまう）
  const canaryDirName = '.security-verify-canary';
  const canaryDir = path.join(process.cwd(), canaryDirName);
  const canaryFile = path.join(canaryDir, 'canary.env');
  // allowlist の regexes（YOUR_TOKEN_HERE, xxxxxx 等）に一致しない合成値
  const CANARY_SECRET = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'; // gitleaks:allow secretlint-disable-line

  try {
    fs.mkdirSync(canaryDir, { recursive: true });
    fs.writeFileSync(canaryFile, `GITHUB_PAT=${CANARY_SECRET}\n`);

    const gitleaksBinaryPath = fs.existsSync(localBinary) ? `"${localBinary}"` : 'gitleaks';
    const canaryCmd = `${gitleaksBinaryPath} dir "${canaryDirName}" --config gitleaks.toml --redact`;

    try {
      execSync(canaryCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      checkResult(false, 'gitleaks 機能的カナリアテスト — 合成シークレットが検出されませんでした（検出ルールが無効化されている可能性）');
    } catch (e) {
      if (e.status === 1) {
        checkResult(true, 'gitleaks 機能的カナリアテスト — 合成シークレットを正しく検出');
      } else {
        checkResult(false, `gitleaks 機能的カナリアテスト — 予期しないエラー（exit ${e.status}）`);
      }
    }
  } finally {
    fs.rmSync(canaryDir, { recursive: true, force: true });
  }
} else {
  checkResult(false, 'gitleaks 機能的カナリアテスト — gitleaks が未導入のためスキップ', 'skip');
}

// 12. 実行ログの最終確認
const logFile = path.join(process.cwd(), '.logs', 'pre-commit.log');
if (fs.existsSync(logFile)) {
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length > 0) {
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      const date = new Date(last.timestamp);
      const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = last.timestamp.slice(0, 10);
      if (daysDiff === 0) {
        checkResult(true, `実行ログ — 最終実行: ${dateStr} 本日 (${last.result})`);
      } else if (daysDiff <= 7) {
        checkResult(true, `実行ログ — 最終実行: ${dateStr} ${daysDiff}日前 (${last.result})`);
      } else {
        checkResult(false, `実行ログ — 最終実行: ${dateStr} ${daysDiff}日前 (${last.result}) — 長期間動いていない可能性`, 'warning');
      }
    } catch (e) {
      checkResult(false, '実行ログ — 解析エラー');
    }
  } else {
    checkResult(false, '実行ログ — ログが空です（一度も動いていない可能性）');
  }
} else {
  checkResult(false, '実行ログ — .logs/pre-commit.log が見つかりません（一度もコミットしていない可能性）');
}

// 13. ネガティブテスト実行痕跡（カナリアblocked）
// 「実行ログが新しい」だけでは、Step 3.6.5のネガティブテスト（シークレットが
// 実際にブロックされるかの確認）が一度でも実行されたかは分からない。
// pre-commit.js は .test-secret-canary がステージされたコミットを type: 'canary'
// としてログに記録するため、その痕跡の有無で確認する（集計数字ではなく事実で判定する）。
if (fs.existsSync(logFile)) {
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  const canaryEntries = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(entry => entry && entry.type === 'canary');

  const passedCanary = canaryEntries.find(entry => entry.result === 'passed');
  const blockedCanary = canaryEntries.slice().reverse().find(entry => entry.result === 'failed');

  if (passedCanary) {
    checkResult(false, `ネガティブテスト実行痕跡 — カナリアがブロックされずコミットされた形跡があります（${passedCanary.timestamp}）。pre-commit フックが機能していない可能性`);
  } else if (blockedCanary) {
    checkResult(true, `ネガティブテスト実行痕跡 — ${blockedCanary.timestamp.slice(0, 10)} にカナリアがブロックされたことを確認`);
  } else {
    checkResult(false, 'ネガティブテスト実行痕跡 — Step 3.6.5のネガティブテストが実行された形跡がありません', 'warning');
  }
} else {
  checkResult(false, 'ネガティブテスト実行痕跡 — .logs/pre-commit.log が見つかりません', 'skip');
}

console.log('');

// ===========================
// 結果サマリー
// ===========================
console.log('================================');
console.log(`結果: ${results.passed}/13 passed, ${results.failed} failed, ${results.warning} warning${results.skipped > 0 ? `, ${results.skipped} skipped` : ''}`);

if (results.failed > 0) {
  console.log('\n❌ ヘルスチェックに問題があります。まず設定を修正してください。');
  process.exit(1);
}

console.log('\n✅ ヘルスチェック完了');

// ===========================
// テストラン（--test-run または --simple フラグ時のみ）
// ===========================
if (testRun || simpleRun) {
  if (testRun) {
    console.log('\n🧪 実際のスキャンをテスト実行します（全ファイル + 全履歴）...\n');
  } else {
    console.log('\n🧪 シンプルテスト実行します（staged ファイルのみ）...\n');
  }

  const testResults = {
    secretlint: { passed: false, output: '' },
    gitleaks: { passed: false, output: '' }
  };

  // secretlint テスト
  console.log('[secretlint テスト]');
  const secretlintCmd = 'npx secretlint "**/*"';
  console.log(`  ${secretlintCmd}`);
  try {
    const output = execSync(secretlintCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    testResults.secretlint.passed = true;
    testResults.secretlint.output = output;
    console.log('  → ✅ 0 件検出');
  } catch (e) {
    const output = e.stdout || e.stderr || e.message;
    testResults.secretlint.output = output;

    const lines = output.split('\n');
    const errorCount = lines.filter(line => line.includes('Error:')).length;

    if (errorCount > 0) {
      console.log(`  → ⚠️  ${errorCount} 件検出`);
      console.log('\n  検出内容:');
      console.log(output.split('\n').slice(0, 20).map(l => '    ' + l).join('\n'));
      if (lines.length > 20) {
        console.log('    ...(残り省略)');
      }
    } else {
      console.log('  → ✅ 0 件検出');
      testResults.secretlint.passed = true;
    }
  }

  console.log('');

  // gitleaks テスト（バイナリがある場合のみ）
  if (gitleaksVersion) {
    console.log('[gitleaks テスト]');

    // gitleaks 8.28+ では detect/protect が --help から非表示になった非推奨コマンドのため、
    // 後継の git サブコマンドを使用する（--staged: ステージ済みのみ / 無指定: 全履歴）
    // --redact: 検出時に実際のシークレット値をログ・標準出力に出さないため（AIとの会話や
    // ノートへの貼り付けが新たな漏洩経路にならないようにする）
    const gitleaksCmd = fs.existsSync(localBinary)
      ? (simpleRun
          ? `"${localBinary}" git --staged -v --config gitleaks.toml --redact .`
          : `"${localBinary}" git -v --config gitleaks.toml --redact .`)
      : (simpleRun
          ? 'gitleaks git --staged -v --config gitleaks.toml --redact .'
          : 'gitleaks git -v --config gitleaks.toml --redact .');

    console.log(`  ${gitleaksCmd}`);

    try {
      const output = execSync(gitleaksCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      testResults.gitleaks.passed = true;
      testResults.gitleaks.output = output;
      console.log('  → ✅ 0 件検出');
    } catch (e) {
      const output = e.stdout || e.stderr || e.message;
      testResults.gitleaks.output = output;

      if (e.status === 1 && output.includes('Finding:')) {
        const findings = (output.match(/Finding:/g) || []).length;
        console.log(`  → ⚠️  ${findings} 件検出`);
        console.log('\n  検出内容:');
        console.log(output.split('\n').slice(0, 30).map(l => '    ' + l).join('\n'));
        if (output.split('\n').length > 30) {
          console.log('    ...(残り省略)');
        }
      } else {
        console.log('  → ✅ 0 件検出');
        testResults.gitleaks.passed = true;
      }
    }
  } else {
    console.log('[gitleaks テスト]');
    console.log('  ⏭️  gitleaks が未導入のためスキップ');
  }

  console.log('\n================================');

  const secretlintOk = testResults.secretlint.passed;
  const gitleaksOk = !gitleaksVersion || testResults.gitleaks.passed;

  if (secretlintOk && gitleaksOk) {
    console.log('テスト結果: ✅ 問題なし');
    process.exit(0);
  } else {
    console.log('テスト結果: ⚠️  要確認（上記の検出内容を AI に報告してください）');
    process.exit(0);
  }
} else {
  process.exit(0);
}
