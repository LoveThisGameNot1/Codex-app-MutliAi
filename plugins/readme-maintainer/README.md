# README Maintainer Plugin

This is an example local plugin for CodexApp Multi APIs.

The current plugin system reads `plugin.json`, displays declared capabilities and permissions in the plugin manager, and persists enable or disable state. Plugin execution is intentionally not enabled yet; external code execution will be added behind explicit permission gates.

## Capabilities

- `readme_review`: inspect README content for missing setup and usage details.
- `release_notes`: structure release-note drafts from Git context.

## Permissions

- `readWorkspace`: this plugin expects read-only access to workspace files.
