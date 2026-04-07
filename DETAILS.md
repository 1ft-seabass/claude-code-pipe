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
    "cancelTimeoutMs": 3000,
    "defaultDangerouslySkipPermissions": false
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
| `projectTitle` | string | No | `null` | User-defined project title (included in webhook payloads as `projectTitle`) |
| `callbackUrl` | string | No | `null` | Callback URL for this server (included in webhook payloads as `callbackUrl`, useful for webhook receivers to send commands back) |
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
| `defaultDangerouslySkipPermissions` | boolean | No | `false` | **⚠️ DANGEROUS:** Default value for skipping permission confirmations. When `true`, all Send API requests will skip permission confirmations unless explicitly overridden. Use with extreme caution. See [Security Considerations](#security-considerations) for details. |

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
    "cancelTimeoutMs": 5000,
    "defaultDangerouslySkipPermissions": false
  }
}
```

#### With callbackUrl and projectTitle (Bidirectional Communication)

Useful when webhook receivers need to send messages back to claude-code-pipe via the Send API.

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here",
  "projectTitle": "My Project",
  "callbackUrl": "http://localhost:3100",
  "subscribers": [
    {
      "url": "http://localhost:1880/webhook",
      "label": "node-red",
      "level": "basic",
      "includeMessage": true
    }
  ],
  "send": {
    "defaultAllowedTools": ["Read", "Grep", "Write", "Bash"],
    "cancelTimeoutMs": 3000,
    "defaultDangerouslySkipPermissions": false
  }
}
```

**callbackUrl usage:**
- Included in webhook payloads as the `callbackUrl` field
- Webhook receivers can use this URL to send messages to claude-code-pipe's Send API
- Example: Node-RED can make requests to `{{callbackUrl}}/sessions/{{sessionId}}/send`

**projectTitle usage:**
- Included in webhook payloads as the `projectTitle` field
- Helps manage projects with human-friendly names

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

List all available sessions with metadata.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `detail` | boolean | No | `false` | Include detailed message objects instead of strings |
| `excludeAgents` | boolean | No | `true` | Exclude `agent-*` sessions (internal Claude Code agents) |
| `excludeEmpty` | boolean | No | `true` | Exclude sessions with no messages (`messageCount === 0`) |

**Simple Version (default):**

```bash
curl http://localhost:3100/sessions
```

**With Filters:**

```bash
# Show all sessions including agent-* and empty sessions
curl "http://localhost:3100/sessions?excludeAgents=false&excludeEmpty=false"

# Show only agent-* sessions excluded
curl "http://localhost:3100/sessions?excludeEmpty=false"

# Show only empty sessions excluded
curl "http://localhost:3100/sessions?excludeAgents=false"
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "lastModifiedAt": "2026-03-01T10:30:00.000Z",
      "messageCount": 12,
      "userMessageCount": 6,
      "assistantMessageCount": 6,
      "totalTokens": 15000,
      "projectPath": "/home/user/workspace/my-app",
      "projectName": "my-app",
      "firstUserMessage": "What is the project structure?",
      "lastUserMessage": "Thank you",
      "firstAssistantMessage": "Let me check the project structure...",
      "lastAssistantMessage": "You're welcome!"
    }
  ]
}
```

**Detailed Version:**

```bash
curl http://localhost:3100/sessions?detail=true
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "lastModifiedAt": "2026-03-01T10:30:00.000Z",
      "messageCount": 12,
      "userMessageCount": 6,
      "assistantMessageCount": 6,
      "totalTokens": 15000,
      "projectPath": "/home/user/workspace/my-app",
      "projectName": "my-app",
      "firstUserMessage": {
        "content": "What is the project structure?",
        "timestamp": "2026-03-01T10:00:00.000Z"
      },
      "lastUserMessage": {
        "content": "Thank you",
        "timestamp": "2026-03-01T10:28:00.000Z"
      },
      "firstAssistantMessage": {
        "content": "Let me check the project structure...",
        "timestamp": "2026-03-01T10:00:05.000Z",
        "usage": {
          "input_tokens": 100,
          "output_tokens": 50
        }
      },
      "lastAssistantMessage": {
        "content": "You're welcome!",
        "timestamp": "2026-03-01T10:30:00.000Z",
        "usage": {
          "input_tokens": 200,
          "output_tokens": 30
        }
      }
    }
  ]
}
```

