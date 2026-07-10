const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running pre-commit checks...');

const LOG_FILE = path.join(process.cwd(), '.logs', 'pre-commit.log');
const MAX_LOG_ENTRIES = 50;
// setup-securecheck.md ステップ3.6.5のネガティブテストが使うファイル名。
// これがステージされている＝人間が意図的にネガティブテストを実行中、という合図。
const CANARY_FILENAME = '.test-secret-canary';

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

function writeLog(result, isCanary) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    result,
    branch: getBranch(),
    ...(isCanary ? { type: 'canary' } : {})
  });

  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  let entries = [];
  if (fs.existsSync(LOG_FILE)) {
    entries = fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim());
  }

  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries = entries.slice(entries.length - MAX_LOG_ENTRIES);
  }

  fs.writeFileSync(LOG_FILE, entries.join('\n') + '\n');
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

let isCanaryTest = false;

try {
  let secretlintOk = true;
  let gitleaksOk = true;

  console.log('\n=== secretlint ===');

  // staged ファイルのみをスキャン（gitleaks --staged と対称）
  const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);

  isCanaryTest = staged.includes(CANARY_FILENAME);

  if (staged.length === 0) {
    console.log('ステージされたファイルがないため secretlint をスキップします');
  } else {
    // secretlint が失敗しても gitleaks を実行できるよう、ここで結果を確定させる
    // （secretlint と gitleaks は独立した検出エンジンのため、片方の失敗で
    // もう片方の実行を止めてはいけない）
    try {
      // Windows のコマンドライン長制限を避けるため 100 件ずつ分割
      for (const files of chunk(staged, 100)) {
        execSync(`npx secretlint ${files.map(f => `"${f}"`).join(' ')}`, { stdio: 'inherit' });
      }
    } catch (e) {
      secretlintOk = false;
    }
  }

  console.log('\n=== gitleaks ===');

  // Find gitleaks binary: ./bin/gitleaks → global gitleaks → skip
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'gitleaks.exe' : 'gitleaks';
  const localBinary = path.join(process.cwd(), 'bin', binaryName);

  let gitleaksCommand = null;

  // --redact: 検出時にシークレット値をターミナルにそのまま出さないため
  if (fs.existsSync(localBinary)) {
    gitleaksCommand = `"${localBinary}" git --staged --config gitleaks.toml --redact .`;
  } else {
    try {
      execSync('gitleaks version', { stdio: 'pipe' });
      gitleaksCommand = 'gitleaks git --staged --config gitleaks.toml --redact .';
    } catch (e) {
      // gitleaks not found
    }
  }

  if (gitleaksCommand) {
    try {
      execSync(gitleaksCommand, { stdio: 'inherit' });
    } catch (e) {
      gitleaksOk = false;
    }
  } else {
    console.log('⚠️  gitleaks not found — secretlint のみでコミットを続行します');
    console.log('    gitleaks を導入するには: node scripts/install-gitleaks.js');
  }

  const passed = secretlintOk && gitleaksOk;
  writeLog(passed ? 'passed' : 'failed', isCanaryTest);

  if (passed) {
    console.log('\n✅ All checks passed');
    process.exit(0);
  }

  const failedTools = [!secretlintOk && 'secretlint', !gitleaksOk && 'gitleaks'].filter(Boolean).join(', ');
  console.error(`\n❌ Pre-commit checks failed (${failedTools})`);
  process.exit(1);
} catch (e) {
  writeLog('failed', isCanaryTest);
  console.error('\n❌ Pre-commit checks failed (unexpected error)');
  console.error(e.message || e);
  process.exit(1);
}
