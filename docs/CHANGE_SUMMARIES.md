# Change Summaries

CodexApp now records lightweight continuity summaries for automation reruns and resumed sessions.

## Automation Runs

Each automation run stores a deterministic `changeSummary` beside the normal run output. The summary compares the current run with the latest previous non-running run for the same automation.

The comparison reports:

- first recorded runs
- status changes, such as `completed` to `failed`
- unchanged summaries
- changed output summaries

The latest comparison is also copied to `AutomationRecord.lastChangeSummary` so the automation list can show the newest "what changed" signal without opening the full run history.

## Resumed Sessions

Persisted session cards include a `resumeSummary` generated from stored messages. When a saved session is loaded, the chat timeline receives a system message with the same summary.

The session summary includes:

- last active timestamp
- stored message count
- latest user message
- latest assistant reply
- latest tool result when available
- captured artifact count when available

## Design Notes

These summaries are generated locally from persisted state. They do not require another LLM call, network access, or provider-specific behavior, so they are safe to use in unattended automations and offline resumes.
