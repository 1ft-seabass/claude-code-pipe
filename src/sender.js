/**
 * sender.js - claude -p の spawn 管理
 *
 * claude -p でセッションを開始・再開するためのプロセス管理。
 * プロトタイプ実装。
 */

const { spawn } = require('child_process');

// sessionId → { proc, pid, startedAt } のマップ
const managedProcesses = new Map();

/**
 * 新しいセッションを開始
 * @param {string} prompt - プロンプトテキスト
 * @param {string} cwd - 作業ディレクトリ
 * @param {Array<string>} allowedTools - 許可ツールのリスト
 * @param {Function} onData - stdout データのコールバック
 * @param {Function} onError - stderr データのコールバック
 * @param {Function} onExit - プロセス終了時のコールバック
 * @returns {object} { pid, sessionId }
 */
function startNewSession(prompt, cwd, allowedTools, onData, onError, onExit) {
  const args = ['-p', prompt, '--output-format', 'stream-json'];

  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowed-tools', allowedTools.join(','));
  }

  const proc = spawn('claude', args, {
    cwd: cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const pid = proc.pid;
  const sessionId = `session-${Date.now()}-${pid}`; // 仮のセッションID生成

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
    managedProcesses.delete(sessionId);
    if (onExit) {
      onExit(code, signal);
    }
  });

  console.log(`[sender] Started new session: sessionId=${sessionId}, pid=${pid}`);

  return { pid, sessionId };
}

/**
 * 既存セッションに送信
 * @param {string} sessionId - セッションID
 * @param {string} prompt - プロンプトテキスト
 * @param {Array<string>} allowedTools - 許可ツールのリスト
 * @param {Function} onData - stdout データのコールバック
 * @param {Function} onError - stderr データのコールバック
 * @param {Function} onExit - プロセス終了時のコールバック
 * @returns {object} { pid, sessionId }
 */
function sendToSession(sessionId, prompt, allowedTools, onData, onError, onExit) {
  const args = ['-p', prompt, '--resume', sessionId, '--output-format', 'stream-json'];

  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowed-tools', allowedTools.join(','));
  }

  const proc = spawn('claude', args, {
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
  getManagedProcess
};
