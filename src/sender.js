/**
 * sender.js - claude -p の spawn 管理
 *
 * claude -p でセッションを開始・再開するためのプロセス管理。
 * プロトタイプ実装。
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

// sessionId → { proc, pid, startedAt } のマップ
const managedProcesses = new Map();

// EventEmitter のインスタンス
const processEvents = new EventEmitter();

/**
 * 新しいセッションを開始
 * @param {string} prompt - プロンプトテキスト
 * @param {string} cwd - 作業ディレクトリ
 * @param {Array<string>} allowedTools - 許可ツールのリスト
 * @param {Function} onData - stdout データのコールバック
 * @param {Function} onError - stderr データのコールバック
 * @param {Function} onExit - プロセス終了時のコールバック
 * @returns {Promise<object>} { pid, sessionId } (sessionIdは実際のUUID)
 */
function startNewSession(prompt, cwd, allowedTools, onData, onError, onExit) {
  return new Promise((resolve, reject) => {
    // claude コマンドの引数を構築
    let claudeArgs = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    if (allowedTools && allowedTools.length > 0) {
      claudeArgs.push('--allowed-tools', allowedTools.join(','));
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
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const pid = proc.pid;
    const tempSessionId = `temp-${Date.now()}-${pid}`; // 一時的なセッションID
    let actualSessionId = null; // 実際のUUID形式のセッションID
    let firstLineReceived = false;

    // 一時的にマップに登録（後でactualSessionIdに置き換える）
    managedProcesses.set(tempSessionId, {
      proc,
      pid,
      startedAt: new Date()
    });

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

                console.log(`[sender] Started new session: sessionId=${actualSessionId}, pid=${pid}`);
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
        timestamp: new Date().toISOString()
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
      managedProcesses.delete(tempSessionId);
      reject(err);
    });
  });
}

/**
 * 既存セッションに送信
 * @param {string} sessionId - セッションID (UUID形式)
 * @param {string} prompt - プロンプトテキスト
 * @param {Array<string>} allowedTools - 許可ツールのリスト
 * @param {Function} onData - stdout データのコールバック
 * @param {Function} onError - stderr データのコールバック
 * @param {Function} onExit - プロセス終了時のコールバック
 * @returns {object} { pid, sessionId }
 */
function sendToSession(sessionId, prompt, allowedTools, onData, onError, onExit) {
  // claude コマンドの引数を構築
  let claudeArgs = ['-p', prompt, '--resume', sessionId, '--output-format', 'stream-json', '--verbose'];

  if (allowedTools && allowedTools.length > 0) {
    claudeArgs.push('--allowed-tools', allowedTools.join(','));
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
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const pid = proc.pid;

  // 既存のセッションIDを上書き（同一セッションIDで新しいプロセス）
  managedProcesses.set(sessionId, {
    proc,
    pid,
    startedAt: new Date()
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
      timestamp: new Date().toISOString()
    });

    managedProcesses.delete(sessionId);
    if (onExit) {
      onExit(code, signal);
    }
  });

  console.log(`[sender] Sent to existing session: sessionId=${sessionId}, pid=${pid}`);

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

module.exports = {
  startNewSession,
  sendToSession,
  getManagedProcesses,
  getManagedProcess,
  processEvents
};
