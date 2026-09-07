# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.7] - 2026-09-07

### Added
- **`POST /projects/file` now supports images**: extensions in `config.viewer.imageExtensions` (default `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.ico`, `.svg`) are no longer blocked — they're returned base64-encoded with a `mimeType`, so viewers can build a displayable image directly (`data:${mimeType};base64,${content}`). Text responses gain an `encoding: "utf8"` field (additive, no breaking change). Image size is capped separately via `config.viewer.maxImageFileSize` (default 5MB)
- **`GET /sessions/:id/messages` gains `textOnly` and `limit` query params**: `?textOnly=true` returns a simplified array of `{ role, timestamp, text }` turns with `tool_use`/`tool_result` content blocks and `isMeta` events stripped out (a turn whose text ends up empty is omitted entirely). `?limit=N` keeps only the last N entries of the (optionally filtered) array — useful for handoff-style "just the last few dozen turns" summaries. Neither param changes the default (unparameterized) response

## [0.8.6] - 2026-09-06

### Added
- **`POST /projects/file`**: Returns the content of a single text file within a project, for viewer UIs (e.g. pipe-viewer) to render notes/docs/source inline instead of only linking out to code-server
  - Body: `{ projectPath, filePath }` (relative to `projectPath`, trusted-caller model consistent with `/git/status` and `/git/log`)
  - Response: `{ content, mtime, size }`
  - Path traversal and symlink escape outside `projectPath` are rejected (`400`)
  - Any hidden file/directory (a path segment starting with `.`, e.g. `.env`, `.git/`, `.ssh/`) is always blocked, regardless of git status
  - Files matched by `.gitignore` are blocked when the project is a git repository (best-effort — skipped if `projectPath` isn't a git repo)
  - Binary/non-text extensions are blocked via `config.viewer.deniedExtensions` (images, archives, executables, fonts, media, etc. — configurable, defaults cover common binary types)
  - File size is capped by `config.viewer.maxFileSize` (default 1MB, returns `413` if exceeded)

## [0.8.5] - 2026-08-11

### Fixed
- **`projectPath` existence is now validated before spawning**: `/sessions/new` and `/sessions/:id/send` now check that the requested working directory exists on disk (`fs.existsSync`) and return `400 projectPath does not exist` immediately if it doesn't — instead of reaching `spawn()` and surfacing a confusing `ENOENT`. This also prevents a self-amplifying loop where a broken `projectPath` (e.g. from a legacy `extractProjectPath` encoding bug) caused a `session-error` event that carried the same broken path back to clients, which then stored and re-sent it on every subsequent request

## [0.8.4] - 2026-07-08

### Added
- **Windows native Send Mode support**: `POST /sessions/new` and `POST /sessions/:id/send` now work on Windows (native), not just WSL — previously returned `501 Not Implemented`. Process spawning is abstracted via `spawnClaudeProcess()`, which branches only on how the `claude` process is launched (array-argument `spawn()` on Windows, the existing `script`/PTY wrapper unchanged on Unix)

### Fixed
- **`extractProjectPath()` didn't recognize Windows-style encoded paths**: directory names starting with a drive letter (e.g. `C--Users-...`) were treated as unrecognized and returned `null`, causing `projectPath` to be silently missing from webhook payloads and absent from `GET /projects` / `GET /sessions` on Windows
- **Pre-commit secretlint bypass removed**: `simple-git-hooks` no longer swallows `secretlint`/`gitleaks` failures with `|| true` — failures now actually block the commit
- **Pre-commit secretlint false positives on gitignored files**: scan scope narrowed from all files to staged files only, so files like `logs/server.log` no longer trigger warnings on unrelated commits
- **Raw session content no longer logged**: `watcher`'s `message` event (which can include full executed command text) is no longer written to `server.log`

### Security
- Documented that `subscribers[].url` should only point to endpoints inside your trusted network, since webhook payloads include raw session content (including command text) with no filtering or masking

## [0.8.3] - 2026-06-21

### Added
- **Webhook payload enrichment**: All subscriber payloads now include:
  - `os`: Server OS type (`"mac"` / `"linux"` / `"windows"`; WSL is reported as `"linux"`)
  - `isSubagent`: `true` if the event originated from a `/subagents/` path
  - `isMeta`: `true` if the message was auto-injected by the Claude Code harness (system-reminder etc.)
  - `communicationMode`: Current mode (`"bidirectional"` / `"webhook-only"` / `"watch-only"`) — lets viewers know the pipe's capability without polling `GET /info`
  - `mqttCommandTopic`: MQTT command topic name when configured (broker credentials are never included)
- **`GET /info` endpoint**: Returns current pipe configuration state — `version`, `os`, `communicationMode`, `callbackUrl`, `subscriberCount`, `projectTitle`, `watchDir`

### Changed
- **Always-on delivery**: `level` and `includeMessage` filtering are removed. All events and full message content are always delivered to subscribers
  - Existing configs that still contain `level` or `includeMessage` continue to work (fields are silently ignored)
  - Filtering is now the viewer's responsibility, enabling richer client-side logic (e.g. hide `isMeta` noise, observe subagent launches)
- **Internal rename**: `postToSubscriber` → `deliverToSubscriber` (no behavior change; prepares for future MQTT dispatch)

### Removed
- `level` / `includeMessage` subscriber config options (deprecated; silently ignored if present)

## [0.8.2] - 2026-06-04

### Fixed
- **Project path extraction with hyphens**: `extractProjectPath` now reads the `cwd` field directly from the JSONL file, resolving project paths correctly even when usernames or directory names contain hyphens
  - Previously, the fallback logic converted all hyphens to slashes (e.g., `seigo-tanaka` → `seigo/tanaka`), causing `ENOENT` errors in environments where the path could not be verified via `existsSync` (e.g., running outside Docker)
  - New logic reads the first 2KB of the JSONL file to find a `cwd` field, which Claude Code writes reliably on every session
  - Falls back to the existing `existsSync`-based candidate matching if the JSONL cannot be read or contains no `cwd` field

## [0.8.1] - 2026-05-25

### Added
- **Attachments config API**: `GET /attachments-config` returns current upload settings (`maxBodySize`, `allowedExtensions`) so viewers can display accepted file types and size limits
- **Configurable upload settings**: New `upload` section in `config.json`
  - `maxBodySize`: Maximum request body size (default: `"10mb"`)
  - `allowedExtensions`: List of allowed file extensions (default: `[".jpg", ".jpeg", ".png", ".pdf", ".txt", ".md"]`)

### Changed
- **Renamed `POST /images` → `POST /attachments`**: More accurate name for a general file attachment endpoint

## [0.8.0] - 2026-05-24

### Added
- **Git status API**: `GET /git/status` returns branch, ahead/behind counts, and change statistics for a project
  - `?files=true` query parameter to include full file lists (staged, unstaged, untracked)
- **Git log API**: `GET /git/log` returns commit history with `unpushed` flag per commit and total `unpushedCount`
  - `?limit=N` query parameter to control number of commits (default: 20)
- **Image upload API**: `POST /images` accepts base64-encoded files and saves them to `/tmp/claude-code-pipe/`
  - Supported types: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.txt`, `.md`
  - Filename sanitization and UUID prefix for collision avoidance

### Fixed
- **Shell argument escaping**: Prompts containing backticks (`` ` ``) or `$` characters no longer cause shell expansion when sent via Send API
  - All arguments are now wrapped in double quotes with proper escaping of `\`, `"`, `` ` ``, and `$`
