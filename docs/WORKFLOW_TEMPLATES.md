# Workflow Templates

CodexApp uses reusable workflow templates for common agent tasks. Templates live in `shared/workflow-templates.ts` so the renderer, slash-command layer, and Electron automation runner share the same prompt source.

## Included Templates

- `code-review`: reviews changed code for regressions, missing tests, unsafe tool behavior, packaging risk, and UX regressions.
- `test-repair`: diagnoses failing tests, applies the smallest durable fix, and reruns relevant validation.
- `release-prep`: prepares release notes with user-facing changes, risks, validation status, and follow-up actions.
- `dependency-audit`: inspects package manifests, lockfiles, outdated packages, dependency risk, and validation commands.
- `ui-generation`: guides polished frontend implementation with typed code, accessibility, responsiveness, and artifact previews.

## Slash Commands

Workflow templates are available through slash commands:

- `/code-review Optional scope`
- `/fix-tests Optional test command or failure summary`
- `/release-prep Optional version or scope`
- `/release-notes Optional version or scope`
- `/dependency-audit Optional package manager or scope`
- `/ui Describe the interface or screen`

Aliases such as `/cr`, `/deps`, `/audit`, `/release`, `/changelog`, `/design`, and `/frontend` resolve to the same shared templates.

## Automation Usage

Automations can invoke workflows directly by storing a workflow slash command as their prompt. For example:

```text
/dependency-audit weekly npm dependency risk sweep
```

Before the automation calls the LLM, the Electron automation runner expands the command into the full durable workflow prompt. This keeps saved automations concise while still giving the model a robust execution plan.

The Automations panel also includes an optional workflow picker that can insert the expanded prompt into a new or edited automation.

## Test Coverage

- `shared/workflow-templates.test.ts` covers template expansion, alias parsing, defaults, and help output.
- `src/services/slash-commands.test.ts` verifies slash commands use workflow templates.
- `electron/automation-service.test.ts` verifies workflow slash commands are expanded before unattended automation runs.
