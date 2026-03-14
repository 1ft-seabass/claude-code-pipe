#!/usr/bin/env node

/**
 * Commit and push wizard for main branch
 *
 * このスクリプトは main ブランチへのコミット・プッシュを
 * 対話的に行うウィザードです。
 *
 * 使い方:
 *   npm run commit-main
 *
 * 前提条件:
 *   - develop ブランチで実行すること
 *   - main ブランチに変更がステージングされていること
 */

const readline = require('readline');
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
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(cmd, options = {}) {
  const silent = options.silent || false;
  if (!silent) {
    log(`$ ${cmd}`, 'gray');
  }
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit', ...options });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return '';
  }
}

// readline インターフェースを作成
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promise ベースの質問関数
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function checkMainBranchStatus(mainPath) {
  log('\n🔍 Checking main branch status...', 'blue');

  const isWorktree = mainPath !== null;

  let status;
  if (isWorktree) {
    status = execSync(`git -C ${mainPath} status --porcelain`, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } else {
    // 通常モード（現在 main ブランチにいると仮定）
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (currentBranch !== 'main') {
      log(`❌ Error: Must be on main branch (current: ${currentBranch})`, 'red');
      process.exit(1);
    }
    status = execSync('git status --porcelain', { encoding: 'utf8', stdio: 'pipe' }).trim();
  }

  if (!status) {
    log('ℹ️  No changes to commit in main branch', 'yellow');
    return false;
  }

  log('✓ Changes found in main branch', 'green');
  return true;
}

function showDiff(mainPath) {
  log('\n📊 Staged changes:', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    execSync(`git -C ${mainPath} diff --staged --stat`, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    execSync('git diff --staged --stat', { encoding: 'utf8', stdio: 'inherit' });
  }
}

async function selectPrefix() {
  log('\n📝 Select commit prefix:', 'blue');
  log('   [1] feat    - 新機能', 'cyan');
  log('   [2] fix     - バグ修正', 'cyan');
  log('   [3] docs    - ドキュメント', 'cyan');
  log('   [4] chore   - その他（ビルド、設定など）', 'cyan');
  log('   [5] sync    - develop からの同期', 'cyan');

  const answer = await question('\nSelect number [1-5]: ');

  const prefixMap = {
    '1': 'feat',
    '2': 'fix',
    '3': 'docs',
    '4': 'chore',
    '5': 'sync',
  };

  const prefix = prefixMap[answer.trim()];

  if (!prefix) {
    log('❌ Invalid selection', 'red');
    return selectPrefix(); // 再帰的に再入力を促す
  }

  return prefix;
}

async function inputMessage() {
  log('\n✍️  Enter commit message (Japanese):', 'blue');
  const message = await question('Message: ');

  if (!message.trim()) {
    log('❌ Message cannot be empty', 'red');
    return inputMessage(); // 再帰的に再入力を促す
  }

  return message.trim();
}

function previewCommitMessage(prefix, message) {
  log('\n👀 Commit message preview:', 'blue');
  log(`   ${prefix}: ${message}`, 'cyan');
}

async function confirmCommit() {
  const answer = await question('\nCommit with this message? [y/N]: ');
  return answer.toLowerCase() === 'y';
}

async function confirmPush() {
  const answer = await question('\nPush to origin/main? [y/N]: ');
  return answer.toLowerCase() === 'y';
}

function commitChanges(mainPath, prefix, message) {
  log('\n💾 Committing changes...', 'blue');

  const commitMessage = `${prefix}: ${message}`;
  const isWorktree = mainPath !== null;

  if (isWorktree) {
    const cmd = `git -C ${mainPath} commit -m "${commitMessage}"`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    const cmd = `git commit -m "${commitMessage}"`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  }

  log('✓ Committed successfully', 'green');
}

function pushChanges(mainPath) {
  log('\n📤 Pushing to origin/main...', 'blue');

  const isWorktree = mainPath !== null;

  if (isWorktree) {
    const cmd = `git -C ${mainPath} push origin main`;
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    const cmd = 'git push origin main';
    log(`$ ${cmd}`, 'gray');
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
  }

  log('✓ Pushed successfully', 'green');
}

async function main() {
  log('🧙 Main Branch Commit Wizard', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');

  try {
    // worktree 検出
    const mainPath = detectMainWorktree();

    if (mainPath) {
      log(`✓ Detected worktree: ${mainPath}`, 'green');
    } else {
      log('ℹ️  Using current branch (normal mode)', 'cyan');
    }

    // main ブランチの状態確認
    const hasChanges = checkMainBranchStatus(mainPath);

    if (!hasChanges) {
      log('\nℹ️  Nothing to commit. Run `npm run sync-to-main` first.', 'yellow');
      rl.close();
      process.exit(0);
    }

    // ステージング済みの差分を表示
    showDiff(mainPath);

    // コミットメッセージの入力
    const prefix = await selectPrefix();
    const message = await inputMessage();

    // プレビュー表示
    previewCommitMessage(prefix, message);

    // コミット確認
    const shouldCommit = await confirmCommit();

    if (!shouldCommit) {
      log('\n❌ Commit cancelled', 'yellow');
      rl.close();
      process.exit(0);
    }

    // コミット実行
    commitChanges(mainPath, prefix, message);

    // プッシュ確認
    const shouldPush = await confirmPush();

    if (shouldPush) {
      pushChanges(mainPath);
    } else {
      log('\nℹ️  Skipped push. You can push manually later:', 'yellow');
      if (mainPath) {
        log(`   git -C ${mainPath} push origin main`, 'cyan');
      } else {
        log('   git push origin main', 'cyan');
      }
    }

    log('\n✅ Done!', 'green');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stderr) {
      console.error(error.stderr);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