- **Git output leading whitespace**: Fixed `execGitCommand` stripping leading whitespace from multi-line output (`.trim()` → `.trimEnd()`)

## [0.7.5] - 2026-04-16

### Added
- **Init event info in Send API responses**: `POST /sessions/new` and `POST /sessions/:id/send` now return detailed info from Claude Code's init event
  - `model`: Actual model used (e.g., `"claude-sonnet-4-6"`, `"claude-opus-4-6[1m]"`) — enables observing whether the specified model was actually applied
  - `cwd`: Working directory reported by Claude Code
  - `permissionMode`: Permission mode (e.g., `"default"`)
  - `claudeCodeVersion`: Claude Code CLI version
  - `apiKeySource`: API key source
  - `tools`: List of available tools (reflects `allowedTools`/`disallowedTools` filtering)
- **Model info in `session-started` webhook**: `model` field added to `session-started` webhook payload

### Fixed
- **Send timeout**: `POST /sessions/:id/send` now has a 60-second timeout (same as `POST /sessions/new`) to prevent indefinite hanging when Claude Code process fails to emit init event

## [0.7.4] - 2026-04-10

### Fixed
- **Newline session separation bug**: Messages containing newlines (`\n`) caused shell to interpret them as command separators, splitting sessions and dropping CLI arguments (`--allowedTools`, `--model`, etc.)
  - Fixed quoting logic in `src/sender.js` to wrap newline-containing arguments in double quotes
