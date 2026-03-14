/**
 * git-info.js - Git リポジトリ情報を取得するユーティリティ
 *
 * Git コマンドを安全に実行し、ブランチ名、コミットハッシュ、worktree 情報などを取得します。
 * エラーハンドリングにより、git が利用できない環境でも安全に動作します。
 */

const { execSync } = require('child_process');

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
    return result.trim();
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

module.exports = {
  getGitInfo,
  execGitCommand,      // テスト用にエクスポート
  detectMainWorktree   // 既存スクリプト用
};
