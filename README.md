# CodexApp Multi APIs

An Electron desktop app in the style of Cursor or Claude Artifacts, featuring:

- Streaming chat across multiple LLM providers, including native Anthropic and Gemini adapters on the official endpoints
- Tool calling for the filesystem and terminal
- Real-time parsing of `<artifact>` tags
- Monaco code view for artifacts
- Sandboxed HTML/React preview in the right panel
- Persistent chat and artifact history across app restarts
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
