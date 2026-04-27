# Autonomous Product Todo

This document is the working backlog for closing the biggest gaps between this app and products like Codex app and Claude Code, while still preserving the strengths of a local-first multi-provider artifact workspace.

Status legend:
- `[ ]` not started
- `[-]` in progress
- `[x]` done

## Guiding Goal

Build a local-first AI coding desktop app that combines:
- broad multi-LLM support
- strong artifact and preview workflows
- safe local tool execution
- high-end agent workflows closer to Codex app and Claude Code

## Priority 1: Approval Center And Safer Autonomy

- [x] Build a real in-app approval center for blocked `read_file`, `write_file`, and `execute_terminal` actions.
- [x] Add approve once / approve for run / always allow options where safe.
- [x] Show pending approvals in the chat timeline and a dedicated review panel.
- [x] Let automations pause on approval-required actions instead of only failing with a policy message.
- [x] Add tests for approval lifecycle, cancellation, expiry, and replay protection.
- [x] Add an auto approval / unsafe option

Why this matters:
- This is the biggest remaining usability gap in the current tool-permission model.
- It makes autonomous runs much closer to real agent products without weakening safety.

## Priority 2: Multi-Agent Execution

- [x] Add support for multiple concurrent agent tasks inside one session.
- [x] Give each task its own status, logs, and artifact outputs.
- [x] Add a task switcher with progress states like queued, running, blocked, failed, completed.
- [x] Allow one agent to spawn sub-tasks with bounded scopes.
- [x] Persist task graphs and restore them after app restart.
- [x] Add tests for concurrent streams, cancellation, and state recovery.

Why this matters:
- This is one of the clearest product differences versus Codex app today.

## Priority 3: Workspace Isolation And Safer Execution Modes

- [x] Add optional isolated execution modes for agent work, starting with per-task working directories.
- [x] Create a “safe workspace clone” mode for risky operations.
- [x] Add explicit UX showing whether the current run is operating in the live workspace or an isolated copy.
- [x] Add cleanup and retention rules for temporary workspaces.
- [x] Add tests covering isolation boundaries and file sync behavior.

Why this matters:
- Codex-style sandboxes and worktrees are still a major gap.

## Priority 4: Git And Review Center

- [x] Build a review panel for changed files, diffs, and commit summaries.
- [x] Add staged/unstaged visibility inside the app.
- [x] Support commit drafting, branch creation, and PR prep from the UI.
- [x] Add a code-review mode that highlights risks, regressions, and missing tests.
- [x] Support inline review comments anchored to files and lines.

Why this matters:
- Both Codex app and Claude Code are stronger in review-centric workflows.

## Priority 5: Plugin, MCP, And Extensibility Layer

- [x] Design a first-class plugin system for external tools and skills.
- [x] Add MCP-style connectors so the app can talk to external servers and data sources.
- [x] Create a permission model for third-party tools.
- [x] Add a plugin manager UI with install, enable, disable, and status views.
- [x] Document a minimal plugin API and provide one example plugin.

Why this matters:
- This is one of the biggest gaps versus Claude Code.

## Priority 6: Hooks, Commands, And Reusable Workflows

- [x] Add slash-command support for frequent workflows.
- [x] Add a planning tool for breaking larger goals into structured execution steps.
- [x] Add prompt hooks / tool hooks / post-run hooks.
- [ ] Add reusable workflow templates for tasks like code review, release prep, dependency audits, and UI generation.
- [ ] Allow automations to invoke these workflows directly.
- [x] Add tests for hook ordering and failure handling.

Why this matters:
- This closes another major gap to Claude Code’s workflow ergonomics.

## Priority 7: Browser And UI Interaction Capabilities

- [ ] Add a browser automation or embedded browser execution layer.
- [ ] Support basic page navigation, screenshots, DOM extraction, and scripted interactions.
- [ ] Allow artifact previews to be validated automatically in-browser.
- [ ] Add guardrails for unsafe browsing or external actions.
- [ ] Add tests for preview validation and screenshot capture.

Why this matters:
- Browser and computer-use style workflows are still missing.

## Priority 8: Richer Session And Memory System

- [ ] Add project memory distinct from chat history.
- [ ] Add reusable instructions per workspace.
- [ ] Add “what changed since last run” summaries for automations and resumed sessions.
- [ ] Add searchable session history with filters by model, provider, tool use, and artifact type.
- [ ] Add export/import for sessions and memory.

Why this matters:
- This improves continuity and makes automations smarter over time.

## Priority 9: Capability-Aware Provider UX

- [ ] Add deeper provider-specific capability discovery where official APIs support it.
- [ ] Add provider health diagnostics for auth, models, tools, and streaming.
- [ ] Add saved provider profiles with masked keys and preferred defaults.
- [ ] Add account-linking support where providers officially allow it, including clear sign-in flows and linked-account status in the UI.
- [ ] Clearly distinguish consumer subscriptions like ChatGPT Plus / Claude Pro from real API access, and guide users toward supported billing or API-key setups.
- [ ] Add explicit fallback routing when a selected model is weak for agent use.
- [ ] Add tests for provider profile persistence and fallback selection.

Why this matters:
- This strengthens one of the app’s biggest differentiators: multi-provider support.

## Priority 10: Stronger Product Polish

- [ ] Add a command palette.
- [ ] Add global search across chats, artifacts, automations, and sessions.
- [ ] Add keyboard shortcuts for the main workflows.
- [ ] Improve empty states, onboarding, and first-run setup.
- [ ] Add clearer live status surfaces for streaming, tool activity, approvals, and automations.
- [ ] Add performance profiling and optimize any large renderer hotspots that remain.

## Priority 11: GUI SETTINGS

- [ ] Add a Autosacle for gui with scroll
- [ ] Add a Big chat overlay


Why this matters:
- Product feel is part of the gap, not only raw features.

## Suggested Execution Order

1. Approval center
2. Multi-agent execution
3. Workspace isolation
4. Git/review center
5. Plugin and MCP layer
6. Hooks and slash commands
7. Browser capabilities
8. Memory and session upgrades
9. Provider UX deepening
10. Final polish passes
11. Final GUI Settings

## Notes For Future Heartbeats

- Prefer shipping vertical slices over scaffolding only.
- Always verify with tests and builds after each meaningful change.
- Keep local-first strengths intact instead of copying cloud-only product assumptions blindly.
- When in doubt, prioritize safety and recoverability before adding more autonomy.





