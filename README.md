# claude-code-pipe

A pipe for Claude Code input/output using JSONL and Express + WebSocket.

## Overview

claude-code-pipe (casual name: cc-pipe) is a lightweight Node.js server that:

- Watches Claude Code's JSONL session files
- Provides REST APIs to query session data
- Streams events via WebSocket (for local Web UI)
- Distributes events to external subscribers via HTTP POST
- Manages `claude -p` process spawning and cancellation

## Installation

```bash
npm install
```

## Configuration

Edit `config.json`:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "http://localhost:1880/claude-event",
      "label": "node-red",
      "level": "summary",
      "authorization": ""
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "LS", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000
  }
}
```

### Subscriber Levels

| Level | Protocol | Timing | Content |
|-------|----------|--------|---------|
| `status` | HTTP POST | Once per response | `{ sessionId, timestamp, status: "completed" }` |
| `summary` | HTTP POST | Once per response | `{ sessionId, timestamp, status, lastMessage }` |
| `stream` | HTTP POST | Every message (frequent) | Full watcher event |
| `stream-status` | HTTP POST | On state change | `{ sessionId, timestamp, status, lastMessage }` |

## Usage

Start the server:

```bash
npm start
```

You should see:

```
claude-code-pipe listening on port 3100
```

## API Endpoints

### Watch

- `GET /sessions` - List all sessions
- `GET /sessions/:id` - Get session history
- `GET /sessions/:id/latest` - Get latest assistant message
- `WS /ws` - WebSocket stream (for local Web UI)

### Send

- `POST /sessions/new` - Start a new session
  - Body: `{ "prompt": "...", "cwd": "/path/to/project" }`
- `POST /sessions/:id/send` - Send to existing session
  - Body: `{ "prompt": "..." }`

### Cancel

- `POST /sessions/:id/cancel` - Cancel managed process

### Management

- `GET /managed` - List managed processes

## License

MIT
