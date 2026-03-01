# claude-code-pipe - Details

Complete documentation for claude-code-pipe.

[日本語版はこちら](./DETAILS-ja.md)

## Table of Contents

- [Configuration Details](#configuration-details)
- [API Reference](#api-reference)
- [Webhook Event Format](#webhook-event-format)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Configuration Details

### Complete Configuration Structure

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token",
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "my-service",
      "level": "basic",
      "includeMessage": true,
      "authorization": ""
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000
  }
}
```

### Configuration Fields

#### Root Level

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `watchDir` | string | Yes | - | Directory to watch for Claude Code session files (e.g., `~/.claude/projects`) |
| `port` | number | Yes | - | Port number for the server (recommended: `3100`) |
| `apiToken` | string | No | `""` | API token for authentication. If set, all requests must include `Authorization: Bearer TOKEN` header |
| `subscribers` | array | No | `[]` | List of webhook subscribers |
| `send` | object | No | `{}` | Configuration for send mode |

#### Subscribers

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | string | Yes | - | Webhook endpoint URL |
| `label` | string | Yes | - | Label for identification in logs |
| `level` | string | Yes | - | Event level: `basic` or `full` |
| `includeMessage` | boolean | Yes | - | Include full message content in webhook payload |
| `authorization` | string | No | `""` | Authorization header value (e.g., `Bearer YOUR_TOKEN`) |

#### Send Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `defaultAllowedTools` | array | No | `["Read", "Grep", "Write", "Bash"]` | Default allowed tools for `claude -p` |
| `cancelTimeoutMs` | number | No | `3000` | Timeout in milliseconds for cancel operation |

### Webhook Levels

Choose the appropriate level based on your use case:

| level | includeMessage | Description | Use Case |
|-------|---------------|-------------|----------|
| `basic` | `false` | Minimal events, metadata only | Lightweight notifications (e.g., Slack) |
| `basic` | `true` | Minimal events + full message | Standard usage (e.g., Node-RED) |
| `full` | `false` | All events, metadata only | Debug/monitoring (metadata only) |
| `full` | `true` | All events + full message | Complete logging |

**Event Types by Level:**

- **basic**: `session-started`, `assistant-response-completed`, `process-exit`
- **full**: All events including `session-error`, `session-timeout`, `cancel-initiated`

**What is "message"?**

- **message**: Raw JSONL data (content, usage, tools, etc.)
- **metadata**: Always included (sessionId, timestamp, type, source, responseTime, etc.)

### Example Configurations

#### Minimal Configuration (Watch Only)

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

#### Single Webhook (Node-RED)

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ]
}
```

#### Multiple Webhooks

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    },
    {
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "label": "slack-notify",
      "level": "basic",
      "includeMessage": false
    },
    {
      "url": "http://localhost:3200/debug",
      "label": "debug-logger",
      "level": "full",
      "includeMessage": true,
      "authorization": "Bearer YOUR_TOKEN"
    }
  ]
}
```

#### With API Token (Production)

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here",
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "Grep"],
    "cancelTimeoutMs": 5000
  }
}
```

---

## API Reference

### Authentication

If `apiToken` is set in `config.json`, all API requests must include an `Authorization` header:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:3100/sessions
```

If `apiToken` is not set or empty, authentication is disabled (not recommended for production).

### Watch Mode

#### `GET /sessions`

List all available sessions.

**Request:**

```bash
curl http://localhost:3100/sessions
```

**Response:**

```json
{
  "sessions": ["session-id-1", "session-id-2", "agent-abc123"]
}
```

#### `GET /sessions/:id/messages`

Get all messages from a session.

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages
```

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2026-03-01T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you?",
      "timestamp": "2026-03-01T12:00:05.000Z",
      "usage": {
        "input_tokens": 100,
        "output_tokens": 50
      }
    }
  ]
}
```

#### `GET /sessions/:id/messages/user/first`

Get the first user message from a session.

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/first
```

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "user",
    "content": "Hello",
    "timestamp": "2026-03-01T12:00:00.000Z"
  }
}
```

#### `GET /sessions/:id/messages/user/latest`

Get the latest user message from a session.

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/latest
```

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "user",
    "content": "Thank you",
    "timestamp": "2026-03-01T12:01:00.000Z"
  }
}
```

#### `GET /sessions/:id/messages/assistant/first`

Get the first assistant message from a session.

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/first
```

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?",
    "timestamp": "2026-03-01T12:00:05.000Z"
  }
}
```

#### `GET /sessions/:id/messages/assistant/latest`

Get the latest assistant message from a session.

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest
```

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "You're welcome!",
    "timestamp": "2026-03-01T12:01:05.000Z",
    "usage": {
      "input_tokens": 150,
      "output_tokens": 20
    }
  }
}
```

#### `WS /ws`

WebSocket endpoint for real-time session events.

**Connection:**

```javascript
const ws = new WebSocket('ws://localhost:3100/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(event);
});
```

**Events:**

Same format as webhook events (see [Webhook Event Format](#webhook-event-format)).

### Send Mode

#### `POST /sessions/new`

Create a new session and send a prompt.

**Request:**

```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Your prompt here",
    "cwd": "/path/to/project",
    "allowedTools": ["Read", "Grep", "Write"]
  }'
