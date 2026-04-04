# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-04-04

### Added
- **User message Webhook**: New `user-message-received` event for tracking user prompts
- **Health endpoint**: `GET /health` returns status, version, and uptime
- **Version in Webhook payloads**: All Webhook events now include `version` field
- **Project info in session events**: `session-started` and `process-exit` now include `projectPath` and `projectName`

### Changed
- **sender.js options format**: `startNewSession()` and `sendToSession()` now use options object parameter
- **Startup log**: Now displays version (e.g., `claude-code-pipe v0.7.0 listening on port 3100`)

## [0.6.0] - 2026-03-25

### Breaking Changes
- **Parameter name change**: `cwd` → `projectPath` in Send API
  - `cwd` is now deprecated but still supported for backward compatibility
  - `projectPath` takes priority if both are provided
  - **Both `cwd` and `projectPath` are now required** - returns 400 error if neither is specified

### Added
- `projectPath` parameter in Send API (`POST /sessions/new`, `POST /sessions/:id/send`)
- Concrete example for `callbackUrl` in `config.example.json` (`"http://localhost:3100"`)

### Changed
- Default value removed from `cwd`/`projectPath` - explicit specification now required
- Enhanced `callbackUrl` documentation with usage examples in DETAILS-ja.md and DETAILS.md

### Documentation
- Added callbackUrl configuration examples section
- Added projectPath parameter documentation
- Added bidirectional communication examples (Node-RED ↔ claude-code-pipe)

## [0.5.0] - 2026-03-17

### Added
- Version API endpoint (`GET /version`)
  - Returns package name, version, and description from package.json
  - Useful for health checks and version verification

## [0.4.0 and earlier] - Initial Development Phase

### Core Features
- **Watch Mode**: Monitor Claude Code session files and extract structured data
- **Send Mode**: Send prompts to Claude Code via REST API
- **Cancel Mode**: Cancel running sessions programmatically
- **Webhook Distribution**: Distribute session events to external services

### API
- Session/message retrieval (`GET /sessions`, `/messages`)
- Session creation/sending (`POST /sessions/new`, `/:id/send`)
- Cancellation (`POST /sessions/:id/cancel`)
- Project/process management (`GET /projects`, `/managed`)
- WebSocket (`WS /ws`)

### Configuration
- Bearer Token authentication
- Webhook level settings (basic/full)
- Tool restrictions and cancel timeout

---

[0.7.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.0
[0.6.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.6.0
[0.5.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.5.0
