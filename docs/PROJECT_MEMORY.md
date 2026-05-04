# Project Memory

CodexApp now stores durable workspace knowledge separately from chat history.

## Stored Data

- Workspace instructions: reusable conventions and rules for every future model run in the current workspace.
- Project memory: durable facts, preferences, architecture notes, and recurring constraints.
- Tags: optional labels for filtering and scanning memory entries in the UI.

The Electron main process persists this data in `project-memory.json` inside the app `userData` directory. Memory is isolated by workspace root, so entries from one project do not leak into another project.

## Prompt Injection

Before every model run, the LLM service loads the current workspace memory snapshot and appends it to the generated system prompt:

- Current workspace root.
- Reusable workspace instructions.
- Up to the latest 12 memory entries with tags.

This keeps durable project knowledge available without depending on long chat history or session persistence.

## UI

The Memory section is available from:

- Sidebar: `Memory`
- Slash command: `/memory`
- Aliases: `/instructions`, `/remember`

The panel supports:

- Editing reusable workspace instructions.
- Creating project memory entries.
- Editing and deleting memory entries.
- Showing tag counts and update timestamps.

## Test Coverage

- `electron/project-memory-service.test.ts` covers persistence, workspace isolation, validation, updates, and deletion.
- `electron/llm-service-memory.test.ts` verifies memory is injected into generated run prompts.
- `src/services/slash-commands.test.ts` verifies the memory slash command routing.
