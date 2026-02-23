/**
 * canceller.js - プロセスの kill 管理
 *
 * managedProcesses から PID を取得して kill する。
 * まず SIGINT、タイムアウト後に SIGTERM。
 * プロトタイプ実装。
 */

const { getManagedProcess, processEvents } = require('./sender');

/**
 * セッションのプロセスをキャンセル
 * @param {string} sessionId - セッションID
 * @param {number} cancelTimeoutMs - SIGINT → SIGTERM のタイムアウト時間
 * @returns {object|null} { cancelled, sessionId, pid } or null（見つからない場合）
 */
function cancel(sessionId, cancelTimeoutMs = 3000) {
  const managed = getManagedProcess(sessionId);

  if (!managed) {
    console.log(`[canceller] Session not found: ${sessionId}`);
    return null;
  }

  const { proc, pid } = managed;

  console.log(`[canceller] Cancelling session: sessionId=${sessionId}, pid=${pid}`);

  // キャンセル開始イベントを発行
  processEvents.emit('cancel-initiated', {
    sessionId,
    pid,
    timestamp: new Date().toISOString()
  });

  // まず SIGINT を送る
  try {
    proc.kill('SIGINT');
    console.log(`[canceller] Sent SIGINT to pid=${pid}`);
  } catch (error) {
    console.error(`[canceller] Failed to send SIGINT to pid=${pid}:`, error.message);
  }

  // タイムアウト後に SIGTERM を送る
  setTimeout(() => {
    if (!proc.killed) {
      console.log(`[canceller] Process still alive, sending SIGTERM to pid=${pid}`);
      try {
        proc.kill('SIGTERM');
      } catch (error) {
        console.error(`[canceller] Failed to send SIGTERM to pid=${pid}:`, error.message);
      }
    }
  }, cancelTimeoutMs);

  return {
    cancelled: true,
    sessionId,
    pid
  };
}

module.exports = {
  cancel
};
