/**
 * parser.js - JSONL パーサー
 *
 * JSONL の各行をパースし、必要なフィールドだけを抽出してイベントオブジェクトを作る。
 * パース失敗時はログを出力してnullを返す。
 */

/**
 * JSONL の1行をパースしてイベントオブジェクトに変換
 * @param {string} jsonString - JSONL の1行（JSON文字列）
 * @returns {object|null} イベントオブジェクト or null（パース失敗時）
 */
function parseLine(jsonString) {
  if (!jsonString || !jsonString.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(jsonString);

    // イベントオブジェクトを構築（既知フィールドのみ抽出）
    const event = {
      parentUuid: data.parentUuid || null,
      sessionId: data.sessionId || null,
      uuid: data.uuid || null,
      timestamp: data.timestamp || null,
      message: {}
    };

    // message フィールドの抽出
    if (data.message) {
      event.message.role = data.message.role || null;
      event.message.content = data.message.content || [];

      // usage フィールドの抽出
      if (data.message.usage) {
        event.message.usage = {
          input_tokens: data.message.usage.input_tokens || 0,
          output_tokens: data.message.usage.output_tokens || 0,
          cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: data.message.usage.cache_read_input_tokens || 0
        };
      }
    }

    return event;
  } catch (error) {
    console.error('[parser] Failed to parse JSONL line:', error.message);
    return null;
  }
}

module.exports = {
  parseLine
};