**Metadata Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session ID |
| `createdAt` | string | ISO 8601 timestamp of first message |
| `lastModifiedAt` | string | ISO 8601 timestamp of last message |
| `messageCount` | number | Total number of messages (user + assistant) |
| `userMessageCount` | number | Number of user messages |
| `assistantMessageCount` | number | Number of assistant messages |
| `totalTokens` | number | Total tokens used (input + output) |
| `projectPath` | string | Full path to the project directory |
| `projectName` | string | Project directory name |
| `firstUserMessage` | string/object | First user message (string in simple version, object in detailed version) |
| `lastUserMessage` | string/object | Last user message (string in simple version, object in detailed version) |
| `firstAssistantMessage` | string/object | First assistant message (string in simple version, object in detailed version) |
| `lastAssistantMessage` | string/object | Last assistant message (string in simple version, object in detailed version) |

**Notes:**

- The simple version returns message content as strings for quick UI display
- The detailed version includes full message objects with timestamps and usage data
- Results are cached in memory using file modification time (mtime) for performance
- Cache is automatically invalidated when session files are modified

#### `GET /sessions/:id/messages`

Get all messages from a session.

**Query Parameters:**

- `projectPath` (optional): Filter by project path when multiple sessions with the same ID exist across different projects

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages

# With projectPath filter
curl "http://localhost:3100/sessions/SESSION_ID/messages?projectPath=/path/to/project"
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

**Query Parameters:**

- `projectPath` (optional): Filter by project path when multiple sessions with the same ID exist across different projects

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/first

# With projectPath filter
curl "http://localhost:3100/sessions/SESSION_ID/messages/user/first?projectPath=/path/to/project"
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

**Query Parameters:**

- `projectPath` (optional): Filter by project path when multiple sessions with the same ID exist across different projects

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/user/latest

# With projectPath filter
curl "http://localhost:3100/sessions/SESSION_ID/messages/user/latest?projectPath=/path/to/project"
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

**Query Parameters:**

- `projectPath` (optional): Filter by project path when multiple sessions with the same ID exist across different projects

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/first

# With projectPath filter
curl "http://localhost:3100/sessions/SESSION_ID/messages/assistant/first?projectPath=/path/to/project"
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

**Query Parameters:**

- `projectPath` (optional): Filter by project path when multiple sessions with the same ID exist across different projects

**Request:**

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest

# With projectPath filter
curl "http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest?projectPath=/path/to/project"
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
    "projectPath": "/path/to/project",
    "allowedTools": ["Read", "Grep", "Write"],
    "dangerouslySkipPermissions": false
  }'
