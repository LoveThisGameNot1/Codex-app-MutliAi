# CodexApp Multi APIs

Eine Electron-Desktop-App im Stil von Cursor oder Claude Artifacts mit:

- Streaming-Chat gegen mehrere LLM-Anbieter ueber OpenAI-kompatible APIs
- Tool-Calling fuer Dateisystem und Terminal
- Echtzeit-Parsing von `<artifact>`-Tags
- Monaco Code View fuer Artefakte
- Sandboxed HTML/React Preview im rechten Panel
- Persistenter Chat- und Artifact-Verlauf zwischen App-Starts
- Parser-Unit-Tests mit Vitest

Aktuell gibt es Presets fuer:

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
- beliebige Custom OpenAI-kompatible Endpunkte

## Voraussetzungen

- Node.js 20+
- Ein API-Key fuer deinen gewuenschten Anbieter oder ein lokaler kompatibler Endpoint wie Ollama

## Entwicklung

```powershell
npm install
npm run dev
```

Optional koennen Provider-Keys auch ueber `.env.example` bzw. eine `.env` gesetzt werden.
Fuer Anthropic und Gemini nutzt die App die offiziellen OpenAI-Kompatibilitaetsendpunkte; das ist praktisch fuer eine einheitliche Tool- und Streaming-Pipeline, ersetzt aber nicht alle nativen Anbieter-Features.
Fuer viele kompatible Anbieter kann die App ausserdem live die verfuegbaren Modelle vom aktuellen Endpoint laden und als waehlbare Modellbibliothek anzeigen.

## Produktionstest

```powershell
npm run test
npm run build
npm run dist
```

## Git workflow

- Nutze `feature/*`, `fix/*`, `hotfix/*` oder `release/*` Branches fuer neue Arbeit.
- Pushes und Pull Requests gegen `main` oder `develop` laufen automatisch durch GitHub Actions CI.
- Releases werden ueber Git-Tags im Format `vX.Y.Z` erstellt und bauen automatisch den Windows-Installer.
- Details stehen in `docs/WORKFLOW.md`.

## Architektur

- `electron/`: Main Process, IPC, Config-Store, Multi-Provider-LLM- und Tool-Bruecke
- `shared/`: Prozessuebergreifende Vertrage, Provider-Presets und Defaults
- `src/`: React Renderer, Zustand-Store, Stream-Parser, Monaco- und Preview-UI
