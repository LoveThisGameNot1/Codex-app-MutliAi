# Plugin API

CodexApp plugins are local directories under `plugins/<plugin-id>` with a required `plugin.json` manifest.

The current implementation supports plugin discovery, validation, permission display, and persisted enable or disable state. Runtime execution is intentionally separate and will be added behind explicit permission gates.

## Manifest

```json
{
  "id": "readme-maintainer",
  "name": "README Maintainer",
  "version": "0.1.0",
  "description": "Example local plugin manifest.",
  "author": "CodexApp",
  "capabilities": [
    {
      "kind": "skill",
      "name": "readme_review",
      "description": "Reviews README content for missing setup and usage details."
    },
    {
      "kind": "mcp",
      "name": "readme_mcp",
      "description": "Exposes README helpers through a local stdio MCP-style connector."
    }
  ],
  "permissions": ["readWorkspace", "executeCommands"],
  "mcpConnectors": [
    {
      "id": "readme-tools",
      "name": "README Tools",
      "description": "Local stdio connector for README helper metadata.",
      "transport": "stdio",
      "command": "node",
      "args": ["mcp-server.mjs"],
      "timeoutMs": 5000
    }
  ],
  "entrypoint": "README.md"
}
```

## Required Fields

- `id`: stable plugin id using letters, numbers, dots, underscores, or hyphens.
- `name`: display name.
- `version`: plugin version.
- `description`: short user-facing summary.
- `capabilities`: declared plugin features.
- `permissions`: requested host permissions.
- `mcpConnectors`: optional list of MCP-style connector declarations.

## Capability Kinds

- `tool`
- `mcp`
- `skill`
- `automation`
- `workflow`

## Permissions

- `readWorkspace`: read workspace files.
- `writeWorkspace`: write workspace files.
- `executeCommands`: run local commands.
- `networkAccess`: access network resources.
- `storeSecrets`: store or read plugin secrets.

## MCP Connectors

MCP connector declarations let plugins expose external servers or data sources through the app's plugin bridge. The current runtime lists connectors in the plugin manager and can run permission-gated health checks from the Electron main process.

Supported transports:

- `stdio`: launches a local command and sends an MCP `initialize` JSON-RPC request over stdin. Requires `executeCommands`.
- `http`: sends an MCP `initialize` JSON-RPC request to an HTTP endpoint. Requires `networkAccess`.
- `sse`: opens an event-stream connection to an SSE endpoint. Requires `networkAccess`.

Connector fields:

- `id`: stable connector id unique within the plugin.
- `name`: display name.
- `description`: user-facing summary.
- `transport`: `stdio`, `http`, or `sse`.
- `command`: required for `stdio`.
- `args`: optional command arguments for `stdio`.
- `url`: required for `http` and `sse`.
- `env`: optional string environment values passed to `stdio` processes.
- `headers`: optional string headers for `http` and `sse` checks.
- `timeoutMs`: optional timeout clamped between 1000 and 30000 milliseconds.

Security notes:

- Do not store long-lived secrets directly in `plugin.json`; use future secret storage support for real credentials.
- Connectors from disabled plugins are listed but cannot be checked or used.
- A connector health check does not grant the plugin broader workspace access than its declared permissions.

## Status Model

- `disabled`: discovered and valid, but not active.
- `enabled`: valid and enabled by the user.
- `invalid`: manifest failed validation and cannot be enabled.
