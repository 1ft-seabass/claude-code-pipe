/**
 * api.js - REST API ルート定義
 *
 * Express のルーター。Watch 系のエンドポイントを提供。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { parseLine } = require('./parser');
const { extractProjectPath } = require('./subscribers');
const { startNewSession, sendToSession, getManagedProcesses, killProcess, killAllProcesses } = require('./sender');

// package.json を読み込み
const packageJson = require('../package.json');

/**
 * API ルーターを作成
 * @param {string} watchDir - 監視対象ディレクトリ
 * @param {object} config - 設定オブジェクト
 * @returns {express.Router}
 */
function createApiRouter(watchDir, config) {
  const router = express.Router();
  const normalizedWatchDir = watchDir.replace(/^~/, process.env.HOME || '');

  // デフォルト値を取得
  const defaultDangerouslySkipPermissions = config?.send?.defaultDangerouslySkipPermissions || false;

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

    // プロジェクト情報を抽出
    const projectPath = extractProjectPath(filePath);
    const projectName = projectPath ? path.basename(projectPath) : null;

    const metadata = {
      id: sessionId,
      createdAt: events.length > 0 ? events[0].timestamp : null,
      lastModifiedAt: events.length > 0 ? events[events.length - 1].timestamp : null,
      messageCount: userMessages.length + assistantMessages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalTokens,
      projectPath,
      projectName,
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

  // GET /version - バージョン情報
  router.get('/version', (req, res) => {
    res.json({
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description
    });
  });

  // GET /claude-version - Claude Code CLI バージョン情報
  router.get('/claude-version', async (req, res) => {
    try {
      const proc = spawn('claude', ['-v']);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('[api] Error getting claude version:', stderr);
          return res.status(500).json({
            error: 'Failed to get claude version',
            details: stderr
          });
        }

        // claude -v の出力をパース（"x.y.z (Claude Code)" 形式）
        const raw = stdout.trim();
        const versionMatch = raw.match(/^(\d+\.\d+\.\d+)/);
        const version = versionMatch ? versionMatch[1] : raw;

        res.json({
          version,
          raw
        });
      });

      proc.on('error', (err) => {
        console.error('[api] Failed to execute claude -v:', err);
        res.status(500).json({
          error: 'Failed to execute claude command',
          details: err.message
        });
      });
    } catch (error) {
      console.error('[api] Error in /claude-version:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /projects - プロジェクト一覧
  router.get('/projects', async (req, res) => {
    try {
      const sessions = await getSessionFiles();

      // クエリパラメータからフィルタ条件を取得（デフォルト: agent セッションと空セッションを除外）
      const excludeAgents = req.query.excludeAgents !== 'false'; // デフォルト true
      const excludeEmpty = req.query.excludeEmpty !== 'false';   // デフォルト true

      // プロジェクトごとにグルーピング
      const projectsMap = new Map();

      for (const session of sessions) {
        // agent-* セッションを除外（オプション）
        if (excludeAgents && session.id.startsWith('agent-')) {
          continue;
        }

        const projectPath = extractProjectPath(session.path);
        const projectName = projectPath ? path.basename(projectPath) : null;

        if (!projectPath) continue;

        if (!projectsMap.has(projectPath)) {
          projectsMap.set(projectPath, {
            projectPath,
            projectName,
            sessionCount: 0,
            sessions: []
          });
        }

        const project = projectsMap.get(projectPath);
        project.sessionCount++;
        project.sessions.push({
          id: session.id,
          mtime: session.mtime
        });
      }

      // excludeEmpty が有効な場合、空セッションを除外
      if (excludeEmpty) {
        for (const [projectPath, project] of projectsMap.entries()) {
          // 各セッションのメタデータを取得してフィルタ
          const filteredSessions = [];
          for (const session of project.sessions) {
            const sessionFiles = await getSessionFiles();
            const sessionFile = sessionFiles.find(s => s.id === session.id);
            if (sessionFile) {
              const metadata = await getSessionMetadata(session.id, sessionFile.path, sessionFile.mtime);
              if (metadata.messageCount > 0) {
                filteredSessions.push(session);
              }
            }
          }
          project.sessions = filteredSessions;
          project.sessionCount = filteredSessions.length;
        }

        // セッション数が0のプロジェクトを削除
        for (const [projectPath, project] of projectsMap.entries()) {
          if (project.sessionCount === 0) {
            projectsMap.delete(projectPath);
          }
        }
      }

      // Map を配列に変換
      const projects = Array.from(projectsMap.values());

      // セッション数の多い順にソート
      projects.sort((a, b) => b.sessionCount - a.sessionCount);

      res.json({ projects });
    } catch (error) {
      console.error('[api] Error getting projects:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  // GET /sessions - セッション一覧
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = await getSessionFiles();
      const detail = req.query.detail === 'true';

      // クエリパラメータからフィルタ条件を取得（デフォルト: agent セッションと空セッションを除外）
      const excludeAgents = req.query.excludeAgents !== 'false'; // デフォルト true
      const excludeEmpty = req.query.excludeEmpty !== 'false';   // デフォルト true

      // フィルタリング適用
      let filteredSessions = sessions;

      // agent-* セッションを除外（オプション）
      if (excludeAgents) {
        filteredSessions = filteredSessions.filter(s => !s.id.startsWith('agent-'));
      }

      if (!detail) {
        // シンプル版: メタデータのみ
        let metadataList = await Promise.all(
          filteredSessions.map(s => getSessionMetadata(s.id, s.path, s.mtime))
        );

        // 空セッションを除外（オプション）
        if (excludeEmpty) {
          metadataList = metadataList.filter(m => m.messageCount > 0);
        }

        return res.json({ sessions: metadataList });
      }

      // 詳細版: メッセージオブジェクト全体を含む
      const detailedList = await Promise.all(
        filteredSessions.map(async (s) => {
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

          // プロジェクト情報を抽出
          const projectPath = extractProjectPath(s.path);
          const projectName = projectPath ? path.basename(projectPath) : null;

          return {
            id: s.id,
            createdAt: events.length > 0 ? events[0].timestamp : null,
            lastModifiedAt: events.length > 0 ? events[events.length - 1].timestamp : null,
            messageCount: userMessages.length + assistantMessages.length,
            userMessageCount: userMessages.length,
            assistantMessageCount: assistantMessages.length,
            totalTokens,
            projectPath,
            projectName,
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

      // 空セッションを除外（オプション）
      const finalList = excludeEmpty
        ? detailedList.filter(s => s.messageCount > 0)
        : detailedList;

      res.json({ sessions: finalList });
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

  // POST /sessions/new - 新規セッション作成
  router.post('/sessions/new', async (req, res) => {
    try {
      const { prompt, projectPath, cwd, allowedTools, disallowedTools, model, dangerouslySkipPermissions } = req.body;

      // 必須パラメータのチェック
      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      // projectPath または cwd の指定をチェック (projectPath を優先)
      const workingDirectory = projectPath || cwd;
      if (!workingDirectory) {
        return res.status(400).json({
          error: 'projectPath is required',
          message: 'Please specify projectPath (or cwd for backward compatibility) to set the working directory for the session'
        });
      }

      // Windows (non-WSL) チェック
      if (process.platform === 'win32') {
        try {
          const fs = require('fs');
          const procVersion = fs.readFileSync('/proc/version', 'utf8');
          if (!procVersion.toLowerCase().includes('microsoft')) {
            return res.status(501).json({
              error: 'Windows (non-WSL) is not supported for sending messages.',
              message: 'Please use Claude Code CLI directly for input on Windows, or use WSL for full functionality.'
            });
          }
        } catch {
          // /proc/version が読めない = Windows native
          return res.status(501).json({
            error: 'Windows (non-WSL) is not supported for sending messages.',
            message: 'Please use Claude Code CLI directly for input on Windows, or use WSL for full functionality.'
          });
        }
      }

      // dangerouslySkipPermissions のデフォルト値を config から取得
      const skipPermissions = dangerouslySkipPermissions !== undefined
        ? dangerouslySkipPermissions
        : defaultDangerouslySkipPermissions;

      // startNewSession を呼び出し
      const result = await startNewSession(prompt, {
        cwd: workingDirectory,
        allowedTools: allowedTools || [],
        disallowedTools: disallowedTools || [],
        model: model || undefined,
        dangerouslySkipPermissions: skipPermissions,
        projectPath: workingDirectory
      });

      res.json({
        message: 'Session started',
        sessionId: result.sessionId,
        pid: result.pid
      });
    } catch (error) {
      console.error('[api] Error starting new session:', error);
      res.status(500).json({ error: 'Failed to start new session' });
    }
  });

  // GET /processes - 管理中のプロセス一覧
  router.get('/processes', (req, res) => {
    try {
      const processes = getManagedProcesses();
      res.json({ processes });
    } catch (error) {
      console.error('[api] Error getting managed processes:', error);
      res.status(500).json({ error: 'Failed to get managed processes' });
    }
  });

  // DELETE /processes/:sessionId - 指定プロセス強制終了
  router.delete('/processes/:sessionId', (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const result = killProcess(sessionId);

      if (!result) {
        return res.status(404).json({
          error: 'Process not found',
          sessionId
        });
      }

      res.json({
        message: 'Process terminated',
        ...result
      });
    } catch (error) {
      console.error('[api] Error killing process:', error);
      res.status(500).json({ error: 'Failed to kill process' });
    }
  });

  // DELETE /processes - 全プロセス強制終了（緊急用）
  router.delete('/processes', (req, res) => {
    try {
      const result = killAllProcesses();
      res.json({
        message: 'All processes terminated',
        ...result
      });
    } catch (error) {
      console.error('[api] Error killing all processes:', error);
      res.status(500).json({ error: 'Failed to kill all processes' });
    }
  });

  // POST /sessions/:id/send - 既存セッションにメッセージを送信
  router.post('/sessions/:id/send', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const { prompt, projectPath, cwd, allowedTools, disallowedTools, model, dangerouslySkipPermissions } = req.body;

      // 必須パラメータのチェック
      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      // projectPath または cwd の指定をチェック (projectPath を優先)
      const workingDirectory = projectPath || cwd;
      if (!workingDirectory) {
        return res.status(400).json({
          error: 'projectPath is required',
          message: 'Please specify projectPath (or cwd for backward compatibility) to set the working directory for the session'
        });
      }

      // Windows (non-WSL) チェック
      if (process.platform === 'win32') {
        try {
          const fs = require('fs');
          const procVersion = fs.readFileSync('/proc/version', 'utf8');
          if (!procVersion.toLowerCase().includes('microsoft')) {
            return res.status(501).json({
              error: 'Windows (non-WSL) is not supported for sending messages.',
              message: 'Please use Claude Code CLI directly for input on Windows, or use WSL for full functionality.'
            });
          }
        } catch {
          // /proc/version が読めない = Windows native
          return res.status(501).json({
            error: 'Windows (non-WSL) is not supported for sending messages.',
            message: 'Please use Claude Code CLI directly for input on Windows, or use WSL for full functionality.'
          });
        }
      }

      // セッションが存在するか確認
      const jsonlPath = await getSessionJSONLPath(sessionId);
      if (!jsonlPath) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // dangerouslySkipPermissions のデフォルト値を config から取得
      const skipPermissions = dangerouslySkipPermissions !== undefined
        ? dangerouslySkipPermissions
        : defaultDangerouslySkipPermissions;

      // sendToSession を呼び出し
      const result = sendToSession(sessionId, prompt, {
        cwd: workingDirectory,
        allowedTools: allowedTools || [],
        disallowedTools: disallowedTools || [],
        model: model || undefined,
        dangerouslySkipPermissions: skipPermissions,
        projectPath: workingDirectory
      });

      res.json({
        success: true,
        sessionId: result.sessionId,
        pid: result.pid,
        message: 'Message sent successfully'
      });
    } catch (error) {
      console.error('[api] Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  return router;
}

module.exports = {
  createApiRouter
};
