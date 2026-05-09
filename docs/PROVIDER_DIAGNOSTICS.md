# Provider Diagnostics

CodexApp now surfaces provider health checks in Runtime Settings.

## What It Checks

Provider diagnostics evaluate:

- authentication readiness
- official endpoint vs custom gateway usage
- live model discovery status
- whether the selected model appears in the loaded catalog
- streaming confidence
- tool-calling confidence
- overall agent suitability
- subscription-vs-API-key confusion for OpenAI and Anthropic

The diagnostics do not send a chat prompt. They combine local heuristics with metadata returned by model-discovery APIs.

## Provider-Specific Discovery

The app uses deeper metadata when official APIs expose it:

- Anthropic: native `models.list` through the official Anthropic SDK, including model context/output limits and available capability flags.
- Gemini: native model listing with `generateContent` support checks.
- OpenRouter: provider model metadata such as supported parameters and output modalities.
- OpenAI-compatible providers: `/models` lookup where supported, with preset fallback models when discovery fails.

## Status Levels

- `ready`: the provider/model pairing looks usable for agent runs.
- `warning`: it can still work, but there is a known limitation or missing confirmation.
- `blocked`: a required setup item is missing, usually an API key for a hosted provider.

## Consumer Plans

ChatGPT Plus/Pro and Claude Pro/Max are not API credentials. The app explicitly calls this out in diagnostics so users know they need provider API access or a compatible local endpoint.
