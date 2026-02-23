/**
 * websocket.js - WebSocket 配信
 *
 * ws の WebSocketServer を Express の server に相乗り。
 * ローカル Web UI 専用。watcher の message イベントを全接続クライアントに配信する。
 */

const { WebSocketServer } = require('ws');

/**
 * WebSocket サーバーをセットアップ
 * @param {http.Server} server - Express の HTTP サーバー
 * @param {JSONLWatcher} watcher - JSONL ウォッチャー
 */
function setupWebSocket(server, watcher) {
  const wss = new WebSocketServer({
    server,
    path: '/ws'
  });

  const clients = new Set();

  wss.on('connection', (ws) => {
    console.log('[websocket] Client connected');
    clients.add(ws);

    // 接続時に確認メッセージを送信
    ws.send(JSON.stringify({ type: 'connected' }));

    ws.on('close', () => {
      console.log('[websocket] Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[websocket] WebSocket error:', error);
      clients.delete(ws);
    });
  });

  // watcher の message イベントを全クライアントに配信
  watcher.on('message', (event) => {
    const message = JSON.stringify(event);

    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error('[websocket] Error sending message to client:', error);
          clients.delete(client);
        }
      }
    }
  });

  console.log('[websocket] WebSocket server setup complete on /ws');
}

module.exports = {
  setupWebSocket
};
