# Artifact Preview Browser Validation

CodexApp now validates HTML and React artifact previews inside the existing sandboxed iframe instead of treating preview mode as a blind render target.

## What Runs In The Preview Frame

Every preview document receives:

- A restrictive Content Security Policy with `default-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and `object-src 'none'`.
- A runtime instrumentation script that posts preview telemetry back to the renderer.
- Click interception for non-anchor links so generated previews cannot navigate away silently.
- Form submit interception so generated forms cannot submit data.
- Runtime error and unhandled rejection capture.
- DOM extraction after initial load and after a short render delay for React previews.
- A command channel for safe scripted preview interactions from the renderer.

The iframe remains sandboxed with `allow-scripts` only. It does not get same-origin access, popups, top navigation, or form permissions.

## Renderer Feedback

The Artifact Studio preview pane now shows a browser validation strip above the iframe:

- Static guardrail findings before render.
- Runtime status: loading, DOM ready, or runtime issue.
- Extracted DOM counts for nodes, buttons, links, and forms.
- Detected headings.
- Blocked navigation and blocked form submit events.
- Script errors and stack traces when the preview reports them.
- Manual scripted smoke-test buttons for DOM refresh, hash navigation, click, and typing.
- Screenshot capture that saves the current app window to `artifact-preview-screenshots` inside Electron `userData`.

## Scripted Interactions

The renderer can send a small command set to the sandboxed preview frame:

- `extract-dom`: returns a fresh DOM snapshot.
- `navigate`: allows hash-only navigation and blocks external navigation attempts.
- `click`: dispatches a click to the first matching safe selector used by the UI smoke test.
- `type`: enters smoke-test text into the first matching input, textarea, or contenteditable element.

Each command returns a `preview.command-result` message with `completed`, `failed`, or `blocked` status. The command channel intentionally does not expose arbitrary JavaScript execution.

## Screenshot Capture

The preview pane can request an Electron `webContents.capturePage()` screenshot through IPC. Captures are written as PNG files with sanitized artifact names and timestamps. This captures the current app window, including the preview pane and validation strip, without granting the sandboxed iframe filesystem access.

## Guardrails

Static preview validation flags:

- External resources.
- External scripts.
- Forms.
- Nested frames.
- Inline event handlers.
- `javascript:` URLs.
- Meta refresh navigation.
- `<base>` tags.

These findings do not replace the iframe sandbox. They make risky preview behavior visible and explain which actions are blocked.

## Test Coverage

`src/services/artifact-preview.test.ts` covers:

- CSP and instrumentation injection.
- Full-document HTML preservation with added guardrails.
- External resource and blocked-action detection.
- React preview instrumentation.
- Runtime preview message validation.
- Scripted command-result validation.
- Electron screenshot filename sanitization and capture persistence.
