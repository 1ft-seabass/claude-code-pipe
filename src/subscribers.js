/**
 * subscribers.js - subscribers への HTTP POST 配信
 *
 * config.subscribers の配列を読み、レベルに応じて HTTP POST で配信する。
 * プロトタイプ実装。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { managedProcesses } = require('./sender');

// エラー履歴管理（直近のエラーを記録して重複警告を防ぐ）
const errorHistory = new Map(); // key: `${label}:${url}`, value: timestamp
const ERROR_THROTTLE_MS = 5 * 60 * 1000; // 5分間同じエラーを抑制

/**
 * subscribers の配信をセットアップ
 * @param {Array} subscribers - config.subscribers の配列
 * @param {JSONLWatcher} watcher - JSONL ウォッチャー
 * @param {EventEmitter} processEvents - sender の processEvents
 */
function setupSubscribers(subscribers, watcher, processEvents) {
  if (!subscribers || subscribers.length === 0) {
    console.log('[subscribers] No subscribers configured');
    return;
  }

  // セッションごとの状態管理（stream-status 用）
  const sessionStates = new Map();

  // セッションごとの最終タイムスタンプ（応答時間計算用）
  const sessionTimestamps = new Map();

  // watcher の message イベントを監視
  watcher.on('message', (event) => {
    for (const subscriber of subscribers) {
      handleSubscriberEvent(subscriber, event, sessionStates, sessionTimestamps);
    }
  });

  // processEvents のイベントを監視（キャンセルや終了など）
  if (processEvents) {
    processEvents.on('session-started', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-started', event);
      }
    });

    processEvents.on('session-error', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-error', event);
      }
    });

    processEvents.on('session-timeout', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-timeout', event);
      }
    });

    processEvents.on('cancel-initiated', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'cancel-initiated', event);
      }
    });

    processEvents.on('process-exit', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'process-exit', event);
      }
    });
  }

  console.log(`[subscribers] Setup complete for ${subscribers.length} subscriber(s)`);
}

/**
 * プロセスイベントを処理（キャンセル、終了など）
 */
function handleProcessEvent(subscriber, eventType, event) {
  const { url, label, level, authorization } = subscriber;

  // レベルに応じて処理（status, summary, stream, stream-status すべてに送信）
  if (level === 'status' || level === 'summary' || level === 'stream' || level === 'stream-status') {
    const payload = {
      type: eventType,
      sessionId: event.sessionId,
      pid: event.pid,
      timestamp: event.timestamp,
      ...(event.code !== undefined && { code: event.code }),
      ...(event.signal !== undefined && { signal: event.signal }),
      ...(event.error !== undefined && { error: event.error }),
      ...(event.resumed !== undefined && { resumed: event.resumed })
    };
    postToSubscriber(url, payload, authorization, label);
  }
}

/**
 * subscriber ごとにイベントを処理
 */
function handleSubscriberEvent(subscriber, event, sessionStates, sessionTimestamps) {
  const { url, label, level, authorization } = subscriber;

  // レベルに応じて処理を分岐
  switch (level) {
    case 'status':
      // 応答完了時に1回送信（role: assistant の場合）
      if (event.message && event.message.role === 'assistant') {
        const payload = {
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          status: 'completed'
        };
        postToSubscriber(url, payload, authorization, label);
      }
      break;

    case 'summary':
      // 応答完了時に1回送信（role: assistant の場合）
      if (event.message && event.message.role === 'assistant') {
        // 応答時間を計算
        let responseTime = null;
        const lastTimestamp = sessionTimestamps.get(event.sessionId);
        if (lastTimestamp && event.timestamp) {
          const diff = new Date(event.timestamp) - new Date(lastTimestamp);
          responseTime = parseFloat((diff / 1000).toFixed(2)); // 秒単位（数値型）
        }
        sessionTimestamps.set(event.sessionId, event.timestamp);

        // source を判定（API経由かどうか）
        const source = managedProcesses.has(event.sessionId) ? 'api' : 'cli';

        const payload = {
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          status: 'completed',
          source: source,
          tools: event.tools || [],
          responseTime: responseTime,
          lastMessage: event.message
        };
        postToSubscriber(url, payload, authorization, label);
      }
      break;

    case 'stream':
      // メッセージごとに送信（頻繁）
      postToSubscriber(url, event, authorization, label);
      break;

    case 'stream-status':
      // 状態変化ごとに送信
      handleStreamStatus(event, sessionStates, url, authorization, label);
      break;

    default:
      console.warn(`[subscribers] Unknown level: ${level} for subscriber: ${label}`);
  }
}

/**
 * stream-status レベルの処理（状態変化時のみ送信）
 */
function handleStreamStatus(event, sessionStates, url, authorization, label) {
  const sessionId = event.sessionId;
  const currentState = sessionStates.get(sessionId) || { status: null, lastMessage: null };

  // 状態が変化したか判定
  let statusChanged = false;

  if (event.message && event.message.role === 'assistant') {
    // assistant メッセージが来た = 応答完了
    if (currentState.status !== 'completed') {
      statusChanged = true;
      currentState.status = 'completed';
      currentState.lastMessage = event.message;
    }
  } else if (event.message && event.message.role === 'user') {
    // user メッセージが来た = 新しいリクエスト
    if (currentState.status !== 'processing') {
      statusChanged = true;
      currentState.status = 'processing';
      currentState.lastMessage = event.message;
    }
  }

  if (statusChanged) {
    const payload = {
      sessionId,
      timestamp: event.timestamp,
      status: currentState.status,
      lastMessage: currentState.lastMessage
    };
    postToSubscriber(url, payload, authorization, label);
    sessionStates.set(sessionId, currentState);
  }
}

/**
 * HTTP POST でデータを送信
 */
function postToSubscriber(urlString, payload, authorization, label) {
  try {
    const parsedUrl = new URL(urlString);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const postData = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    if (authorization) {
      options.headers['Authorization'] = authorization;
    }

    const req = client.request(options, (res) => {
      if (res.statusCode >= 400) {
        logErrorIfNeeded(
          `Failed to post to ${label} (${urlString}): HTTP ${res.statusCode}`,
          label,
          urlString
        );
      }
    });

    req.on('error', (error) => {
      logErrorIfNeeded(
        `Error posting to ${label} (${urlString}): ${error.message}`,
        label,
        urlString
      );
    });

    req.write(postData);
    req.end();

  } catch (error) {
    logErrorIfNeeded(
      `Invalid URL for ${label}: ${urlString} - ${error.message}`,
      label,
      urlString
    );
  }
}

/**
 * エラーログを出力（直近に同じエラーが出ていなければ）
 */
function logErrorIfNeeded(message, label, url) {
  const key = `${label}:${url}`;
  const now = Date.now();
  const lastErrorTime = errorHistory.get(key);

  // 直近5分以内に同じエラーが出ていたらスキップ
  if (lastErrorTime && (now - lastErrorTime) < ERROR_THROTTLE_MS) {
    return;
  }

  // エラーログを出力
  console.error(`[subscribers] ${message}`);

  // エラー履歴を更新
  errorHistory.set(key, now);
}

module.exports = {
  setupSubscribers
};
