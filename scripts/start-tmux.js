#!/usr/bin/env node

/**
 * start-dev.js - tmux を使った開発サーバー起動スクリプト
 *
 * セッション名: claude-code-pipe
 * - 冪等性: 既存セッションがあれば何もしない（--force で再起動）
 * - ポート監視: 起動完了を確認してから制御を返す
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const SESSION_NAME = 'claude-code-pipe';
const DEFAULT_PORT = 3100;

// config.json からポート番号を取得
function getPort() {
  const configPath = path.join(__dirname, '..', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.port || DEFAULT_PORT;
    }
  } catch (err) {
    console.warn(`Warning: Failed to read config.json, using default port ${DEFAULT_PORT}`);
  }
  return DEFAULT_PORT;
}

// ポートが開くまで待機
function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} did not open within ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

// tmux セッションが存在するかチェック
async function sessionExists(sessionName) {
  try {
    const { stdout } = await execAsync('tmux ls 2>/dev/null || true');
    return stdout.includes(sessionName);
  } catch (err) {
    return false;
  }
}

// tmux セッションを作成してサーバーを起動
async function startSession(sessionName, force = false) {
  const port = getPort();
  const projectRoot = path.join(__dirname, '..');

  const exists = await sessionExists(sessionName);

  if (exists && !force) {
    console.log(`✓ tmux session '${sessionName}' already running`);
    console.log(`  Use --force to restart`);
    console.log(`  Check status: npm run dev:status`);
    console.log(`  View logs: npm run dev:logs`);
    return;
  }

  if (exists && force) {
    console.log(`Killing existing session '${sessionName}'...`);
    await execAsync(`tmux kill-session -t ${sessionName}`);
    // セッションが完全に終了するまで少し待つ
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Starting tmux session '${sessionName}'...`);

  // tmux セッションを作成してサーバーを起動
  await execAsync(
    `tmux new-session -d -s ${sessionName} -c ${projectRoot} 'npm start'`
  );

  console.log(`Waiting for server to start on port ${port}...`);

  try {
    await waitForPort(port);
    console.log(`✓ Server is running on port ${port}`);
    console.log(`  Session: ${sessionName}`);
    console.log(`  View logs: npm run dev:logs`);
    console.log(`  Attach: tmux attach -t ${sessionName}`);
  } catch (err) {
    console.error(`✗ Failed to start server: ${err.message}`);
    console.log(`  Check logs: npm run dev:logs`);
    process.exit(1);
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  try {
    await startSession(SESSION_NAME, force);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
