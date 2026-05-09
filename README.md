# CodexApp Multi APIs

An Electron desktop app in the style of Cursor or Claude Artifacts, featuring:

- Streaming chat across multiple LLM providers, including native Anthropic and Gemini adapters on the official endpoints
- Tool calling for the filesystem and terminal
- Real-time parsing of `<artifact>` tags
- Monaco code view for artifacts
- Sandboxed HTML/React preview in the right panel
- Persistent chat and artifact history across app restarts
- Searchable session history with provider, model, tool-use, and artifact-type filters
- Portable JSON export/import for saved sessions and project memory
- Provider diagnostics for API keys, model discovery, streaming, tool calling, and subscription/API-key guidance
- Saved provider profiles with masked keys and preferred defaults
- Parser unit tests with Vitest

Current presets are available for:

- OpenAI
- Anthropic
- Gemini
- OpenRouter
- Cerebras
- SambaNova
- DeepInfra
- Groq
- Together AI
- Fireworks AI
- DeepSeek
- xAI
- Ollama
- any custom OpenAI-compatible endpoints

## Requirements

- Node.js 20+
- An API key for your preferred provider, or a local compatible endpoint such as Ollama

## Development

```powershell
npm install
npm run dev
```

Provider keys can also be configured through `.env.example` or a local `.env` file.
For Anthropic and Gemini, the app uses native SDK adapters for streaming and tool calling when you stay on the official preset endpoints. If you change the base URL to a gateway or proxy, the app automatically falls back to the OpenAI-compatible transport so custom endpoints keep working.
For many compatible providers, the app can also load the currently available models live from the active endpoint and expose them as a selectable model library.

## How to Use

1. Start the app with `npm run dev`.
2. Open the settings panel and choose a provider, model, base URL, and API key if needed.
3. Save that setup as a provider profile if you want to reuse it later or mark it as the preferred default.
4. Use Runtime Settings provider diagnostics to confirm API access, model discovery, streaming, and tool calling before long agent runs.
5. Enter a prompt in the chat composer on the left.
6. Let the agent respond in markdown, use tools, and emit `<artifact>` blocks when it wants to create code or previews.
7. Inspect the generated artifact in the right panel using code view or preview mode.
8. Review any filesystem or terminal activity in the chat timeline and tool status surfaces.
9. If a tool action requires approval, use the Approval Center to approve once, approve for the current run, or reject it.
10. Create automations in the settings area when you want recurring runs, scheduled checks, or follow-up work.
11. Use the Search panel to filter saved sessions by provider, model, tool usage, or artifact type.
12. Load a previous session from the search results to continue from persisted context.
13. Use `Memory -> Continuity Backup` to export or import saved sessions and project memory as JSON.

### Example Flow

- Select `OpenAI`, `Anthropic`, `Gemini`, or another supported provider.
- Ask: `Build a pricing page artifact in React and write the files into src/pages.`
- Review the streamed answer in chat.
- Open the generated artifact in the right panel.
- Approve any gated tool actions if needed.
- Run tests or follow-up prompts until the output is where you want it.

## Production Verification

```powershell
npm run test
npm run build
npm run dist
```

## Git Workflow

- Use `feature/*`, `fix/*`, `hotfix/*`, or `release/*` branches for new work.
- Commit messages, branch names, pull request titles, and patch notes are written in English.
- Pushes and pull requests targeting `main` or `develop` are validated automatically by GitHub Actions CI.
- Releases are created from Git tags in the format `vX.Y.Z` and automatically build the Windows installer.
- See `docs/WORKFLOW.md` for more details.

## Architecture

- `electron/`: main process, IPC, config store, multi-provider LLM bridge, and tool bridge
- `shared/`: cross-process contracts, provider presets, and defaults
- `src/`: React renderer, Zustand store, stream parser, Monaco UI, and preview UI

## Provider Profiles

Provider profiles are stored locally in the Electron user data directory. The settings UI only displays masked API keys, and continuity exports do not include saved provider secrets. See `docs/PROVIDER_PROFILES.md` for details.
