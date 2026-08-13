const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SECURITY_CHECK_DIR, readJson } = require('./environment');

const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
const MANAGED_DEV_DEPS = ['secretlint', '@secretlint/secretlint-rule-preset-recommend', 'simple-git-hooks'];
const MANAGED_POSTINSTALL = 'npx simple-git-hooks';

function resolveGitHookPath(hookName) {
  try {
    const resolved = execSync(`git rev-parse --git-path hooks/${hookName}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return path.isAbsolute(resolved) ? resolved : path.join(process.cwd(), resolved);
  } catch (e) {
    return path.join(process.cwd(), '.git', 'hooks', hookName);
  }
}

function planPackageJsonChanges(pkg) {
  const removals = [];
  if (pkg.scripts && pkg.scripts.security && /\.security-check\/cli\.js/.test(pkg.scripts.security)) {
    removals.push('scripts.security');
  }
  if (pkg.scripts && pkg.scripts.postinstall === MANAGED_POSTINSTALL) {
    removals.push('scripts.postinstall');
  }
  if (pkg['simple-git-hooks'] && pkg['simple-git-hooks']['pre-commit']) {
    removals.push("simple-git-hooks['pre-commit']");
  }
  for (const dep of MANAGED_DEV_DEPS) {
    if (pkg.devDependencies && pkg.devDependencies[dep]) {
      removals.push(`devDependencies['${dep}']`);
    }
  }
  return removals;
}

function applyPackageJsonChanges(pkg) {
  if (pkg.scripts && pkg.scripts.security && /\.security-check\/cli\.js/.test(pkg.scripts.security)) {
    delete pkg.scripts.security;
  }
  if (pkg.scripts && pkg.scripts.postinstall === MANAGED_POSTINSTALL) {
    delete pkg.scripts.postinstall;
  }
  if (pkg['simple-git-hooks']) {
    delete pkg['simple-git-hooks']['pre-commit'];
    if (Object.keys(pkg['simple-git-hooks']).length === 0) {
      delete pkg['simple-git-hooks'];
    }
  }
  if (pkg.devDependencies) {
    for (const dep of MANAGED_DEV_DEPS) {
      delete pkg.devDependencies[dep];
    }
  }
  return pkg;
}

function run(args) {
  const apply = args.includes('--yes');

  const pkg = readJson(PACKAGE_JSON_PATH);
  if (!pkg) {
    console.error('❌ package.json が見つからないか解析できません');
    return 1;
  }

  const securityCheckDirExists = fs.existsSync(SECURITY_CHECK_DIR);
  const hookPath = resolveGitHookPath('pre-commit');
  const hookExists = fs.existsSync(hookPath);
  const removals = planPackageJsonChanges(pkg);

  console.log('🗑️  setup-securecheck アンインストール計画\n');
  console.log(`  ${securityCheckDirExists ? '削除' : '(存在しません)'}: .security-check/`);
  console.log(`  ${hookExists ? '削除' : '(存在しません)'}: ${path.relative(process.cwd(), hookPath)}`);
  if (removals.length > 0) {
    console.log('  package.json から削除:');
    for (const r of removals) console.log(`    - ${r}`);
  } else {
    console.log('  package.json — このパターンが管理するキーは見つかりませんでした');
  }
  console.log('\n  ⚠️  gitleaks.toml / .secretlintrc.json はユーザー編集対象の設定ファイルのため削除しません（不要であれば手動で削除してください）');

  if (!apply) {
    console.log('\nこれはドライランです。実際に削除するには --yes を付けて再実行してください:');
    console.log('  node .security-check/cli.js uninstall --yes');
    return 0;
  }

  console.log('\n実行します...');

  if (removals.length > 0) {
    const updated = applyPackageJsonChanges(pkg);
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log('  ✅ package.json を更新しました');
  }

  if (hookExists) {
    try {
      fs.rmSync(hookPath, { force: true });
      console.log('  ✅ git hook を削除しました');
    } catch (e) {
      console.error(`  ❌ git hook の削除に失敗しました: ${e.message}`);
      return 1;
    }
  }

  // .security-check/ の自己削除は最後に行う（cli.js 自身がこのディレクトリ内にあるため、
  // 他の後片付けを全て終えた後に実行する）。
  if (securityCheckDirExists) {
    try {
      fs.rmSync(SECURITY_CHECK_DIR, { recursive: true, force: true });
      console.log('  ✅ .security-check/ を削除しました');
    } catch (e) {
      console.error(`  ❌ .security-check/ の削除に失敗しました: ${e.message}`);
      console.error('    手動で削除してください: rm -rf .security-check');
      return 1;
    }
  }

  console.log('\n✅ アンインストール完了。`npm install` を実行して devDependencies を実際に取り除いてください。');
  return 0;
}

module.exports = { run };
