/**
 * sender.js - claude -p の spawn 管理
 *
 * claude -p でセッションを開始・再開するためのプロセス管理。
 * プロトタイプ実装。
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');

// sessionId → { proc, pid, startedAt } のマップ
const managedProcesses = new Map();

// EventEmitter のインスタンス
const processEvents = new EventEmitter();

// タイムアウト設定（デフォルト: 60秒）
const SESSION_START_TIMEOUT_MS = 60 * 1000;

/**
 * Windows (non-WSL) 環境かどうかを判定
 * @returns {boolean} true if Windows (non-WSL)
 */
function isWindowsNonWSL() {
  if (process.platform !== 'win32') {
    return false;
  }

  // WSL判定
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8');
    return !procVersion.toLowerCase().includes('microsoft');
  } catch {
    // /proc/version が読めない = Windows native
    return true;
  }
}

/**
 * 新しいセッションを開始
 * @param {string} prompt - プロンプトテキスト
 * @param {object} options - オプション
 * @param {string} options.cwd - 作業ディレクトリ
 * @param {Array<string>} options.allowedTools - 許可ツールのリスト
 * @param {Array<string>} options.disallowedTools - 禁止ツールのリスト
 * @param {string} options.model - 使用モデル (例: "sonnet", "opus", "claude-sonnet-4-6")
 * @param {boolean} options.dangerouslySkipPermissions - 権限確認をスキップ（危険）
 * @param {string} options.projectPath - プロジェクトパス（Webhook用）
 * @param {Function} options.onData - stdout データのコールバック
 * @param {Function} options.onError - stderr データのコールバック
 * @param {Function} options.onExit - プロセス終了時のコールバック
 * @returns {Promise<object>} { pid, sessionId } (sessionIdは実際のUUID)
 */
function startNewSession(prompt, options = {}) {
  const { cwd, allowedTools, disallowedTools, model, dangerouslySkipPermissions, projectPath, onData, onError, onExit } = options;
  return new Promise((resolve, reject) => {
    // Windows (non-WSL) チェック
    if (isWindowsNonWSL()) {
      const error = new Error('Windows (non-WSL) is not supported for sending messages. Please use Claude Code CLI directly or use WSL.');
      reject(error);
      return;
    }

    // claude コマンドの引数を構築
    let claudeArgs = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    if (allowedTools && allowedTools.length > 0) {
      claudeArgs.push('--allowedTools', allowedTools.join(' '));
    }

    if (disallowedTools && disallowedTools.length > 0) {
      claudeArgs.push('--disallowedTools', disallowedTools.join(' '));
    }

    if (model) {
      claudeArgs.push('--model', model);
    }

    if (dangerouslySkipPermissions) {
      claudeArgs.push('--dangerously-skip-permissions');
    }

    // script コマンドで PTY を提供してバッファリングを回避
    const claudeCommand = `claude ${claudeArgs.map(arg => {
      // 引数にスペースや特殊文字が含まれる場合はクォートする
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    }).join(' ')}`;

    const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
      cwd: cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const pid = proc.pid;
    const tempSessionId = `temp-${Date.now()}-${pid}`; // 一時的なセッションID
    let actualSessionId = null; // 実際のUUID形式のセッションID
    let firstLineReceived = false;
    let sessionStartTimeout = null;

    // 一時的にマップに登録（後でactualSessionIdに置き換える）
    managedProcesses.set(tempSessionId, {
      proc,
      pid,
      startedAt: new Date(),
      projectPath: projectPath || null
    });

    // タイムアウト設定
    sessionStartTimeout = setTimeout(() => {
      if (!firstLineReceived) {
        const timeoutError = new Error('Session start timeout: Failed to retrieve session ID');
        console.error(`[sender] ${timeoutError.message}: pid=${pid}`);

        // session-timeout イベント発行
        processEvents.emit('session-timeout', {
          sessionId: tempSessionId,
          pid,
          timestamp: new Date().toISOString(),
          error: timeoutError.message,
          projectPath: projectPath || null
        });

        proc.kill();
        managedProcesses.delete(tempSessionId);
        reject(timeoutError);
      }
    }, SESSION_START_TIMEOUT_MS);

    // stdout をコールバックに流す
    proc.stdout.on('data', (data) => {
      const dataStr = data.toString();

      // 最初の行からセッションIDを抽出
      if (!firstLineReceived) {
        try {
          const lines = dataStr.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const json = JSON.parse(line);
              if (json.type === 'system' && json.subtype === 'init' && json.session_id) {
                actualSessionId = json.session_id;
                firstLineReceived = true;

                // 一時IDから実際のセッションIDに移行
                const tempInfo = managedProcesses.get(tempSessionId);
                managedProcesses.delete(tempSessionId);
                managedProcesses.set(actualSessionId, tempInfo);

                // タイムアウトをクリア
                if (sessionStartTimeout) {
                  clearTimeout(sessionStartTimeout);
                  sessionStartTimeout = null;
                }

                console.log(`[sender] Started new session: sessionId=${actualSessionId}, pid=${pid}`);

                // session-started イベント発行
                processEvents.emit('session-started', {
                  sessionId: actualSessionId,
                  pid,
                  timestamp: new Date().toISOString(),
                  projectPath: projectPath || null
                });

                resolve({ pid, sessionId: actualSessionId });
                break;
              }
            }
          }
        } catch (err) {
          // JSONパースエラーは無視（次の行で再試行）
        }
      }

      if (onData) {
        onData(dataStr);
      }
    });

    // stderr をコールバックに流す
    proc.stderr.on('data', (data) => {
      if (onError) {
        onError(data.toString());
      }
    });

    // プロセス終了時の処理
    proc.on('exit', (code, signal) => {
      const sessionId = actualSessionId || tempSessionId;
      console.log(`[sender] Process exited: sessionId=${sessionId}, pid=${pid}, code=${code}, signal=${signal}`);

      // イベント発行
      processEvents.emit('process-exit', {
        sessionId,
        pid,
        code,
        signal,
        timestamp: new Date().toISOString(),
        projectPath: projectPath || null
      });

      managedProcesses.delete(sessionId);
      if (onExit) {
        onExit(code, signal);
      }

      // セッションIDが取得できないまま終了した場合
      if (!firstLineReceived) {
        reject(new Error('Failed to retrieve session ID from claude command'));
      }
    });

    // プロセス起動エラー
    proc.on('error', (err) => {
      console.error(`[sender] Failed to start process: ${err.message}`);

      // タイムアウトをクリア
      if (sessionStartTimeout) {
        clearTimeout(sessionStartTimeout);
        sessionStartTimeout = null;
      }

      // session-error イベント発行
      const sessionId = actualSessionId || tempSessionId;
      processEvents.emit('session-error', {
        sessionId,
        pid,
        timestamp: new Date().toISOString(),
        error: err.message,
        projectPath: projectPath || null
      });

      managedProcesses.delete(tempSessionId);
      reject(err);
    });
  });
}

