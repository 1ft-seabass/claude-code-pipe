/**
 * watcher.js - JSONL 監視（chokidar）
 *
 * chokidar で watchDir 配下の *.jsonl ファイルを監視し、
 * 新しい行が追加されたら parseLine でパースして message イベントを発火する。
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');
const { parseLine } = require('./parser');

class JSONLWatcher extends EventEmitter {
  constructor(watchDir) {
    super();
    this.watchDir = watchDir.replace(/^~/, process.env.HOME || '');
    this.filePositions = new Map(); // ファイルパス → 最終読み込み位置
    this.watcher = null;
  }

  /**
   * セッションIDをファイルパスから推定
   * ~/.claude/projects/<hash>/sessions/<session-id>/ の構造を想定
   */
  extractSessionId(filePath) {
    const match = filePath.match(/sessions[/\\]([^/\\]+)[/\\]/);
    return match ? match[1] : null;
  }

  /**
   * ファイルの末尾位置を記録（起動時の初期化用）
   */
  async recordCurrentPosition(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      this.filePositions.set(filePath, stats.size);
    } catch (error) {
      console.error(`[watcher] Failed to stat file ${filePath}:`, error.message);
    }
  }

  /**
   * ファイルの追記部分を読み取ってパース
   */
  async processNewLines(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      const currentSize = stats.size;
      const lastPosition = this.filePositions.get(filePath) || 0;

      if (currentSize <= lastPosition) {
        // ファイルサイズが変わっていないか、縮小している場合はスキップ
        return;
      }

      // 追記部分を読み取る
      const stream = fs.createReadStream(filePath, {
        start: lastPosition,
        end: currentSize - 1,
        encoding: 'utf8'
      });

      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        // 最後の要素は不完全な行の可能性があるので保持
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const event = parseLine(line);
          if (event) {
            // sessionId をファイルパスから推定して補完
            if (!event.sessionId) {
              event.sessionId = this.extractSessionId(filePath);
            }
            this.emit('message', event);
          }
        }
      });

      stream.on('end', () => {
        // 最後に残ったバッファも処理（改行なしで終わる場合）
        if (buffer.trim()) {
          const event = parseLine(buffer);
          if (event) {
            if (!event.sessionId) {
              event.sessionId = this.extractSessionId(filePath);
            }
            this.emit('message', event);
          }
        }
        // 読み込み位置を更新
        this.filePositions.set(filePath, currentSize);
      });

      stream.on('error', (error) => {
        console.error(`[watcher] Error reading file ${filePath}:`, error.message);
      });

    } catch (error) {
      console.error(`[watcher] Failed to process file ${filePath}:`, error.message);
    }
  }

  /**
   * 監視を開始
   */
  async start() {
    console.log(`[watcher] Starting to watch: ${this.watchDir}`);

    // watchDir が存在しない場合は作成を試みる
    try {
      await fs.promises.mkdir(this.watchDir, { recursive: true });
    } catch (error) {
      console.warn(`[watcher] Could not create watch directory: ${error.message}`);
    }

    // 既存ファイルの末尾位置を記録（過去ログは読まない）
    const existingFiles = await this.findExistingJSONLFiles();
    for (const file of existingFiles) {
      await this.recordCurrentPosition(file);
    }

    // chokidar で監視開始
    this.watcher = chokidar.watch(path.join(this.watchDir, '**/*.jsonl'), {
      persistent: true,
      ignoreInitial: false, // 既存ファイルも検出する
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    this.watcher.on('add', async (filePath) => {
      console.log(`[watcher] File added: ${filePath}`);
      // 新規ファイルは現在位置を記録して終わり（過去ログは読まない）
      await this.recordCurrentPosition(filePath);
    });

    this.watcher.on('change', async (filePath) => {
      console.log(`[watcher] File changed: ${filePath}`);
      await this.processNewLines(filePath);
    });

    this.watcher.on('error', (error) => {
      console.error('[watcher] Watcher error:', error);
    });

    console.log('[watcher] Watching started');
  }

  /**
   * 既存の JSONL ファイルを検索
   */
  async findExistingJSONLFiles() {
    const files = [];

    async function walk(dir) {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // ディレクトリが存在しない等のエラーは無視
      }
    }

    await walk(this.watchDir);
    return files;
  }

  /**
   * 監視を停止
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      console.log('[watcher] Watching stopped');
    }
  }
}

module.exports = JSONLWatcher;
