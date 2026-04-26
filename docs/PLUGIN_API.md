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
    }
  ],
  "permissions": ["readWorkspace"],
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

## Status Model

- `disabled`: discovered and valid, but not active.
- `enabled`: valid and enabled by the user.
- `invalid`: manifest failed validation and cannot be enabled.
