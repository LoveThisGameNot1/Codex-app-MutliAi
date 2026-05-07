import { useMemo, useState } from 'react';
import type { ArtifactKind, PersistedSessionSummary } from '../../shared/contracts';
import { chatRuntime } from '@/services/chat-runtime';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

type SearchResult = {
  id: string;
  group: string;
  title: string;
  preview: string;
  timestamp?: string;
};

const includesNeedle = (value: string, needle: string): boolean =>
  value.toLowerCase().includes(needle.toLowerCase());

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

const getSessionToolNames = (session: PersistedSessionSummary): string[] => session.toolNames ?? [];

const getSessionArtifactTypes = (session: PersistedSessionSummary): ArtifactKind[] =>
  session.artifactTypes ?? [];

const sessionSearchText = (session: PersistedSessionSummary): string =>
  [
    session.title,
    session.preview,
    session.resumeSummary,
    session.providerId,
    session.providerLabel,
    session.model,
    getSessionToolNames(session).join(' '),
    getSessionArtifactTypes(session).join(' '),
  ]
    .filter(Boolean)
    .join(' ');

const chipClassName = (active: boolean): string =>
  cn(
    'rounded-full border px-3 py-1.5 text-xs transition',
    active
      ? 'border-sky-300/30 bg-sky-300/15 text-sky-100 shadow-glow'
      : 'border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.075]',
  );

const formatSessionProvider = (session: PersistedSessionSummary): string =>
  session.providerLabel || session.providerId || 'Unknown provider';

const formatArtifactType = (type: ArtifactKind): string => {
  if (type === 'html') {
    return 'HTML';
  }

  if (type === 'react') {
    return 'React';
  }

  return 'Code';
};

