/**
 * subscribers.js - subscribers への HTTP POST 配信
 *
 * config.subscribers の配列を読み、レベルに応じて HTTP POST で配信する。
 * プロトタイプ実装。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');
const { managedProcesses } = require('./sender');
const { getGitInfo } = require('./git-info');

// エラー履歴管理（直近のエラーを記録して重複警告を防ぐ）
const errorHistory = new Map(); // key: `${label}:${url}`, value: timestamp
const ERROR_THROTTLE_MS = 5 * 60 * 1000; // 5分間同じエラーを抑制

// プロジェクトパスのキャッシュ（パフォーマンス最適化）
const projectPathCache = new Map();

// Git 情報のキャッシュ（プロジェクトパスをキーとして管理）
const gitInfoCache = new Map();

/**
 * JSONL ファイルパスからプロジェクトパスを抽出
 * @param {string} jsonlFilePath - JSONL ファイルのフルパス
 * @returns {string|null} - プロジェクトのフルパス、または null
 *
 * 例: ~/.claude/projects/-home-node-workspace-repos-my-app/session-id.jsonl
 * → /home/node/workspace/repos/my-app
 *
 * 注: Claude は "/" を "-" に変換してエンコードするため、元のパスに "-" が
 * 含まれる場合は正確に復元できない。そのため、実際に存在するパスを探す。
 * 一度解決したパスはキャッシュして再利用する。
 */
function extractProjectPath(jsonlFilePath) {
  const fs = require('fs');

  try {
    const dir = path.dirname(jsonlFilePath);
    const projectDirName = path.basename(dir);

    // ディレクトリ名が "-" で始まる場合、エンコードされたパスと判断
    if (!projectDirName.startsWith('-')) {
      return null;
    }

    // キャッシュをチェック
    if (projectPathCache.has(projectDirName)) {
      return projectPathCache.get(projectDirName);
    }

    // 先頭の "-" を削除
    const encoded = projectDirName.substring(1);

    // まず、最も一般的なパターン（深さ3-5のパス）を試す
    // 例: /home/user/project, /home/user/workspace/project など
    const commonDepths = [3, 4, 5, 2, 6];

    for (const depth of commonDepths) {
      const parts = encoded.split('-');
      if (parts.length >= depth) {
        const candidatePath = '/' + parts.slice(0, depth).join('/') +
                             (parts.length > depth ? '-' + parts.slice(depth).join('-') : '');

        try {
          if (fs.existsSync(candidatePath)) {
            projectPathCache.set(projectDirName, candidatePath);
            return candidatePath;
          }
        } catch (e) {
          // 無視
        }
      }
    }

    // 見つからない場合は、全ての "-" を "/" に変換したパスを試す
    const fullPath = '/' + encoded.replace(/-/g, '/');
    projectPathCache.set(projectDirName, fullPath);
    return fullPath;

  } catch (error) {
    console.error('[subscribers] Failed to extract project path:', error.message);
    return null;
  }
}

/**
 * プロジェクトパスから Git 情報を取得（キャッシュ付き）
 * @param {string} projectPath - プロジェクトのフルパス
 * @returns {object|null} - Git 情報オブジェクト、または null
 */
function getProjectGitInfo(projectPath) {
  if (!projectPath) {
    return null;
  }

  // キャッシュをチェック
  if (gitInfoCache.has(projectPath)) {
    return gitInfoCache.get(projectPath);
  }

  // Git 情報を取得
  const gitInfo = getGitInfo(projectPath);

  // キャッシュに保存
  gitInfoCache.set(projectPath, gitInfo);

  return gitInfo;
}

/**
 * subscribers の配信をセットアップ
 * @param {Array} subscribers - config.subscribers の配列
 * @param {JSONLWatcher} watcher - JSONL ウォッチャー
 * @param {EventEmitter} processEvents - sender の processEvents
 * @param {Object} config - 設定オブジェクト（projectTitle 取得用）
 */
function setupSubscribers(subscribers, watcher, processEvents, config = {}) {
  if (!subscribers || subscribers.length === 0) {
    console.log('[subscribers] No subscribers configured');
    return;
  }

  // サーバー情報を取得
  const cwdPath = process.cwd();
  const cwdName = path.basename(cwdPath);
  const projectTitle = config.projectTitle || null;

  const serverInfo = { cwdPath, cwdName, projectTitle };

  // セッションごとの最終タイムスタンプ（応答時間計算用）
  const sessionTimestamps = new Map();

  // watcher の message イベントを監視
  watcher.on('message', (event) => {
    for (const subscriber of subscribers) {
      handleSubscriberEvent(subscriber, event, sessionTimestamps, serverInfo);
    }
  });

  // processEvents のイベントを監視（キャンセルや終了など）
  if (processEvents) {
    processEvents.on('session-started', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-started', event, serverInfo);
      }
    });

    processEvents.on('session-error', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-error', event, serverInfo);
      }
    });

    processEvents.on('session-timeout', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'session-timeout', event, serverInfo);
      }
    });

    processEvents.on('cancel-initiated', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'cancel-initiated', event, serverInfo);
      }
    });

    processEvents.on('process-exit', (event) => {
      for (const subscriber of subscribers) {
        handleProcessEvent(subscriber, 'process-exit', event, serverInfo);
      }
    });
  }

  console.log(`[subscribers] Setup complete for ${subscribers.length} subscriber(s)`);
}

/**
 * プロセスイベントを処理（キャンセル、終了など）
 */
function handleProcessEvent(subscriber, eventType, event, serverInfo) {
  const { url, label, level, authorization } = subscriber;

  // basic: 最低限のイベントのみ (session-started, process-exit)
  // full: 全イベント (session-started, session-error, session-timeout, cancel-initiated, process-exit)
  const basicEvents = ['session-started', 'process-exit'];
  const shouldSend = level === 'full' || (level === 'basic' && basicEvents.includes(eventType));

  if (shouldSend) {
    const payload = {
      type: eventType,
      sessionId: event.sessionId,
      pid: event.pid,
      timestamp: event.timestamp,
      cwdPath: serverInfo.cwdPath,
      cwdName: serverInfo.cwdName,
      ...(serverInfo.projectTitle && { projectTitle: serverInfo.projectTitle }),
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
function handleSubscriberEvent(subscriber, event, sessionTimestamps, serverInfo) {
  const { url, label, level, includeMessage, authorization } = subscriber;

  // assistant メッセージの場合のみ処理
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

    // プロジェクト情報を抽出
    const projectPath = event.jsonlFilePath ? extractProjectPath(event.jsonlFilePath) : null;
    const projectName = projectPath ? path.basename(projectPath) : null;

    // Git 情報を取得（キャッシュ付き）
    const gitInfo = getProjectGitInfo(projectPath);

    // 基本ペイロード（メタ情報）
    const payload = {
      type: 'assistant-response-completed',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      cwdPath: serverInfo.cwdPath,
      cwdName: serverInfo.cwdName,
      ...(projectPath && { projectPath }),
      ...(projectName && { projectName }),
      ...(serverInfo.projectTitle && { projectTitle: serverInfo.projectTitle }),
      source: source,
      tools: event.tools || [],
      responseTime: responseTime,
      git: gitInfo  // Git 情報を追加
    };

    // includeMessage が true の場合、message を追加
    if (includeMessage) {
      payload.message = event.message;
    }

    postToSubscriber(url, payload, authorization, label);
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
  setupSubscribers,
  extractProjectPath
};