/**
 * 既存セッションに送信
 * @param {string} sessionId - セッションID (UUID形式)
 * @param {string} prompt - プロンプトテキスト
 * @param {object} options - オプション
 * @param {string} options.cwd - 作業ディレクトリ
 * @param {Array<string>} options.allowedTools - 許可ツールのリスト
 * @param {Array<string>} options.disallowedTools - 禁止ツールのリスト
 * @param {string} options.model - 使用モデル (例: "sonnet", "opus", "claude-sonnet-4-6")
 * @param {boolean} options.dangerouslySkipPermissions - 権限確認をスキップ（危険）
 * @param {string} options.projectPath - プロジェクトパス（Webhook用）
 * @param {Function} options.onData - stdout データのコールバック
 * @param {Function} options.onError - stderr データのコールバック
 * @param {Function} options.onExit - プロセス終了時のコールバック
 * @returns {object} { pid, sessionId }
 */
function sendToSession(sessionId, prompt, options = {}) {
  const { cwd, allowedTools, disallowedTools, model, dangerouslySkipPermissions, projectPath, onData, onError, onExit } = options;
  // Windows (non-WSL) チェック
  if (isWindowsNonWSL()) {
    throw new Error('Windows (non-WSL) is not supported for sending messages. Please use Claude Code CLI directly or use WSL.');
  }

  // claude コマンドの引数を構築
  let claudeArgs = ['-p', prompt, '--resume', sessionId, '--output-format', 'stream-json', '--verbose'];

  if (allowedTools && allowedTools.length > 0) {
    claudeArgs.push('--allowedTools', allowedTools.join(' '));
  }

  if (disallowedTools && disallowedTools.length > 0) {
    claudeArgs.push('--disallowedTools', disallowedTools.join(' '));
  }

  if (model) {
    claudeArgs.push('--model', model);
  }

  if (dangerouslySkipPermissions) {
    claudeArgs.push('--dangerously-skip-permissions');
  }

  // script コマンドで PTY を提供してバッファリングを回避
  const claudeCommand = `claude ${claudeArgs.map(arg => {
    // 引数にスペースや特殊文字が含まれる場合はクォートする
    if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  }).join(' ')}`;

  const proc = spawn('script', ['-q', '-c', claudeCommand, '/dev/null'], {
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const pid = proc.pid;

  // 既存のセッションIDを上書き（同一セッションIDで新しいプロセス）
  managedProcesses.set(sessionId, {
    proc,
    pid,
    startedAt: new Date(),
    projectPath: projectPath || null
  });

  console.log(`[sender] Sent to existing session: sessionId=${sessionId}, pid=${pid}`);

  // session-started イベント発行（既存セッション再開）
  processEvents.emit('session-started', {
    sessionId,
    pid,
    timestamp: new Date().toISOString(),
    resumed: true,
    projectPath: projectPath || null
  });

  // stdout をコールバックに流す
  proc.stdout.on('data', (data) => {
    if (onData) {
      onData(data.toString());
    }
  });

  // stderr をコールバックに流す
  proc.stderr.on('data', (data) => {
    if (onError) {
      onError(data.toString());
    }
  });

  // プロセス終了時の処理
  proc.on('exit', (code, signal) => {
    console.log(`[sender] Process exited: sessionId=${sessionId}, pid=${pid}, code=${code}, signal=${signal}`);

    // イベント発行
    processEvents.emit('process-exit', {
      sessionId,
      pid,
      code,
      signal,
      timestamp: new Date().toISOString(),
      projectPath: projectPath || null
    });

    managedProcesses.delete(sessionId);
    if (onExit) {
      onExit(code, signal);
    }
  });

  // プロセス起動エラー
  proc.on('error', (err) => {
    console.error(`[sender] Failed to send to session: ${err.message}`);

    // session-error イベント発行
    processEvents.emit('session-error', {
      sessionId,
      pid,
      timestamp: new Date().toISOString(),
      error: err.message,
      projectPath: projectPath || null
    });

    managedProcesses.delete(sessionId);
  });

  return { pid, sessionId };
}

/**
 * 管理中のプロセス一覧を取得
 * @returns {Array}
 */
function getManagedProcesses() {
  const list = [];
  for (const [sessionId, info] of managedProcesses.entries()) {
    list.push({
      sessionId,
      pid: info.pid,
      startedAt: info.startedAt,
      alive: !info.proc.killed
    });
  }
  return list;
}

/**
 * 指定セッションのプロセス情報を取得
 * @param {string} sessionId
 * @returns {object|null}
 */
function getManagedProcess(sessionId) {
  return managedProcesses.get(sessionId) || null;
}

/**
 * 指定セッションのプロセスを強制終了
 * @param {string} sessionId - セッションID
 * @returns {object|null} { sessionId, pid, killed: boolean } または null (存在しない場合)
 */
function killProcess(sessionId) {
  const info = managedProcesses.get(sessionId);
  if (!info) {
    return null; // セッションが存在しない
  }

  try {
    if (!info.proc.killed) {
      info.proc.kill('SIGTERM');
      console.log(`[sender] Killed process: sessionId=${sessionId}, pid=${info.pid}`);
      managedProcesses.delete(sessionId);
      return {
        sessionId,
        pid: info.pid,
        killed: true
      };
    } else {
      // 既に終了済み
      managedProcesses.delete(sessionId);
      return {
        sessionId,
        pid: info.pid,
        killed: false // 既に終了していた
      };
    }
  } catch (error) {
    console.error(`[sender] Failed to kill process: sessionId=${sessionId}, error=${error.message}`);
    throw error;
  }
}

/**
 * 全プロセスを強制終了（緊急用）
 * @returns {object} { killed: number, sessions: Array<string> }
 */
function killAllProcesses() {
  const killedSessions = [];
  let killedCount = 0;

  for (const [sessionId, info] of managedProcesses.entries()) {
    try {
      if (!info.proc.killed) {
        info.proc.kill('SIGTERM');
        killedCount++;
        killedSessions.push(sessionId);
        console.log(`[sender] Killed process: sessionId=${sessionId}, pid=${info.pid}`);
      }
    } catch (error) {
      console.error(`[sender] Failed to kill process: sessionId=${sessionId}, error=${error.message}`);
    }
  }

  // マップをクリア
  managedProcesses.clear();

  return {
    killed: killedCount,
    sessions: killedSessions
  };
}

module.exports = {
  startNewSession,
  sendToSession,
  getManagedProcesses,
  getManagedProcess,
  killProcess,
  killAllProcesses,
  processEvents,
  managedProcesses  // セッション判定用に公開
};
