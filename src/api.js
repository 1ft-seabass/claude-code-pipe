/**
 * api.js - REST API ルート定義
 *
 * Express のルーター。Watch 系のエンドポイントを提供。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseLine } = require('./parser');

/**
 * API ルーターを作成
 * @param {string} watchDir - 監視対象ディレクトリ
 * @returns {express.Router}
 */
function createApiRouter(watchDir) {
  const router = express.Router();
  const normalizedWatchDir = watchDir.replace(/^~/, process.env.HOME || '');

  /**
   * セッションディレクトリの一覧を取得
   */
  async function getSessionDirectories() {
    const sessionsPath = path.join(normalizedWatchDir, '**', 'sessions');
    const sessions = [];

    async function findSessions(dir) {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'sessions') {
              // sessions ディレクトリを見つけたら、その中のディレクトリを列挙
              const sessionEntries = await fs.promises.readdir(fullPath, { withFileTypes: true });
              for (const sessionEntry of sessionEntries) {
                if (sessionEntry.isDirectory()) {
                  const sessionPath = path.join(fullPath, sessionEntry.name);
                  const stats = await fs.promises.stat(sessionPath);
                  sessions.push({
                    id: sessionEntry.name,
                    path: sessionPath,
                    lastModified: stats.mtime
                  });
                }
              }
            } else {
              await findSessions(fullPath);
            }
          }
        }
      } catch (error) {
        // ディレクトリが存在しない等のエラーは無視
      }
    }

    await findSessions(normalizedWatchDir);
    return sessions;
  }

  /**
   * 指定セッションの JSONL ファイルパスを取得
   */
  async function getSessionJSONLPath(sessionId) {
    const sessions = await getSessionDirectories();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      return null;
    }

    // session ディレクトリ内の *.jsonl ファイルを探す
    const entries = await fs.promises.readdir(session.path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        return path.join(session.path, entry.name);
      }
    }

    return null;
  }

  /**
   * JSONL ファイルを全行パース
   */
  async function parseJSONLFile(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const events = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseLine(line);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  // GET /sessions - セッション一覧
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = await getSessionDirectories();
      res.json(sessions.map(s => ({
        id: s.id,
        lastModified: s.lastModified
      })));
    } catch (error) {
      console.error('[api] Error getting sessions:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // GET /sessions/:id - 指定セッションの履歴
  router.get('/sessions/:id', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      res.json({
        sessionId,
        events
      });
    } catch (error) {
      console.error('[api] Error getting session:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // GET /sessions/:id/latest - 最新の assistant メッセージ
  router.get('/sessions/:id/latest', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      // role: assistant の最新メッセージを取得
      const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

      if (assistantMessages.length === 0) {
        return res.status(404).json({ error: 'No assistant messages found' });
      }

      const latestMessage = assistantMessages[assistantMessages.length - 1];
      res.json({
        sessionId,
        message: latestMessage
      });
    } catch (error) {
      console.error('[api] Error getting latest message:', error);
      res.status(500).json({ error: 'Failed to get latest message' });
    }
  });

  return router;
}

module.exports = {
  createApiRouter
};
