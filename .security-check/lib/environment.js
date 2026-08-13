// pre-commit / verify 双方が参照する環境判定を1箇所に集約するモジュール。
// 以前は scripts/pre-commit.js と scripts/security-verify.js がそれぞれ
// 別々に（別基準で）gitleaks の有無を判定しており、この分散自体が
// 「gitleaksが導入されていないのに気づかれない」状態を生む土壌になっていた。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SECURITY_CHECK_DIR = path.join(process.cwd(), '.security-check');
const BIN_DIR = path.join(SECURITY_CHECK_DIR, 'bin');
const LOG_DIR = path.join(SECURITY_CHECK_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pre-commit.log');

const isWindows = process.platform === 'win32';
const GITLEAKS_BINARY_NAME = isWindows ? 'gitleaks.exe' : 'gitleaks';
const GITLEAKS_LOCAL_PATH = path.join(BIN_DIR, GITLEAKS_BINARY_NAME);

// gitleaks バイナリを探す: .security-check/bin/gitleaks → グローバル gitleaks → 見つからない
// pre-commit と verify が同じ結果を返すよう、探索ロジックはここ1箇所にのみ実装する。
function findGitleaksBinary() {
  if (fs.existsSync(GITLEAKS_LOCAL_PATH)) {
    return { command: `"${GITLEAKS_LOCAL_PATH}"`, source: 'local', path: GITLEAKS_LOCAL_PATH };
  }
  try {
    execSync('gitleaks version', { stdio: 'pipe' });
    return { command: 'gitleaks', source: 'global', path: null };
  } catch (e) {
    return null;
  }
}

function getSecretlintVersion() {
  try {
    return execSync('npx secretlint --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// husky/lint-staged ベースの v1 構成の検出。
// version-detect/scripts/detect-version.js と判定ロジックを同一に保つこと。
function detectLegacyV1() {
  const pkg = readJson(path.join(process.cwd(), 'package.json'));
  const hasHusky = !!(pkg && ((pkg.devDependencies && pkg.devDependencies['husky']) || (pkg.dependencies && pkg.dependencies['husky'])));
  const hasLintStaged = !!(pkg && ((pkg.devDependencies && pkg.devDependencies['lint-staged']) || (pkg.dependencies && pkg.dependencies['lint-staged']) || pkg['lint-staged']));
  const huskyDirExists = fs.existsSync(path.join(process.cwd(), '.husky'));

  const reasons = [];
  if (hasHusky) reasons.push('husky が devDependencies に存在');
  if (hasLintStaged) reasons.push('lint-staged が devDependencies/設定に存在');
  if (huskyDirExists) reasons.push('.husky/ ディレクトリが存在');

  return { detected: reasons.length > 0, reasons };
}

// v2構成（scripts/pre-commit.js を simple-git-hooks から直接呼ぶ旧レイアウト）の検出。
// .security-check/ が無いのに、旧エントリポイントの痕跡だけが残っている状態を拾う。
function detectLegacyV2() {
  const pkg = readJson(path.join(process.cwd(), 'package.json'));
  const securityCheckExists = fs.existsSync(SECURITY_CHECK_DIR);
  if (securityCheckExists) {
    return { detected: false, reasons: [] };
  }

  const reasons = [];
  const oldScriptExists = fs.existsSync(path.join(process.cwd(), 'scripts', 'pre-commit.js'));
  if (oldScriptExists) reasons.push('scripts/pre-commit.js が存在（.security-check/ 移行前のレイアウト）');

  const hookConfig = pkg && pkg['simple-git-hooks'] && pkg['simple-git-hooks']['pre-commit'];
  if (hookConfig && /scripts\/pre-commit\.js/.test(hookConfig)) {
    reasons.push(`package.json の simple-git-hooks.pre-commit が旧パスを指している（${hookConfig}）`);
  }

  return { detected: reasons.length > 0, reasons };
}

module.exports = {
  SECURITY_CHECK_DIR,
  BIN_DIR,
  LOG_DIR,
  LOG_FILE,
  GITLEAKS_BINARY_NAME,
  findGitleaksBinary,
  getSecretlintVersion,
  detectLegacyV1,
  detectLegacyV2,
  readJson,
};
