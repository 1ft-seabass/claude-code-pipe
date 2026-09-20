/**
 * mqtt-receiver.js - MQTT コマンド受信チャネル
 *
 * config.mqtt が設定されている場合、broker に接続して commandTopic を購読し、
 * 受信したコマンドを startNewSession / sendToSession にディスパッチする。
 * イベント配信（pipe → viewer）は引き続き HTTP webhook が担当し、ここでは
 * コマンド受信（viewer → pipe）のみを扱う。
 */

const mqtt = require('mqtt');
const { startNewSession, sendToSession, isWindowsNonWSL } = require('./sender');

/**
 * MQTT コマンド受信を開始する
 * @param {object} config - アプリケーション設定
 * @returns {import('mqtt').MqttClient|null} 接続した MQTT クライアント（未設定・非対応環境ではnull）
 */
function setupMqttReceiver(config) {
  const mqttConfig = config.mqtt;
  if (!mqttConfig || !mqttConfig.url || !mqttConfig.commandTopic) {
    return null;
  }

  if (isWindowsNonWSL()) {
    console.warn('[mqtt] Windows native does not support `claude -p`; MQTT command channel disabled');
    return null;
  }

  const client = mqtt.connect(mqttConfig.url, {
    username: mqttConfig.username,
    password: mqttConfig.password
  });

  client.on('connect', () => {
    console.log(`[mqtt] Connected to ${mqttConfig.url}`);
    client.subscribe(mqttConfig.commandTopic, { qos: 0 }, (error) => {
      if (error) {
        console.error('[mqtt] Failed to subscribe:', error.message);
      } else {
        console.log(`[mqtt] Subscribed to ${mqttConfig.commandTopic} (QoS 0)`);
      }
    });
  });

  client.on('reconnect', () => {
    console.log('[mqtt] Reconnecting...');
  });

  client.on('error', (error) => {
    console.error('[mqtt] Connection error:', error.message);
  });

  client.on('message', async (topic, payload) => {
    if (topic !== mqttConfig.commandTopic) return;

    let command;
    try {
      command = JSON.parse(payload.toString());
    } catch (error) {
      console.error('[mqtt] Invalid JSON payload:', error.message);
      return;
    }

    const { prompt, projectPath, sessionId, model } = command;
    if (!prompt) {
      console.error('[mqtt] Command missing required field: prompt');
      return;
    }

    const allowedTools = config.send?.defaultAllowedTools || [];
    const callbacks = {
      onData: (data) => console.log('[mqtt] stdout:', data),
      onError: (data) => console.error('[mqtt] stderr:', data),
      onExit: (code, signal) => console.log(`[mqtt] Process exited: code=${code}, signal=${signal}`)
    };

    try {
      if (sessionId) {
        const result = await sendToSession(sessionId, prompt, { allowedTools, model, projectPath: null, ...callbacks });
        console.log(`[mqtt] Sent to existing session: sessionId=${result.sessionId}`);
      } else {
        const result = await startNewSession(prompt, { cwd: projectPath, projectPath, allowedTools, model, ...callbacks });
        console.log(`[mqtt] Started new session: sessionId=${result.sessionId}`);
      }
    } catch (error) {
      console.error('[mqtt] Error dispatching command:', error.message);
    }
  });

  return client;
}

module.exports = {
  setupMqttReceiver
};
