# README Maintainer Plugin

This is an example local plugin for CodexApp Multi APIs.

The current plugin system reads `plugin.json`, displays declared capabilities and permissions in the plugin manager, persists enable or disable state, and exposes declared MCP-style connectors for permission-gated health checks.

## Capabilities

- `readme_review`: inspect README content for missing setup and usage details.
- `release_notes`: structure release-note drafts from Git context.
- `readme_mcp`: expose README helper metadata through a local stdio MCP-style connector.

## Permissions

- `readWorkspace`: this plugin expects read-only access to workspace files.
- `executeCommands`: this plugin can launch `mcp-server.mjs` when the user runs an MCP connector health check.

## MCP Connector

- `readme-tools`: starts `node mcp-server.mjs` from this plugin directory.
- Supported methods: `initialize`, `tools/list`, and `tools/call` for `readme_summary`.
- The connector is disabled until the plugin is enabled in the app.
