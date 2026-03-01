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

  // セッションメタデータのインメモリキャッシュ
  const sessionMetadataCache = new Map();

  /**
   * JSONL ファイルの一覧を取得
   */
  async function getSessionFiles() {
    const sessions = [];

    async function findJSONLFiles(dir) {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await findJSONLFiles(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            const stats = await fs.promises.stat(fullPath);
            // ファイル名からセッションIDを抽出（拡張子を除く）
            const sessionId = path.basename(entry.name, '.jsonl');
            sessions.push({
              id: sessionId,
              path: fullPath,
              mtime: stats.mtime.getTime()
            });
          }
        }
      } catch (error) {
        // ディレクトリが存在しない等のエラーは無視
      }
    }

    await findJSONLFiles(normalizedWatchDir);
    return sessions;
  }

  /**
   * セッションのメタデータを取得（キャッシュ付き）
   */
  async function getSessionMetadata(sessionId, filePath, mtime) {
    // キャッシュがあり、mtimeが同じなら返す
    const cached = sessionMetadataCache.get(sessionId);
    if (cached && cached.mtime === mtime) {
      return cached.metadata;
    }

    // キャッシュがないか古い場合は再パース
    const events = await parseJSONLFile(filePath);

    // メッセージを role でフィルタ
    const userMessages = events.filter(e => e.message && e.message.role === 'user');
    const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

    // トークン使用量を集計
    const totalTokens = assistantMessages.reduce((sum, msg) => {
      if (msg.message && msg.message.usage) {
        return sum + (msg.message.usage.input_tokens || 0) + (msg.message.usage.output_tokens || 0);
      }
      return sum;
    }, 0);

    // メッセージ内容を抽出するヘルパー
    const extractContent = (message) => {
      if (!message || !message.message || !message.message.content) return null;
      const content = message.message.content;
      if (Array.isArray(content)) {
        // content が配列の場合、text タイプのものを連結
        const textParts = content.filter(item => item.type === 'text').map(item => item.text);
        return textParts.join('\n') || null;
      }
      return content;
    };

    const metadata = {
      id: sessionId,
      createdAt: events.length > 0 ? events[0].timestamp : null,
      lastModifiedAt: events.length > 0 ? events[events.length - 1].timestamp : null,
      messageCount: userMessages.length + assistantMessages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalTokens,
      firstUserMessage: userMessages.length > 0 ? extractContent(userMessages[0]) : null,
      lastUserMessage: userMessages.length > 0 ? extractContent(userMessages[userMessages.length - 1]) : null,
      firstAssistantMessage: assistantMessages.length > 0 ? extractContent(assistantMessages[0]) : null,
      lastAssistantMessage: assistantMessages.length > 0 ? extractContent(assistantMessages[assistantMessages.length - 1]) : null,
    };

    // キャッシュに保存
    sessionMetadataCache.set(sessionId, {
      mtime,
      metadata
    });

    return metadata;
  }

  /**
   * 指定セッションの JSONL ファイルパスを取得
   */
  async function getSessionJSONLPath(sessionId) {
    const sessions = await getSessionFiles();
    const session = sessions.find(s => s.id === sessionId);
    return session ? session.path : null;
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
      const sessions = await getSessionFiles();
      const detail = req.query.detail === 'true';

      if (!detail) {
        // シンプル版: メタデータのみ
        const metadataList = await Promise.all(
          sessions.map(s => getSessionMetadata(s.id, s.path, s.mtime))
        );
        return res.json({ sessions: metadataList });
      }

      // 詳細版: メッセージオブジェクト全体を含む
      const detailedList = await Promise.all(
        sessions.map(async (s) => {
          const events = await parseJSONLFile(s.path);
          const userMessages = events.filter(e => e.message && e.message.role === 'user');
          const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

          const extractContent = (message) => {
            if (!message || !message.message || !message.message.content) return null;
            const content = message.message.content;
            if (Array.isArray(content)) {
              const textParts = content.filter(item => item.type === 'text').map(item => item.text);
              return textParts.join('\n') || null;
            }
            return content;
          };

          const totalTokens = assistantMessages.reduce((sum, msg) => {
            if (msg.message && msg.message.usage) {
              return sum + (msg.message.usage.input_tokens || 0) + (msg.message.usage.output_tokens || 0);
            }
            return sum;
          }, 0);

          return {
            id: s.id,
            createdAt: events.length > 0 ? events[0].timestamp : null,
            lastModifiedAt: events.length > 0 ? events[events.length - 1].timestamp : null,
            messageCount: userMessages.length + assistantMessages.length,
            userMessageCount: userMessages.length,
            assistantMessageCount: assistantMessages.length,
            totalTokens,
            firstUserMessage: userMessages.length > 0 ? {
              content: extractContent(userMessages[0]),
              timestamp: userMessages[0].timestamp
            } : null,
            lastUserMessage: userMessages.length > 0 ? {
              content: extractContent(userMessages[userMessages.length - 1]),
              timestamp: userMessages[userMessages.length - 1].timestamp
            } : null,
            firstAssistantMessage: assistantMessages.length > 0 ? {
              content: extractContent(assistantMessages[0]),
              timestamp: assistantMessages[0].timestamp,
              usage: assistantMessages[0].message.usage || null
            } : null,
            lastAssistantMessage: assistantMessages.length > 0 ? {
              content: extractContent(assistantMessages[assistantMessages.length - 1]),
              timestamp: assistantMessages[assistantMessages.length - 1].timestamp,
              usage: assistantMessages[assistantMessages.length - 1].message.usage || null
            } : null,
          };
        })
      );

      res.json({ sessions: detailedList });
    } catch (error) {
      console.error('[api] Error getting sessions:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // GET /sessions/:id/messages - 全メッセージ一覧
  router.get('/sessions/:id/messages', async (req, res) => {
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
      console.error('[api] Error getting session messages:', error);
      res.status(500).json({ error: 'Failed to get session messages' });
    }
  });

  // GET /sessions/:id/messages/user/first - 最初のユーザーメッセージ
  router.get('/sessions/:id/messages/user/first', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      const userMessages = events.filter(e => e.message && e.message.role === 'user');

      if (userMessages.length === 0) {
        return res.status(404).json({ error: 'No user messages found' });
      }

      res.json({
        sessionId,
        message: userMessages[0]
      });
    } catch (error) {
      console.error('[api] Error getting first user message:', error);
      res.status(500).json({ error: 'Failed to get first user message' });
    }
  });

  // GET /sessions/:id/messages/user/latest - 最後のユーザーメッセージ
  router.get('/sessions/:id/messages/user/latest', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      const userMessages = events.filter(e => e.message && e.message.role === 'user');

      if (userMessages.length === 0) {
        return res.status(404).json({ error: 'No user messages found' });
      }

      res.json({
        sessionId,
        message: userMessages[userMessages.length - 1]
      });
    } catch (error) {
      console.error('[api] Error getting latest user message:', error);
      res.status(500).json({ error: 'Failed to get latest user message' });
    }
  });

  // GET /sessions/:id/messages/assistant/first - 最初のアシスタントメッセージ
  router.get('/sessions/:id/messages/assistant/first', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

      if (assistantMessages.length === 0) {
        return res.status(404).json({ error: 'No assistant messages found' });
      }

      res.json({
        sessionId,
        message: assistantMessages[0]
      });
    } catch (error) {
      console.error('[api] Error getting first assistant message:', error);
      res.status(500).json({ error: 'Failed to get first assistant message' });
    }
  });

  // GET /sessions/:id/messages/assistant/latest - 最後のアシスタントメッセージ
  router.get('/sessions/:id/messages/assistant/latest', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const jsonlPath = await getSessionJSONLPath(sessionId);

      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const events = await parseJSONLFile(jsonlPath);
      const assistantMessages = events.filter(e => e.message && e.message.role === 'assistant');

      if (assistantMessages.length === 0) {
        return res.status(404).json({ error: 'No assistant messages found' });
      }

      res.json({
        sessionId,
        message: assistantMessages[assistantMessages.length - 1]
      });
    } catch (error) {
      console.error('[api] Error getting latest assistant message:', error);
      res.status(500).json({ error: 'Failed to get latest assistant message' });
    }
  });

  return router;
}

module.exports = {
  createApiRouter
};