```

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Prompt to send to Claude Code |
| `cwd` | string | No | current directory | Working directory for the session |
| `allowedTools` | array | No | `config.send.defaultAllowedTools` | Allowed tools for Claude Code |

**Response:**

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

#### `POST /sessions/:id/send`

Send a prompt to an existing session.

**Request:**

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/send \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Follow-up message"}'
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Prompt to send |

**Response:**

```json
{
  "message": "Prompt sent to existing session",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### Cancel Mode

#### `POST /sessions/:id/cancel`

Cancel a running session.

**Request:**

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/cancel
```

**Response:**

```json
{
  "message": "Cancel signal sent",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

**Behavior:**

1. Sends Ctrl+C signal to the process
2. Waits for `cancelTimeoutMs` (default: 3000ms)
3. If process doesn't exit, force-kills it
4. Emits `cancel-initiated` event (level: `full`)

### Management

#### `GET /managed`

List all managed processes.

**Request:**

```bash
curl http://localhost:3100/managed
```

**Response:**

```json
{
  "processes": [
    {
      "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
      "pid": 12345,
      "startTime": "2026-03-01T12:00:00.000Z",
      "status": "running"
    }
  ]
}
```

---

## Webhook Event Format

Webhooks receive POST requests with the following structure.

### Event Structure

All events include these metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type (see [Event Types](#event-types)) |
| `sessionId` | string | Session ID |
| `timestamp` | string | ISO 8601 timestamp |
| `source` | string | Event source: `watcher`, `sender`, or `canceller` |

Additional fields depend on `includeMessage` setting.

### Basic Event (includeMessage: false)

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234
}
```

### Full Event (includeMessage: true)

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234,
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    },
    "tools": ["Read", "Write"]
  }
}
```

### Event Types

| Type | Description | Level | Source |
|------|-------------|-------|--------|
| `session-started` | New session created | basic, full | sender |
| `assistant-response-completed` | Assistant response finished | basic, full | watcher |
| `process-exit` | Claude process exited | basic, full | sender |
| `session-error` | Error occurred | full only | watcher |
| `session-timeout` | Session timed out | full only | watcher |
| `cancel-initiated` | Cancel requested | full only | canceller |

### Event Examples

#### session-started

```json
{
  "type": "session-started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "source": "sender"
}
```

#### assistant-response-completed

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "source": "watcher",
  "responseTime": 5234,
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  }
}
```

#### process-exit

```json
{
  "type": "process-exit",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:05:00.000Z",
  "source": "sender",
  "exitCode": 0
}
```

#### cancel-initiated

```json
{
  "type": "cancel-initiated",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:02:00.000Z",
  "source": "canceller"
}
```

---

## Troubleshooting

### Server won't start

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3100`

**Solution:** The port is already in use. Check what's using it:

```bash
lsof -i :3100
```

Either kill the process or change the `port` in `config.json`.

---

**Symptom:** `Error: Cannot find module './config.json'`

**Solution:** You need to create `config.json`:

```bash
cp config.example.json config.json
```

Then edit `config.json` to match your environment.

---

### No events received

**Symptom:** Webhook endpoint is not receiving events.

**Solution 1:** Check webhook URL is accessible:

```bash
curl -X POST http://localhost:1880/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

**Solution 2:** Check logs for errors:

```bash
npm run pm2:logs
```

**Solution 3:** Verify webhook configuration in `config.json`:

- `url` is correct
- `level` is set to `basic` or `full`
- `label` is unique

---

### Session not found

**Symptom:** `GET /sessions/:id/messages` returns 404.

**Solution 1:** Check session exists:

```bash
curl http://localhost:3100/sessions
```

**Solution 2:** Verify `watchDir` points to correct directory:

```bash
ls ~/.claude/projects
```

You should see `.jsonl` files.

**Solution 3:** Check file permissions:

```bash
ls -la ~/.claude/projects
```

Make sure the user running `claude-code-pipe` has read access.

---

### Cancel not working

**Symptom:** `POST /sessions/:id/cancel` doesn't stop the process.

**Solution 1:** The cancel operation has a timeout (default: 3000ms). Check if the process exits within this time.

**Solution 2:** Increase timeout in `config.json`:

```json
{
  "send": {
    "cancelTimeoutMs": 5000
  }
}
```

**Solution 3:** Check logs to see if the process was force-killed:

```bash
npm run pm2:logs
```

---

### Authentication errors

**Symptom:** `401 Unauthorized: Missing or invalid authorization header`

**Solution 1:** Include `Authorization` header in your request:

```bash
curl -H "Authorization: Bearer your-token" \
  http://localhost:3100/sessions
```

**Solution 2:** Verify token matches `apiToken` in `config.json`.

**Solution 3:** If you don't want authentication, remove or empty the `apiToken` field:

```json
{
  "apiToken": ""
}
```

Then restart the server:

```bash
npm run pm2:restart
```

---

### PM2 issues

**Symptom:** `pm2 status` shows app as stopped or errored.

**Solution 1:** Check logs:

```bash
npm run pm2:logs
```

**Solution 2:** Restart the app:

```bash
npm run pm2:restart
```

**Solution 3:** Delete and restart:

```bash
npm run pm2:stop
pm2 delete claude-code-pipe
npm run pm2:start
```

---

## Development

### Project Structure

```
claude-code-pipe/
├── src/
│   ├── index.js           # Main entry point, Express server, authentication middleware
│   ├── api.js             # REST API route definitions
│   ├── watcher.js         # JSONL file watcher (chokidar)
│   ├── parser.js          # JSONL parser
│   ├── sender.js          # Process manager for claude -p
│   ├── canceller.js       # Cancel handler (Ctrl+C)
│   └── subscribers.js     # Webhook distributor
├── config.json            # Configuration file (gitignored)
├── config.example.json    # Example configuration
├── ecosystem.config.js    # PM2 configuration
├── package.json
├── README.md
├── README-ja.md
├── DETAILS.md
└── DETAILS-ja.md
```

### Key Modules

#### src/index.js

- Main entry point
- Express server setup
- Authentication middleware (Bearer Token)
- WebSocket server for local Web UI
- Route registration

#### src/api.js

- REST API route definitions
- Session management (list, get messages)
- Send/cancel operations
- Message filtering (user/assistant, first/latest)

#### src/watcher.js

- Watches `watchDir` for JSONL file changes
- Emits events when new lines are added
- Uses `chokidar` for file watching

#### src/parser.js

- Parses JSONL files
- Extracts messages and metadata
- Handles different event types

#### src/sender.js

- Manages `claude -p` processes
- Tracks running sessions
- Handles process lifecycle

#### src/canceller.js

- Sends Ctrl+C to running processes
- Force-kills if timeout exceeded
- Emits cancel events

#### src/subscribers.js

- Distributes events to webhooks
- Filters events by level
- Includes/excludes message content

### Running Tests

This project uses a separate testing repository for integration tests.

#### Setup Test Environment

```bash
# Clone the tester repository
git clone https://github.com/yourorg/claude-code-pipe-tester-node-red.git
cd claude-code-pipe-tester-node-red

# Install dependencies
npm install

# Start Node-RED
npm start
```

Access Node-RED at `http://localhost:1880`.

#### Test Workflow

1. **Start claude-code-pipe**:
   ```bash
   cd /path/to/claude-code-pipe
   npm run pm2:start
   ```

2. **Configure webhook** in `config.json`:
   ```json
   {
     "subscribers": [
       {
         "url": "http://localhost:1880/webhook",
         "label": "test",
         "level": "full",
         "includeMessage": true
       }
     ]
   }
   ```

3. **Send test request**:
   ```bash
   curl -X POST http://localhost:3100/sessions/new \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Hello", "cwd": "/tmp"}'
   ```

4. **Check Node-RED** for webhook events at `http://localhost:1880/ccpipe/webhook`.

### Adding New Features

#### Adding a new API endpoint

1. Add route in `src/api.js`:
   ```javascript
   router.get('/sessions/:id/my-feature', (req, res) => {
     // Implementation
   });
   ```

2. Register route in `src/index.js` (if not using existing router).

3. Test with `curl`.

#### Adding a new event type

1. Emit event in appropriate module (e.g., `src/watcher.js`):
   ```javascript
   emitter.emit('event', {
     type: 'my-event-type',
     sessionId: 'xxx',
     timestamp: new Date().toISOString(),
     source: 'watcher'
   });
   ```

2. Add to webhook level filter in `src/subscribers.js` if needed.

3. Document in `DETAILS.md`.

#### Adding a new configuration option

1. Add to `config.example.json`:
   ```json
   {
     "myNewOption": "default-value"
   }
   ```

2. Use in code:
   ```javascript
   const config = require('../config.json');
   const myOption = config.myNewOption || 'default-value';
   ```

3. Document in `DETAILS.md`.

### Debugging

#### Enable verbose logging

Edit `src/index.js` and add console.log statements:

```javascript
console.log('DEBUG:', data);
```

View logs:

```bash
npm run pm2:logs
```

#### Debug webhook delivery

Check `src/subscribers.js` for delivery errors.

#### Debug JSONL parsing

Check `src/parser.js` and `src/watcher.js` for file reading errors.

---

## License

MIT
