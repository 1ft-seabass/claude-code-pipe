# claude-code-pipe

A simple bidirectional pipe for Claude Code sessions.

[日本語版はこちら](./README-ja.md)

## Overview

**claude-code-pipe** is a lightweight library that simply pipes Claude Code's behavior bidirectionally.

It watches Claude Code's JSONL session files, provides REST APIs for interaction, and distributes session events via webhooks. You can send prompts to Claude Code programmatically and receive events when responses are ready.

## Features

- **Watch Mode**: Monitor Claude Code session files and extract structured data
- **Send Mode**: Send prompts to Claude Code via REST API (creates `claude -p` processes)
- **Cancel Mode**: Cancel running sessions programmatically
- **Webhook Distribution**: Send session events to external services (e.g., Node-RED, Slack)
- **Process Management**: Automatic restart with PM2 support

## Installation

```bash
npm install
```

## Quick Start

### 1. Setup Configuration

Copy the example config and edit it:

```bash
cp config.example.json config.json
```

Edit `config.json` to match your environment (see [Configuration Details](#configuration-details) below).

### 2. Start the Server

#### Using PM2 (Recommended)

```bash
# Start
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

#### Direct Start (Development)

```bash
npm start
```

You should see:

```
claude-code-pipe listening on port 3100
Watching directory: /home/user/.claude/projects
```

### 3. Test the API

Create a new session:

```bash
curl -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello Claude", "cwd": "/path/to/project"}'
```

Response:

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

## Configuration Details

### Basic Structure

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `watchDir` | string | Yes | Directory to watch for Claude Code session files (e.g., `~/.claude/projects`) |
| `port` | number | Yes | Port number for the server (default: `3100`) |
| `subscribers` | array | No | List of webhook subscribers |
| `send` | object | No | Configuration for send mode |

#### Subscribers

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Webhook endpoint URL |
| `label` | string | Yes | Label for identification in logs |
| `level` | string | Yes | Event level: `basic` or `full` (see [Webhook Levels](#webhook-levels)) |
| `includeMessage` | boolean | Yes | Include full message content in webhook payload |
| `authorization` | string | No | Authorization header value (e.g., `Bearer YOUR_TOKEN`) |

#### Send Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `defaultAllowedTools` | array | No | Default allowed tools for `claude -p` (default: `["Read", "Grep", "Write", "Bash"]`) |
| `cancelTimeoutMs` | number | No | Timeout in milliseconds for cancel operation (default: `3000`) |

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

#### Minimal Configuration (Single Webhook)

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

## API Reference

### Watch Mode

#### `GET /sessions`

List all sessions.

**Response:**

```json
{
  "sessions": ["session-id-1", "session-id-2"]
}
```

#### `GET /sessions/:id`

Get session history.

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2026-03-01T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "2026-03-01T12:00:05.000Z"
    }
  ]
}
```

#### `GET /sessions/:id/latest`

Get the latest assistant message.

**Response:**

```json
{
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": {
    "role": "assistant",
    "content": "...",
    "timestamp": "2026-03-01T12:00:05.000Z"
  }
}
```

#### `WS /ws`

WebSocket endpoint for real-time session events (for local Web UI).

### Send Mode

#### `POST /sessions/new`

Create a new session and send a prompt.

**Request Body:**

```json
{
  "prompt": "Your prompt here",
  "cwd": "/path/to/project",
  "allowedTools": ["Read", "Grep", "Write"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Prompt to send to Claude Code |
| `cwd` | string | No | Working directory (defaults to current directory) |
| `allowedTools` | array | No | Allowed tools (defaults to `defaultAllowedTools` in config) |

**Response:**

```json
{
  "message": "Session started",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

#### `POST /sessions/:id/send`

Send a prompt to an existing session.

**Request Body:**

```json
{
  "prompt": "Follow-up prompt"
}
```

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

**Response:**

```json
{
  "message": "Cancel signal sent",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### Management

#### `GET /managed`

List managed processes.

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

## Webhook Event Format

Webhooks receive POST requests with the following structure:

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
    "content": "...",
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    },
    "tools": ["Read", "Write"]
  }
}
```

### Event Types

| Type | Description | Level |
|------|-------------|-------|
| `session-started` | New session created | basic, full |
| `assistant-response-completed` | Assistant response finished | basic, full |
| `process-exit` | Claude process exited | basic, full |
| `session-error` | Error occurred | full only |
| `session-timeout` | Session timed out | full only |
| `cancel-initiated` | Cancel requested | full only |

## Troubleshooting

### Server won't start

**Check port availability:**

```bash
lsof -i :3100
```

If the port is in use, change the `port` in `config.json`.

### No events received

**Check webhook URL:**

Make sure the webhook endpoint is accessible:

```bash
curl -X POST http://localhost:1880/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

**Check logs:**

```bash
npm run pm2:logs
```

### Session not found

**Check watchDir:**

Make sure `watchDir` in `config.json` points to the correct Claude Code projects directory:

```bash
ls ~/.claude/projects
```

### Cancel not working

The cancel operation has a timeout (default: 3000ms). If the process doesn't respond within this time, it will be force-killed.

You can adjust `cancelTimeoutMs` in `config.json`.

## Development

### Project Structure

```
claude-code-pipe/
├── src/
│   ├── index.js           # Main entry point
│   ├── watcher.js         # JSONL file watcher
│   ├── parser.js          # JSONL parser
│   ├── sender.js          # Process manager for claude -p
│   ├── canceller.js       # Cancel handler
│   └── subscribers.js     # Webhook distributor
├── config.json            # Configuration file (gitignored)
├── config.example.json    # Example configuration
├── ecosystem.config.js    # PM2 configuration
└── package.json
```

### Running Tests

This project uses a separate testing repository for integration tests:

```bash
# Clone the tester repository
git clone https://github.com/yourorg/claude-code-pipe-tester-node-red.git

# Start Node-RED tester
cd claude-code-pipe-tester-node-red
npm start
```

Access the Node-RED UI at `http://localhost:1880` to test webhook events.

## License

MIT
