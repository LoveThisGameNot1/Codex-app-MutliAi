# Session History Search

The Search panel now treats saved sessions as a first-class library instead of only query-matching current chat text.

## Indexed Metadata

Each persisted session summary exposes:

- `providerId` and `providerLabel`
- `model`
- `toolNames`
- `artifactTypes`
- title, preview, message count, timestamp, and resume summary

The metadata is generated locally from the persisted session log. No extra LLM call is required.

## Filters

The Search panel supports session filters for:

- provider
- model
- tool usage
- artifact type

Session filters work even when the text query is empty. The query field searches across session title, preview, resume summary, provider, model, tool names, and artifact types.

## Loading Sessions

Each matching saved session card includes a `Load session` action. Loading a session rebuilds chat messages, parsed artifacts, and tool-result messages through the existing session hydrator, then adds a resume summary system message for continuity.

## Compatibility

Older persisted sessions may not contain provider, model, tool, or artifact metadata on disk. The summary layer still emits empty arrays for tool and artifact filters, and the renderer defensively handles missing metadata during upgrades.
