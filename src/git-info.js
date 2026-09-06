/**
 * git-info.js - Git リポジトリ情報を取得するユーティリティ
 *
 * Git コマンドを安全に実行し、ブランチ名、コミットハッシュ、worktree 情報などを取得します。
 * エラーハンドリングにより、git が利用できない環境でも安全に動作します。
 */

const { execSync, execFileSync } = require('child_process');

/**
 * Git コマンドを実行するヘルパー関数
 * @param {string} command - 実行する git コマンド
 * @param {string} cwd - 作業ディレクトリ
 * @returns {string|null} - コマンドの出力、またはエラー時は null
 */
function execGitCommand(command, cwd) {
  try {
    const result = execSync(command, {
      cwd: cwd,
      encoding: 'utf8',
      stdio: 'pipe'  // エラー出力を抑制
    });
    return result.trimEnd();
  } catch (error) {
    // git コマンドが失敗した場合は null を返す（graceful degradation）
    return null;
  }
}

/**
 * プロジェクトの Git 情報を取得
 * @param {string} projectPath - プロジェクトのフルパス
 * @returns {object|null} - Git 情報オブジェクト、または git リポジトリでない場合は null
 *
 * 返り値の例:
 * {
 *   branch: "develop",
 *   commit: "28a74df",
 *   isWorktree: true,
 *   mainWorktreePath: "/home/node/workspace/repos/claude-code-pipe"
 * }
 */
function getGitInfo(projectPath) {
  if (!projectPath) {
    return null;
  }

  // git リポジトリかチェック
  const isGitRepo = execGitCommand('git rev-parse --git-dir', projectPath);
  if (!isGitRepo) {
    return null;
  }

  // ブランチ名を取得
  const branch = execGitCommand('git branch --show-current', projectPath);

  // コミットハッシュを取得 (短縮形)
  const commit = execGitCommand('git rev-parse --short HEAD', projectPath);

  // worktree 情報を取得
  const worktreeList = execGitCommand('git worktree list', projectPath);

  let isWorktree = false;
  let mainWorktreePath = null;

  if (worktreeList) {
    const lines = worktreeList.split('\n');
    isWorktree = lines.length > 1;  // 複数の worktree がある場合

    // main ブランチの worktree パスを探す
    for (const line of lines) {
      if (line.includes('[main]')) {
        const parts = line.split(/\s+/);
        mainWorktreePath = parts[0];
        break;
      }
    }
  }

  return {
    branch: branch || null,
    commit: commit || null,
    isWorktree: isWorktree,
    mainWorktreePath: mainWorktreePath
  };
}

/**
 * main ブランチの worktree パスを検出
 *
 * 既存スクリプト (sync-to-main.js, commit-main.js) との互換性のため。
 * 現在の作業ディレクトリから main ブランチの worktree を探します。
 *
 * @returns {string|null} - main ブランチの worktree パス、または null
 */
function detectMainWorktree() {
  try {
    const worktrees = execSync('git worktree list', { encoding: 'utf8', stdio: 'pipe' });
    const lines = worktrees.trim().split('\n');

    for (const line of lines) {
      if (line.includes('[main]')) {
        const mainPath = line.split(/\s+/)[0];
        return mainPath;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Git ステータス情報を取得
 * @param {string} projectPath - プロジェクトのフルパス
 * @returns {object|null}
 */
function getGitStatus(projectPath) {
  if (!projectPath) return null;

  const isGitRepo = execGitCommand('git rev-parse --git-dir', projectPath);
  if (!isGitRepo) return null;

  const branch = execGitCommand('git branch --show-current', projectPath);

  // ahead/behind
  let ahead = 0;
  let behind = 0;
  const aheadBehind = execGitCommand('git rev-list --left-right --count HEAD...@{u}', projectPath);
  if (aheadBehind) {
    const parts = aheadBehind.split('\t');
    ahead = parseInt(parts[0], 10) || 0;
    behind = parseInt(parts[1], 10) || 0;
  }

  // porcelain でファイル一覧
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const porcelain = execGitCommand('git status --porcelain', projectPath);
  if (porcelain) {
    for (const line of porcelain.split('\n')) {
      if (!line) continue;
      const xy = line.substring(0, 2);
      const file = line.substring(3);
      const x = xy[0]; // index
      const y = xy[1]; // worktree
      if (x !== ' ' && x !== '?') staged.push(file);
      if (y !== ' ' && y !== '?') unstaged.push(file);
      if (xy === '??') untracked.push(file);
    }
  }

  return {
    branch: branch || null,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0
  };
}

/**
 * Git ログを取得
 * @param {string} projectPath - プロジェクトのフルパス
 * @param {number} limit - 取得件数
 * @returns {object|null}
 */
function getGitLog(projectPath, limit = 20) {
  if (!projectPath) return null;

  const isGitRepo = execGitCommand('git rev-parse --git-dir', projectPath);
  if (!isGitRepo) return null;

  // unpushed コミットのハッシュ一覧
  const unpushedRaw = execGitCommand('git rev-list HEAD @{u}..HEAD', projectPath);
  const unpushedHashes = new Set(unpushedRaw ? unpushedRaw.split('\n').filter(Boolean) : []);

  const logRaw = execGitCommand(
    `git log -${limit} --format=%H%x1f%h%x1f%s%x1f%ai%x1f%an`,
    projectPath
  );

  const commits = [];
  if (logRaw) {
    for (const line of logRaw.split('\n')) {
      if (!line) continue;
      const [hash, shortHash, message, date, author] = line.split('\x1f');
      commits.push({
        hash: shortHash,
        fullHash: hash,
        message,
        date,
        author,
        unpushed: unpushedHashes.has(hash)
      });
    }
  }

  return {
    commits,
    unpushedCount: unpushedHashes.size
  };
}

/**
 * 指定パスが .gitignore 等で無視対象かを判定
 * @param {string} cwd - git リポジトリのルート（またはその配下）
 * @param {string} relPath - cwd からの相対パス
 * @returns {boolean|null} - true: 無視対象 / false: 対象外 / null: 判定不能（gitリポジトリでない等）
 */
function isPathGitIgnored(cwd, relPath) {
  try {
    // シェルを介さず引数として渡すことでコマンドインジェクションを回避
    execFileSync('git', ['check-ignore', '-q', '--', relPath], { cwd, stdio: 'pipe' });
    return true; // 終了コード 0 = 無視対象
  } catch (error) {
    if (error.status === 1) {
      return false; // 終了コード 1 = 無視対象ではない
    }
    return null; // それ以外（gitリポジトリでない等）は判定不能
  }
}

module.exports = {
  getGitInfo,
  getGitStatus,
  getGitLog,
  isPathGitIgnored,
  execGitCommand,      // テスト用にエクスポート
  detectMainWorktree   // 既存スクリプト用
};