- **First user message webhook miss**: Watcher's `add` event only recorded file position without reading content, causing the first user message to be missed by webhook

### Added
- **Chat message endpoints**: New endpoints that filter out tool interactions and return only pure conversation messages
  - `GET /sessions/:id/messages/chat/user/first`
  - `GET /sessions/:id/messages/chat/user/latest`
  - `GET /sessions/:id/messages/chat/assistant/first`
  - `GET /sessions/:id/messages/chat/assistant/latest`

### Documentation
- Added chat message endpoints documentation to DETAILS.md and DETAILS-ja.md

## [0.7.3] - 2026-04-07

### Added
- **Message retrieval with projectPath**: All message retrieval endpoints now support `projectPath` query parameter
  - `GET /sessions/:id/messages?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/user/first?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/user/latest?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/assistant/first?projectPath=/path/to/project`
  - `GET /sessions/:id/messages/assistant/latest?projectPath=/path/to/project`
  - Resolves ambiguity when same session ID exists in multiple projects
  - Maintains backward compatibility (works without projectPath parameter)

### Documentation
- Updated DETAILS.md and DETAILS-ja.md with projectPath query parameter documentation

## [0.7.2] - 2026-04-06

### Added
- **CLI options passthrough**: Send API now supports additional Claude Code CLI options
  - `disallowedTools`: Array of tools to disallow (e.g., `["Edit", "Write", "Bash(rm *)"]`)
  - `model`: Model selection (e.g., `"sonnet"`, `"opus"`)
- **Process management API**:
  - `GET /processes`: List all managed processes
  - `DELETE /processes/:sessionId`: Kill a specific process by session ID
  - `DELETE /processes`: Kill all managed processes
- **Claude version API**: `GET /claude-version` returns Claude Code CLI version

### Documentation
- Added new API endpoints to DETAILS.md and DETAILS-ja.md
- Added `disallowedTools` and `model` parameters to Send API documentation

## [0.7.1] - 2026-04-05

### Fixed
- **API session calls**: Fixed `startNewSession()` and `sendToSession()` calls in api.js to use correct options object format
  - Sessions were starting in wrong working directory due to signature mismatch
- **cancel-initiated event**: Now includes `projectPath` field for project identification
- **managedProcesses**: Now stores `projectPath` for use by canceller

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

[0.8.1]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.8.1
[0.8.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.8.0
[0.7.4]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.4
[0.7.3]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.3
[0.7.2]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.2
[0.7.1]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.1
[0.7.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.7.0
[0.6.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.6.0
[0.5.0]: https://github.com/1ft-seabass/claude-code-pipe/releases/tag/v0.5.0
