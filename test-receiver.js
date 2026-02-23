/**
 * test-receiver.js - テスト用HTTPレシーバー
 *
 * subscribers からの HTTP POST を受信して表示する簡易サーバー。
 * Node-RED の代わりに、動作確認用として使用。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ログディレクトリを作成
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// レシーバーのログファイル
const receiverLogPath = path.join(logsDir, 'receiver.log');
const receiverLogStream = fs.createWriteStream(receiverLogPath, { flags: 'a' });

// ログ書き込み関数
function writeLog(endpoint, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    data
  };
  receiverLogStream.write(JSON.stringify(logEntry) + '\n');
  console.log(`[${endpoint}]`, JSON.stringify(data, null, 2));
}

// config.json の subscribers に対応するエンドポイント

// node-red: summary レベル
app.post('/claude-event', (req, res) => {
  writeLog('claude-event', req.body);
  res.sendStatus(200);
});

// led-trigger: status レベル
app.post('/claude-status', (req, res) => {
  writeLog('claude-status', req.body);
  res.sendStatus(200);
});

// ポート 3200 用のサーバー（dashboard: stream-status レベル）
const app2 = express();
app2.use(express.json());

app2.post('/claude-stream', (req, res) => {
  writeLog('claude-stream', req.body);
  res.sendStatus(200);
});

// サーバー起動
const PORT_1880 = 1880;
const PORT_3200 = 3200;

app.listen(PORT_1880, () => {
  console.log(`Test receiver listening on port ${PORT_1880}`);
  console.log(`Endpoints: /claude-event, /claude-status`);
  console.log(`Logging to: ${receiverLogPath}`);
});

app2.listen(PORT_3200, () => {
  console.log(`Test receiver listening on port ${PORT_3200}`);
  console.log(`Endpoints: /claude-stream`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  receiverLogStream.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  receiverLogStream.end();
  process.exit(0);
});
