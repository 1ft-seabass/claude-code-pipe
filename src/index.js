/**
 * index.js - エントリポイント
 *
 * Express + ws を同一ポートで起動し、各モジュールを組み立てる。
 */

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const JSONLWatcher = require('./watcher');
const { createApiRouter } = require('./api');
const { setupWebSocket } = require('./websocket');
const { setupSubscribers } = require('./subscribers');
const { startNewSession, sendToSession, getManagedProcesses, processEvents } = require('./sender');
const { cancel } = require('./canceller');

// Express アプリケーションを作成
const app = express();
app.use(express.json());

// HTTP サーバーを作成（Express と ws の相乗り用）
const server = http.createServer(app);

// ログディレクトリを作成
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ログストリームを作成（追記モード）
const logFilePath = path.join(logsDir, 'server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// ログ書き込み関数
function writeLog(category, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category,
    data
  };
  logStream.write(JSON.stringify(logEntry) + '\n');
}

console.log(`[index] Logging to: ${logFilePath}`);

// JSONL ウォッチャーを作成
const watcher = new JSONLWatcher(config.watchDir);

// Watch 系 API ルーターをマウント
const apiRouter = createApiRouter(config.watchDir);
app.use('/', apiRouter);

// WebSocket をセットアップ
setupWebSocket(server, watcher);

// subscribers をセットアップ
setupSubscribers(config.subscribers, watcher, processEvents);

// watcher のイベントをログに記録
watcher.on('message', (event) => {
  writeLog('watcher-message', event);
});

// processEvents のイベントをログに記録
processEvents.on('cancel-initiated', (event) => {
  writeLog('cancel-initiated', event);
});

processEvents.on('process-exit', (event) => {
  writeLog('process-exit', event);
});

// Send 系 API エンドポイント
// POST /sessions/new - 新しいセッションを開始
app.post('/sessions/new', async (req, res) => {
  const { prompt, cwd } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const allowedTools = config.send.defaultAllowedTools || [];

  try {
    const result = await startNewSession(
      prompt,
      cwd,
      allowedTools,
      (data) => {
        // stdout データ（必要に応じて WebSocket に配信するなど）
        console.log('[index] stdout:', data);
      },
      (data) => {
        // stderr データ
        console.error('[index] stderr:', data);
      },
      (code, signal) => {
        // プロセス終了
        console.log(`[index] Process exited: code=${code}, signal=${signal}`);
      }
    );

    res.json(result);
  } catch (error) {
    console.error('[index] Error starting new session:', error);
    res.status(500).json({ error: 'Failed to start new session' });
  }
});

// POST /sessions/:id/send - 既存セッションに送信
app.post('/sessions/:id/send', (req, res) => {
  const sessionId = req.params.id;
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const allowedTools = config.send.defaultAllowedTools || [];

  try {
    const result = sendToSession(
      sessionId,
      prompt,
      allowedTools,
      (data) => {
        console.log('[index] stdout:', data);
      },
      (data) => {
        console.error('[index] stderr:', data);
      },
      (code, signal) => {
        console.log(`[index] Process exited: code=${code}, signal=${signal}`);
      }
    );

    res.json(result);
  } catch (error) {
    console.error('[index] Error sending to session:', error);
    res.status(500).json({ error: 'Failed to send to session' });
  }
});

// Cancel 系 API エンドポイント
// POST /sessions/:id/cancel - プロセスをキャンセル
app.post('/sessions/:id/cancel', (req, res) => {
  const sessionId = req.params.id;
  const cancelTimeoutMs = config.send.cancelTimeoutMs || 3000;

  const result = cancel(sessionId, cancelTimeoutMs);

  if (!result) {
    return res.status(404).json({ error: 'Session not found or not managed' });
  }

  res.json(result);
});

// 管理 API
// GET /managed - 管理中のプロセス一覧
app.get('/managed', (req, res) => {
  const processes = getManagedProcesses();
  res.json(processes);
});

// サーバー起動
const port = config.port || 3100;

server.listen(port, () => {
  console.log(`claude-code-pipe listening on port ${port}`);

  // ウォッチャーを起動
  watcher.start().catch((error) => {
    console.error('[index] Failed to start watcher:', error);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[index] Shutting down...');
  await watcher.stop();
  logStream.end();
  server.close(() => {
    console.log('[index] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n[index] Shutting down...');
  await watcher.stop();
  logStream.end();
  server.close(() => {
    console.log('[index] Server closed');
    process.exit(0);
  });
});
