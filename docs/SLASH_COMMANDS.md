# Slash Commands

CodexApp supports local slash commands in the chat composer. Type `/` to show available commands.

Slash commands are handled before a message is sent to the model:

- Local commands change app state immediately.
- Prompt-template commands expand into durable agent prompts and then start a normal chat run.
- Unknown commands are shown as system messages so mistakes are easy to recover from.

## Session

- `/help`: show the available commands.
- `/new Optional task title`: create a new task in the current session.
- `/reset`: start a fresh session.

## Navigation

- `/search`: open workspace search.
- `/review`: open the Git review center.
- `/plugins`: open providers, plugins, and MCP connectors.
- `/automations`: open scheduled work and automation runs.
- `/settings`: open runtime settings.

## Workspace

- `/safe-clone`: move the active task into an isolated safe workspace clone.
- `/live-workspace`: discard the active task clone and return to the live workspace.

## Agent Workflows

- `/code-review Optional scope`: ask the agent for a rigorous review focused on regressions, risks, and tests.
- `/fix-tests Optional test command or failure summary`: ask the agent to reproduce, diagnose, fix, and verify failing tests.
- `/release-notes Optional version or scope`: ask the agent to inspect Git context and draft release notes.
- `/ui Describe the interface or screen`: ask the agent to design and implement a polished UI workflow.

## Implementation Notes

- Commands are defined in `src/services/slash-commands.ts`.
- Runtime execution is wired in `src/services/chat-runtime.ts`.
- Composer suggestions are shown in `src/components/ChatComposer.tsx`.