export const SearchPanel = () => {
  const messages = useAppStore((state) => state.messages);
  const artifacts = useAppStore((state) => state.artifacts);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const automations = useAppStore((state) => state.automations);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [toolFilter, setToolFilter] = useState('');
  const [artifactFilter, setArtifactFilter] = useState<ArtifactKind | ''>('');

  const trimmedQuery = query.trim();

  const providerOptions = useMemo(
    () =>
      uniqueSorted(
        persistedSessions.map((session) => session.providerId || session.providerLabel || 'unknown'),
      ),
    [persistedSessions],
  );

  const modelOptions = useMemo(
    () => uniqueSorted(persistedSessions.map((session) => session.model ?? '')),
    [persistedSessions],
  );

  const toolOptions = useMemo(
    () => uniqueSorted(persistedSessions.flatMap((session) => getSessionToolNames(session))),
    [persistedSessions],
  );

  const artifactOptions = useMemo(
    () =>
      [...new Set(persistedSessions.flatMap((session) => getSessionArtifactTypes(session)))].sort() as ArtifactKind[],
    [persistedSessions],
  );

  const filteredSessions = useMemo(() => {
    return persistedSessions.filter((session) => {
      if (trimmedQuery && !includesNeedle(sessionSearchText(session), trimmedQuery)) {
        return false;
      }

      if (providerFilter && providerFilter !== (session.providerId || session.providerLabel || 'unknown')) {
        return false;
      }

      if (modelFilter && modelFilter !== session.model) {
        return false;
      }

      if (toolFilter && !getSessionToolNames(session).includes(toolFilter)) {
        return false;
      }

      if (artifactFilter && !getSessionArtifactTypes(session).includes(artifactFilter)) {
        return false;
      }

      return true;
    });
  }, [artifactFilter, modelFilter, persistedSessions, providerFilter, toolFilter, trimmedQuery]);

  const workspaceResults = useMemo(() => {
    if (!trimmedQuery) {
      return [] as SearchResult[];
    }

    const automationResults: SearchResult[] = automations
      .filter((automation) => includesNeedle(`${automation.name} ${automation.prompt}`, trimmedQuery))
      .map((automation) => ({
        id: `automation:${automation.id}`,
        group: 'Automation',
        title: automation.name,
        preview: automation.prompt,
        timestamp: automation.updatedAt,
      }));

    const artifactResults: SearchResult[] = artifacts
      .filter((artifact) => includesNeedle(`${artifact.title} ${artifact.type} ${artifact.language} ${artifact.content}`, trimmedQuery))
      .map((artifact) => ({
        id: `artifact:${artifact.id}`,
        group: `${formatArtifactType(artifact.type)} artifact`,
        title: artifact.title,
        preview: artifact.content.slice(0, 180) || 'Artifact content',
        timestamp: artifact.updatedAt,
      }));

    const messageResults: SearchResult[] = messages
      .filter((message) => includesNeedle(message.content, trimmedQuery))
      .map((message) => ({
        id: `message:${message.id}`,
        group: message.role === 'assistant' ? 'Assistant message' : message.role === 'user' ? 'User message' : 'System entry',
        title: message.content.replace(/\s+/g, ' ').trim().slice(0, 72) || 'Message',
        preview: message.content.slice(0, 180) || 'Message',
        timestamp: message.createdAt,
      }));

    return [...automationResults, ...artifactResults, ...messageResults]
      .sort((left, right) => new Date(right.timestamp ?? 0).getTime() - new Date(left.timestamp ?? 0).getTime())
      .slice(0, 18);
  }, [artifacts, automations, messages, trimmedQuery]);

  const resetFilters = (): void => {
    setProviderFilter('');
    setModelFilter('');
    setToolFilter('');
    setArtifactFilter('');
  };

  const activeFilterCount = [providerFilter, modelFilter, toolFilter, artifactFilter].filter(Boolean).length;

  return (
    <section className="glass-panel-strong flex min-h-0 flex-col overflow-hidden rounded-[32px] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Search</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Searchable session history</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Filter saved sessions by provider, model, tool usage, and artifact type, then search across the current workspace context.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2">
            <p className="text-lg font-semibold text-white">{persistedSessions.length}</p>
            <p className="uppercase tracking-[0.18em] text-muted">Sessions</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2">
            <p className="text-lg font-semibold text-white">{toolOptions.length}</p>
            <p className="uppercase tracking-[0.18em] text-muted">Tools</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2">
            <p className="text-lg font-semibold text-white">{artifactOptions.length}</p>
            <p className="uppercase tracking-[0.18em] text-muted">Artifacts</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-white/10 bg-black/20 p-4">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Search query
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions, automations, artifacts, messages, providers, models..."
            className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/35"
          />
        </label>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Provider</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setProviderFilter('')} className={chipClassName(!providerFilter)}>
                All
              </button>
              {providerOptions.map((providerId) => {
                const label = persistedSessions.find((session) => (session.providerId || session.providerLabel || 'unknown') === providerId);
                return (
                  <button
                    key={providerId}
                    type="button"
                    onClick={() => setProviderFilter(providerId)}
                    className={chipClassName(providerFilter === providerId)}
                  >
                    {label ? formatSessionProvider(label) : providerId}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Model</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setModelFilter('')} className={chipClassName(!modelFilter)}>
                All
              </button>
              {modelOptions.map((model) => (
                <button key={model} type="button" onClick={() => setModelFilter(model)} className={chipClassName(modelFilter === model)}>
                  {model}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Tool use</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setToolFilter('')} className={chipClassName(!toolFilter)}>
                All
              </button>
              {toolOptions.length === 0 ? <span className="text-sm text-muted">No saved tool usage yet.</span> : null}
              {toolOptions.map((tool) => (
                <button key={tool} type="button" onClick={() => setToolFilter(tool)} className={chipClassName(toolFilter === tool)}>
                  {tool}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Artifact type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setArtifactFilter('')} className={chipClassName(!artifactFilter)}>
                All
              </button>
              {artifactOptions.length === 0 ? <span className="text-sm text-muted">No saved artifacts yet.</span> : null}
              {artifactOptions.map((type) => (
                <button key={type} type="button" onClick={() => setArtifactFilter(type)} className={chipClassName(artifactFilter === type)}>
                  {formatArtifactType(type)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.075]"
          >
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="min-h-0 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Saved sessions</p>
              <p className="mt-1 text-xs text-muted">{filteredSessions.length} matching session{filteredSessions.length === 1 ? '' : 's'}</p>
            </div>
            <button
              type="button"
              onClick={() => void chatRuntime.refreshSessionLibrary()}
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.075]"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {filteredSessions.length === 0 ? (
              <div className="grid min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-800 p-8 text-center">
                <div className="max-w-md">
                  <p className="text-sm font-medium text-slate-200">No saved sessions match these filters.</p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Try clearing a filter, use a broader query, or refresh the session library after a run completes.
                  </p>
                </div>
              </div>
            ) : null}

            {filteredSessions.map((session) => (
              <article key={session.id} className="rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-sky-100">
                    {formatSessionProvider(session)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                    {session.model || 'Unknown model'}
                  </span>
                  <span>{new Date(session.updatedAt).toLocaleString()}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-100">{session.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{session.preview}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {getSessionToolNames(session).map((tool) => (
                    <span key={tool} className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-emerald-100">
                      {tool}
                    </span>
                  ))}
                  {getSessionArtifactTypes(session).map((type) => (
                    <span key={type} className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-amber-100">
                      {formatArtifactType(type)} artifact
                    </span>
                  ))}
                  {getSessionToolNames(session).length === 0 && getSessionArtifactTypes(session).length === 0 ? (
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-slate-400">text only</span>
                  ) : null}
                </div>
                {session.resumeSummary ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">{session.resumeSummary}</p> : null}
                <button
                  type="button"
                  onClick={() => void chatRuntime.loadPersistedSession(session.id)}
                  className="mt-4 rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-300/15"
                >
                  Load session
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
          <p className="text-sm font-semibold text-white">Current workspace matches</p>
          <p className="mt-1 text-xs text-muted">
            {trimmedQuery ? `${workspaceResults.length} local result${workspaceResults.length === 1 ? '' : 's'}` : 'Enter a query to search current messages, artifacts, and automations.'}
          </p>

          <div className="mt-4 space-y-3">
            {!trimmedQuery ? (
              <div className="grid min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-800 p-8 text-center text-sm text-muted">
                Session filters work without a query. Workspace-wide results appear after typing.
              </div>
            ) : workspaceResults.length === 0 ? (
              <div className="grid min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-800 p-8 text-center text-sm text-muted">
                No current workspace matches.
              </div>
            ) : null}

            {workspaceResults.map((result) => (
              <article key={result.id} className="rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                    {result.group}
                  </span>
                  {result.timestamp ? <span>{new Date(result.timestamp).toLocaleString()}</span> : null}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-100">{result.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{result.preview}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
