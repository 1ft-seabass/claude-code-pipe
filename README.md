# claude-code-pipe

A simple bidirectional pipe for Claude Code sessions.

[日本語版はこちら](./README-ja.md)

## Overview

**claude-code-pipe** is a lightweight library that simply pipes Claude Code's behavior bidirectionally.

It watches Claude Code's JSONL session files, provides REST APIs for interaction, and distributes session events via webhooks. You can send prompts to Claude Code programmatically and receive events when responses are ready.

## What This Does (and Doesn't Do)

### ✅ What it does
- Watches Claude Code session files and provides REST API access
- Sends prompts to Claude Code programmatically
- Distributes session events via webhooks
- Lightweight implementation for personal workflow automation

### ❌ What it doesn't do
- Provide a UI (you bring your own frontend)
- Manage Claude Code installation or updates
- Guarantee compatibility across all Claude Code versions

### 🚫 What we won't do
- Enterprise features (complex auth, rate limiting, multi-tenancy)
- Database persistence (in-memory cache only)
- Maintain compatibility when Claude Code makes breaking changes

## Features

- **Watch Mode**: Monitor Claude Code session files and extract structured data
- **Send Mode**: Send prompts to Claude Code via REST API (creates `claude -p` processes)
- **Cancel Mode**: Cancel running sessions programmatically
- **Webhook Distribution**: Send session events to external services (e.g., Node-RED, Slack)
- **Process Management**: Automatic restart with PM2 support

## Quick Start

### Step 1: Install and Start

Install dependencies:

```bash
npm install
```

Copy the example config and edit it:

```bash
cp config.example.json config.json
```

Edit `config.json` - at minimum, set your `watchDir`:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

Start the server:

```bash
# Using PM2 (Recommended)
npm run pm2:start

# Or direct start (Development)
npm start
```

You should see:

```
claude-code-pipe listening on port 3100
Watching directory: /home/user/.claude/projects
```

### Step 2: Watch Mode (Read-Only)

Test the API by listing sessions:

```bash
curl http://localhost:3100/sessions
```

You'll get session metadata including message counts, timestamps, and previews:

```json
{
  "sessions": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "messageCount": 12,
      "totalTokens": 15000,
      "firstUserMessage": "What is the project structure?",
      "lastAssistantMessage": "You're welcome!"
    }
  ]
}
```

Get all messages from a session:

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages
```

Get the latest assistant response:

```bash
curl http://localhost:3100/sessions/SESSION_ID/messages/assistant/latest
```

This is the safest way to start - you're only reading existing session data.

### Step 3: Send Mode (Optional)

Once you're comfortable, you can send prompts to Claude Code.

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

Send to an existing session:

```bash
curl -X POST http://localhost:3100/sessions/SESSION_ID/send \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Follow-up message"}'
```

## Basic Configuration

### Minimal Setup

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100
}
```

### With Webhooks

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

### With API Token (Recommended for Production)

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token-here"
}
```

When `apiToken` is set, all API requests must include an `Authorization` header:

```bash
curl -H "Authorization: Bearer your-secret-token-here" \
  http://localhost:3100/sessions
```

For more configuration options, see [DETAILS.md](./DETAILS.md).

## Common Use Cases

### Monitor Claude Code Sessions

Watch for new responses and send notifications:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "subscribers": [
    {
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "label": "slack",
      "level": "basic",
      "includeMessage": false
    }
  ]
}
```

### Automate Claude Code Workflows

Create sessions programmatically and receive results via webhooks:

```json
{
  "watchDir": "~/.claude/projects",
  "port": 3100,
  "apiToken": "your-secret-token",
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

## PM2 Management

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

## Documentation

- **[DETAILS.md](./DETAILS.md)** - Complete API reference, configuration options, webhook formats, and troubleshooting
- **[DETAILS-ja.md](./DETAILS-ja.md)** - 日本語版の詳細ドキュメント

## Project Philosophy

This project is **intentionally minimal** and built to solve a specific personal need.

### Maintenance Policy

- **Primary focus**: Features that improve the author's daily workflow
- **Claude Code updates**: Breaking changes will be followed on a best-effort basis
- **Issues**: Feel free to open them, but timely responses are not guaranteed
- **Pull requests**: Contributions are appreciated! However, PRs that add significant complexity or diverge from the minimal philosophy may not be merged. Consider forking for major feature additions.

### Why This Approach?

This tool was born from a real need: "I want to interact with Claude Code sessions programmatically, with minimal overhead."

Instead of building a full-featured platform, we keep it simple:
- Small codebase that's easy to understand and modify
- Just enough features to be useful
- If you need more features, you're encouraged to fork or extend it

**Note**: This is a personal tool made public. Use it as-is, fork it for your needs, or contribute improvements—but don't expect enterprise-level support.

## License

MIT
