# Hooks

CodexApp now has a local hook layer inside the Electron main process. Hooks run around model requests and tool execution, independent of the selected LLM provider.

## Hook Stages

- `prompt.beforeSend`: runs after the base system prompt is built and before the user message is sent to the provider.
- `tool.beforeExecute`: runs before local tools execute.
- `tool.afterExecute`: runs after local tools complete or fail.
- `run.afterComplete`: runs before the final completion, cancellation, or error event is emitted.

## Built-In Hooks

- `builtin.prompt.run-context`: injects run metadata into the system prompt, including source, request id, provider/model, and working directory.
- `builtin.tool.argument-guard`: blocks malformed or unsafe tool arguments before filesystem or terminal execution.
- `builtin.tool.result-audit`: records tool result status and output byte count.
- `builtin.run.summary`: records final run status, response size, and tool count.

## Failure Handling

- Prompt and post-run hooks are observability hooks. If they fail, the run continues and the failure is surfaced as a hook event.
- `tool.beforeExecute` hooks can block execution. A blocking failure prevents the tool from running and returns the hook failure to the model/tool caller.
- `tool.afterExecute` hooks are non-blocking so result auditing cannot hide the original tool outcome.

## Timeline Visibility

Hook events are emitted over the existing chat event stream:

- `hook.completed`
- `hook.failed`

The renderer records these as system messages in the active task timeline, so hook activity is visible alongside tool calls, approvals, and model output.

## Tests

Hook ordering and failure behavior are covered in `electron/hook-service.test.ts`.
