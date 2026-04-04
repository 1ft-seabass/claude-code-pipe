#!/usr/bin/env node

/**
 * Sync from develop to main branch
 *
 * このスクリプトは develop ブランチから main ブランチへ
 * 利用者向けファイルのみを同期します。
 *
 * 使い方:
 *   npm run sync-to-main
 *
 * 前提条件:
 *   - develop ブランチで実行すること
 *   - コミットされていない変更がないこと
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { detectMainWorktree } = require('../src/git-info');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(cmd, options = {}) {
  const silent = options.silent || false;
  if (!silent) {
    log(`$ ${cmd}`, 'cyan');
  }
  try {
    return execSync(cmd, { encoding: 'utf8', ...options });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return '';
  }
}

// develop から main へ同期するファイルのリスト
const filesToSync = [
  // ソースコード
  'src/',

  // ドキュメント
  'README.md',
  'README-ja.md',
  'DETAILS.md',
  'DETAILS-ja.md',
  'LICENSE',

  // 設定ファイル
  'config.example.json',
  '.gitignore',

  // 依存関係
  'package.json',
  'package-lock.json',
];

function checkCurrentBranch() {
  const currentBranch = exec('git branch --show-current', { silent: true }).trim();

  if (currentBranch !== 'develop') {
    log('❌ Error: Must be on develop branch', 'red');
    log(`   Current branch: ${currentBranch}`, 'yellow');
    log('   Run: git checkout develop', 'yellow');
    process.exit(1);
  }

  log('✓ Current branch: develop', 'green');
}

function checkUncommittedChanges() {
  const status = exec('git status --porcelain', { silent: true }).trim();

  if (status) {
    log('❌ Error: Uncommitted changes found', 'red');
    log('   Please commit or stash your changes first', 'yellow');
    log('', 'reset');
    log(status, 'yellow');
    process.exit(1);
  }

  log('✓ No uncommitted changes', 'green');
}

function updateDevelop() {
  log('\n📥 Updating develop branch...', 'blue');
  exec('git pull origin develop');
  log('✓ develop branch updated', 'green');
}

function switchToMain() {
  log('\n🔀 Detecting main branch worktree...', 'blue');

  // worktree 環境をチェック
  const mainWorktreePath = detectMainWorktree();

  if (mainWorktreePath) {
    log(`✓ Detected worktree: ${mainWorktreePath}`, 'green');
    return mainWorktreePath;
  }

  // worktree が見つからない場合はエラー
  log('❌ Error: main branch worktree not found', 'red');
  log('', 'reset');
  log('This script requires a worktree setup for the main branch.', 'yellow');
  log('', 'reset');
  log('To set up a worktree:', 'cyan');
  log('  git worktree add ../claude-code-pipe main', 'cyan');
  log('', 'reset');
  log('This will create the main branch worktree in the parent directory.', 'yellow');
  log('After setup, the directory structure will be:', 'yellow');
  log('  /path/to/claude-code-pipe-develop  ← develop branch', 'yellow');
  log('  /path/to/claude-code-pipe          ← main branch (worktree)', 'yellow');
  process.exit(1);
}

function syncFiles(mainPath) {
  log('\n📋 Syncing files from develop...', 'blue');

  const isWorktree = mainPath !== null;
  const targetDir = mainPath || process.cwd();

  if (isWorktree) {
    // worktree モード: ファイルシステムで直接コピー
    log('   Using filesystem copy (worktree mode)', 'cyan');

    // main ディレクトリ内の既存ファイルを削除（.git 以外）
    const itemsToDelete = fs.readdirSync(mainPath).filter(item => item !== '.git');
    itemsToDelete.forEach(item => {
      const itemPath = path.join(mainPath, item);
      log(`   Removing: ${item}`, 'cyan');
      fs.rmSync(itemPath, { recursive: true, force: true });
    });

    // develop から指定ファイルをコピー
    const developPath = process.cwd();
    filesToSync.forEach(file => {
      const sourcePath = path.join(developPath, file);
      const targetPath = path.join(mainPath, file);

      if (fs.existsSync(sourcePath)) {
        log(`   Copying: ${file}`, 'cyan');

        // ディレクトリの場合
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          fs.cpSync(sourcePath, targetPath, { recursive: true });
        } else {
          // ファイルの場合
          const targetDirPath = path.dirname(targetPath);
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
          }
          fs.copyFileSync(sourcePath, targetPath);
        }
      } else {
        log(`   ⚠️  Skipping (not found): ${file}`, 'yellow');
      }
    });
  } else {
    // 通常モード: git コマンドで同期
    log('   Using git checkout (normal mode)', 'cyan');

    // main ブランチの既存ファイルをすべて削除（.git 以外）
    log('   Cleaning main branch...', 'cyan');
    exec('git rm -rf . 2>/dev/null || true', { silent: true });

    // develop から指定ファイルをコピー
    filesToSync.forEach(file => {
      const exists = exec(`git show develop:${file} 2>/dev/null || echo ""`, { silent: true, ignoreError: true }).trim();

      if (exists) {
        log(`   Copying: ${file}`, 'cyan');
        exec(`git checkout develop -- ${file}`);
      } else {
        log(`   ⚠️  Skipping (not found): ${file}`, 'yellow');
      }
    });
  }

  log('✓ Files synced', 'green');
}

function cleanPackageJson(mainPath) {
  log('\n🧹 Cleaning package.json...', 'blue');

  const targetDir = mainPath || process.cwd();
  const pkgPath = path.join(targetDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    log('   ⚠️  package.json not found, skipping...', 'yellow');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // devDependencies を削除
  if (pkg.devDependencies) {
    log('   Removing devDependencies', 'cyan');
    delete pkg.devDependencies;
  }

  // 開発用スクリプトを削除
  if (pkg.scripts) {
    const scriptsToRemove = [
      'prepare',           // husky
      'sync-to-main',      // このスクリプト自体
      'commit-main',       // 開発用コミットウィザード
    ];

    scriptsToRemove.forEach(script => {
      if (pkg.scripts[script]) {
        log(`   Removing script: ${script}`, 'cyan');
        delete pkg.scripts[script];
      }
    });

    // 開発用スクリプトのパターンで削除
    Object.keys(pkg.scripts).forEach(key => {
      // husky, secretlint, gitleaks, security, tmux 関連のスクリプトを削除
      if (
        key.includes('husky') ||
        key.includes('secretlint') ||
        key.includes('gitleaks') ||
        key.startsWith('secret-scan') ||
        key.startsWith('security:') ||
        key.startsWith('dev:tmux:')
      ) {
        log(`   Removing script: ${key}`, 'cyan');
        delete pkg.scripts[key];
      }
    });
  }

  // lint-staged 設定を削除（開発用）
  if (pkg['lint-staged']) {
    log('   Removing lint-staged config', 'cyan');
    delete pkg['lint-staged'];
  }

  // 整形して保存
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  log('✓ package.json cleaned', 'green');
}

function showDiff(mainPath) {
  log('\n📊 Changes:', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    // worktree モード: main ディレクトリで git status を確認
    const originalDir = process.cwd();
    process.chdir(mainPath);

    const status = exec('git status --short', { silent: true }).trim();

    if (status) {
      console.log(status);
    } else {
      log('   No changes', 'yellow');
    }

    process.chdir(originalDir);
  } else {
    // 通常モード
    const diff = exec('git diff --stat', { silent: true }).trim();

    if (diff) {
      console.log(diff);
    } else {
      log('   No changes', 'yellow');
    }

    const status = exec('git status --short', { silent: true }).trim();

    if (status) {
      log('\n📝 File status:', 'blue');
      console.log(status);
    }
  }
}

function stageChanges(mainPath) {
  log('\n📦 Staging changes...', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    // worktree モード: main ディレクトリで git add を実行
    const addCmd = `git -C ${mainPath} add .`;
    log(`   $ ${addCmd}`, 'cyan');
    execSync(addCmd, { encoding: 'utf8' });
    log('✓ Changes staged in main worktree', 'green');
  } else {
    // 通常モード: カレントディレクトリで git add を実行
    exec('git add .');
    log('✓ Changes staged', 'green');
  }
}

function showNextSteps(mainPath) {
  log('\n✅ Sync completed!', 'green');
  log('\n📌 Next steps:', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    log('   1. Commit and push using the wizard:', 'yellow');
    log('      npm run commit-main', 'cyan');
    log('', 'reset');
    log('   Or manually:', 'yellow');
    log(`      git -C ${mainPath} commit -m "sync: vX.Y.Z from develop"`, 'cyan');
    log(`      git -C ${mainPath} push origin main`, 'cyan');
    log('', 'reset');
  } else {
    log('   1. Review changes:', 'yellow');
    log('      git diff --staged', 'cyan');
    log('', 'reset');
    log('   2. Commit and push:', 'yellow');
    log('      git commit -m "sync: vX.Y.Z from develop"', 'cyan');
    log('      git push origin main', 'cyan');
    log('', 'reset');
    log('   3. Return to develop:', 'yellow');
    log('      git checkout develop', 'cyan');
    log('', 'reset');
  }
}

function main() {
  log('🔄 Syncing develop → main', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    // 安全性チェック
    checkCurrentBranch();
    checkUncommittedChanges();

    // 最新化
    updateDevelop();

    // main ブランチへ切り替え（worktree の場合はパスを返す）
    const mainPath = switchToMain();

    // ファイル同期
    syncFiles(mainPath);

    // package.json のクリーンアップ
    cleanPackageJson(mainPath);

    // 差分表示
    showDiff(mainPath);

    // 変更をステージング（git add まで実行）
    stageChanges(mainPath);

    // 次のステップを表示
    showNextSteps(mainPath);

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stderr) {
      console.error(error.stderr);
    }
    process.exit(1);
  }
}

main();
