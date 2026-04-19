# CodexApp Multi APIs

Eine Electron-Desktop-App im Stil von Cursor oder Claude Artifacts mit:

- Streaming-Chat gegen OpenAI
- Tool-Calling fuer Dateisystem und Terminal
- Echtzeit-Parsing von `<artifact>`-Tags
- Monaco Code View fuer Artefakte
- Sandboxed HTML/React Preview im rechten Panel
- Persistenter Chat- und Artifact-Verlauf zwischen App-Starts
- Parser-Unit-Tests mit Vitest

## Voraussetzungen

- Node.js 20+
- Eine gesetzte OpenAI API via UI oder `OPENAI_API_KEY`

## Entwicklung

```powershell
npm install
npm run dev
```

Optional kann die API auch ueber `.env.example` bzw. eine `.env` mit `OPENAI_API_KEY` gesetzt werden.

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

- `electron/`: Main Process, IPC, Config-Store, OpenAI- und Tool-Bruecke
- `shared/`: Prozessuebergreifende Vertrage und Defaults
- `src/`: React Renderer, Zustand-Store, Stream-Parser, Monaco- und Preview-UI