```

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Prompt to send to Claude Code |
| `projectPath` | string | Yes | - | Working directory for the session (project path). Use the same value as `projectPath` from webhooks. |
| `cwd` | string | No | - | **Deprecated:** Old name for `projectPath`. Supported for backward compatibility, but `projectPath` takes precedence. |
| `allowedTools` | array | No | `config.send.defaultAllowedTools` | Allowed tools for Claude Code |
| `disallowedTools` | array | No | `[]` | Tools to disallow for Claude Code. Supports pattern matching (e.g., `["Edit", "Write", "Bash(rm *)"]`) |
| `model` | string | No | - | Model to use (e.g., `"sonnet"`, `"opus"`). If not specified, uses Claude Code's default |
| `dangerouslySkipPermissions` | boolean | No | `config.send.defaultDangerouslySkipPermissions` (default: `false`) | **⚠️ DANGEROUS:** Skip permission confirmations. Use with extreme caution. See [Security Considerations](#security-considerations) for details. |

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
  -d '{
    "prompt": "Follow-up message",
    "projectPath": "/path/to/project",
    "allowedTools": ["Read", "Grep", "Write"],
    "dangerouslySkipPermissions": false
  }'
```

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Prompt to send |
| `projectPath` | string | Yes | - | Working directory for the session (project path). Use the same value as `projectPath` from webhooks. |
| `cwd` | string | No | - | **Deprecated:** Old name for `projectPath`. Supported for backward compatibility, but `projectPath` takes precedence. |
| `allowedTools` | array | No | `config.send.defaultAllowedTools` | Allowed tools for Claude Code |
| `disallowedTools` | array | No | `[]` | Tools to disallow for Claude Code. Supports pattern matching (e.g., `["Edit", "Write", "Bash(rm *)"]`) |
| `model` | string | No | - | Model to use (e.g., `"sonnet"`, `"opus"`). If not specified, uses Claude Code's default |
| `dangerouslySkipPermissions` | boolean | No | `config.send.defaultDangerouslySkipPermissions` (default: `false`) | **⚠️ DANGEROUS:** Skip permission confirmations. Use with extreme caution. See [Security Considerations](#security-considerations) for details. |

**Response:**

```json
{
  "success": true,
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "pid": 12345,
  "message": "Message sent successfully"
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

#### `GET /version`

Get version information of claude-code-pipe.

**Request:**

```bash
curl http://localhost:3100/version
```

**Response:**

```json
{
  "name": "claude-code-pipe",
  "version": "0.5.0",
  "description": "A pipe for Claude Code input/output using JSONL and Express + WebSocket"
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name |
| `version` | string | Current version (from package.json) |
| `description` | string | Package description |

#### `GET /projects`

List all projects with their sessions.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `excludeAgents` | boolean | No | `true` | Exclude `agent-*` sessions (internal Claude Code agents) |
| `excludeEmpty` | boolean | No | `true` | Exclude sessions with no messages (`messageCount === 0`) |

**Request:**

```bash
curl http://localhost:3100/projects
```

**With Filters:**

```bash
# Show all sessions including agent-* and empty sessions
curl "http://localhost:3100/projects?excludeAgents=false&excludeEmpty=false"

# Show only agent-* sessions excluded
curl "http://localhost:3100/projects?excludeEmpty=false"

# Show only empty sessions excluded
curl "http://localhost:3100/projects?excludeAgents=false"
```

**Response:**

```json
{
  "projects": [
    {
      "projectPath": "/home/user/workspace/my-app",
      "projectName": "my-app",
      "sessionCount": 5,
      "sessions": [
        {
          "id": "01234567-89ab-cdef-0123-456789abcdef",
          "mtime": 1709280000000
        }
      ]
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `projectPath` | string | Full path to the project directory |
| `projectName` | string | Project directory name |
| `sessionCount` | number | Number of sessions in this project (after filters applied) |
| `sessions` | array | Array of session objects (id, mtime) (after filters applied) |

**Notes:**

- Projects are sorted by session count (descending)
- Uses the same path extraction logic as Webhook v2
- By default, `agent-*` sessions and empty sessions are excluded
- Set `excludeAgents=false` and `excludeEmpty=false` to see all sessions

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

#### `GET /claude-version`

Get the Claude Code CLI version.

**Request:**

```bash
curl http://localhost:3100/claude-version
```

**Response:**

```json
{
  "version": "2.0.45",
  "raw": "2.0.45 (Claude Code)"
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Parsed version number |
| `raw` | string | Raw output from `claude --version` |

**Error Response (if Claude CLI not found):**

```json
{
  "error": "Failed to get Claude version",
  "message": "claude command not found"
}
```

#### `GET /processes`

List all managed processes with detailed information.

**Request:**

```bash
curl http://localhost:3100/processes
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

#### `DELETE /processes/:sessionId`

Kill a specific managed process by session ID.

**Request:**

```bash
curl -X DELETE http://localhost:3100/processes/SESSION_ID
```

**Response (success):**

```json
{
  "success": true,
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": "Process killed"
}
```

**Response (not found):**

```json
{
  "success": false,
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "message": "Process not found"
}
```

#### `DELETE /processes`

Kill all managed processes.

**Request:**

```bash
curl -X DELETE http://localhost:3100/processes
```

**Response:**

```json
{
  "success": true,
  "killed": 3,
  "message": "All processes killed"
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` on success |
| `killed` | number | Number of processes killed |
| `message` | string | Status message |

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
| `cwdPath` | string | Full path of the server's working directory (claude-code-pipe) |
| `cwdName` | string | Base name of the server's working directory |
| `callbackUrl` | string | Callback URL for this server (null if not set in config.json) |
| `projectPath` | string | Full path of the session's project directory (optional, extracted from JSONL path) |
| `projectName` | string | Base name of the session's project directory (optional, extracted from JSONL path) |
| `projectTitle` | string | User-defined project title (optional, only if set in config.json) |
| `source` | string | Event source: `watcher`, `api`, or `cli` |

Additional fields depend on `includeMessage` setting.

### Basic Event (includeMessage: false)

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectPath": "/home/user/projects/my-app",
  "projectName": "my-app",
  "projectTitle": "My Application",
  "source": "cli",
  "tools": [],
  "responseTime": 5234
}
```

**Note**:
- `projectPath` and `projectName` are extracted from JSONL file path and only available for `assistant-response-completed` events
- `projectTitle` is only included if set in `config.json`
- `callbackUrl` is `null` if not set in `config.json`

### Full Event (includeMessage: true)

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectPath": "/home/user/projects/my-app",
  "projectName": "my-app",
  "projectTitle": "My Application",
  "source": "cli",
  "tools": [],
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
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectTitle": "My Application",
  "pid": 12345,
  "source": "sender"
}
```

#### assistant-response-completed

```json
{
  "type": "assistant-response-completed",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:00:05.000Z",
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectPath": "/home/user/projects/my-app",
  "projectName": "my-app",
  "projectTitle": "My Application",
  "source": "cli",
  "tools": [],
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
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectTitle": "My Application",
  "pid": 12345,
  "source": "sender",
  "code": 0
}
```

#### cancel-initiated

```json
{
  "type": "cancel-initiated",
  "sessionId": "01234567-89ab-cdef-0123-456789abcdef",
  "timestamp": "2026-03-01T12:02:00.000Z",
  "cwdPath": "/home/user/workspace/repos/claude-code-pipe",
  "cwdName": "claude-code-pipe",
  "callbackUrl": "http://claude-code-pipe:3100",
  "projectTitle": "My Application",
  "pid": 12345,
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

**Solution 2:** Check the server log output for errors.

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

**Solution 3:** Check the server logs to see if the process was force-killed.

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

Then restart the server.

---

### Server won't start

**Symptom:** Server won't start or stops immediately.

**Solution 1:** Check the server log output to identify errors.

**Solution 2:** Restart the server:

```bash
npm run pm2:restart
```

**Solution 3:** Delete and restart:

```bash
# Stop the server (Ctrl+C) and restart
npm start
```

---

### Platform-specific issues

**Symptom:** `POST /sessions/new` or `POST /sessions/:id/send` returns 501 on Windows.

**Recommended solutions:**

1. **Use Claude Code CLI directly** for sending messages on Windows:
   ```bash
   claude -p "your prompt" --output-format stream-json
   ```

2. **Use WSL** (Windows Subsystem for Linux) for full functionality:
   - Install WSL2 on Windows
   - Run `claude-code-pipe` inside WSL
   - All features work as on Linux

3. **Use Watch Mode only** on Windows native:
   - Webhook-based session monitoring works on all platforms
   - Configure webhooks to receive notifications when Claude Code responds

**Technical background:**

Our current implementation uses the `script` command (Linux/Unix) to provide a pseudo-terminal (PTY), which prevents output buffering issues when spawning Claude CLI processes. When we tested on Windows, we explored several alternatives but haven't found a lightweight solution that fits this project's minimal philosophy:

- **PowerShell / direct spawn**: Encountered buffering issues in our testing
- **Git Bash**: The MinGW environment doesn't include the `script` command
- **node-pty**: While this would solve the issue, it requires native compilation which increases setup complexity

We've chosen to keep the implementation simple and recommend WSL for Windows users who need the full Send Mode functionality.

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

## Security Considerations

### ⚠️ `dangerouslySkipPermissions` Flag

The `dangerouslySkipPermissions` flag bypasses Claude Code's permission confirmation prompts for tool usage. **This is extremely dangerous and should only be used in controlled, trusted environments.**

#### How It Works

- **Default behavior**: `false` (safe)
  - Claude Code will prompt for permission before executing tools like `Write`, `Bash`, etc.
  - User must manually approve each tool use

- **When enabled** (`true`):
  - Claude Code executes all allowed tools **without user confirmation**
  - No safety prompts for file writes, command execution, etc.
  - Fully automated operation

#### Configuration Options

1. **Per-request override** (recommended):
   ```json
   {
     "prompt": "Your prompt",
     "dangerouslySkipPermissions": true
   }
   ```

2. **Global default** (use with extreme caution):
   ```json
   {
     "send": {
       "defaultDangerouslySkipPermissions": true
     }
   }
   ```

#### Security Risks

When `dangerouslySkipPermissions` is enabled:

- ⚠️ Claude Code can **write/modify/delete any files** in the working directory
- ⚠️ Claude Code can **execute arbitrary bash commands**
- ⚠️ No human oversight before destructive operations
- ⚠️ Malicious or incorrect prompts can cause data loss

#### Safe Usage Guidelines

**Only enable this flag when ALL of these conditions are met:**

1. ✅ You are in a **sandboxed/isolated environment** (Docker container, VM, etc.)
2. ✅ The working directory contains **no critical data**
3. ✅ You **fully trust the prompt** being sent
4. ✅ You have **backups** of all important data
5. ✅ You are **actively monitoring** the session

**Example safe use case:**
- Automated testing in a disposable Docker container
- CI/CD pipeline in an isolated environment
- Development environment with version control

**Example unsafe use case:**
- ❌ Production servers
- ❌ Directories with sensitive data
- ❌ Shared development machines
- ❌ Any environment without proper backups

#### Recommended Alternative

For most use cases, use `allowedTools` to restrict tool usage instead:

```json
{
  "prompt": "Analyze this code",
  "allowedTools": ["Read", "Grep"],
  "dangerouslySkipPermissions": false
}
```

This allows Claude Code to read files without granting write/execute permissions.

---

## License

MIT
