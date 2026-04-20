import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/app-store';

type SearchResult = {
  id: string;
  group: string;
  title: string;
  preview: string;
  timestamp?: string;
};

const includesNeedle = (value: string, needle: string): boolean => value.toLowerCase().includes(needle.toLowerCase());

export const SearchPanel = () => {
  const messages = useAppStore((state) => state.messages);
  const artifacts = useAppStore((state) => state.artifacts);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const automations = useAppStore((state) => state.automations);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return [] as SearchResult[];
    }

    const sessionResults: SearchResult[] = persistedSessions
      .filter((session) => includesNeedle(`${session.title} ${session.preview}`, trimmed))
      .map((session) => ({
        id: `session:${session.id}`,
        group: 'Saved session',
        title: session.title,
        preview: session.preview,
        timestamp: session.updatedAt,
      }));

    const automationResults: SearchResult[] = automations
      .filter((automation) => includesNeedle(`${automation.name} ${automation.prompt}`, trimmed))
      .map((automation) => ({
        id: `automation:${automation.id}`,
        group: 'Automation',
        title: automation.name,
        preview: automation.prompt,
        timestamp: automation.updatedAt,
      }));

    const artifactResults: SearchResult[] = artifacts
      .filter((artifact) => includesNeedle(`${artifact.title} ${artifact.content}`, trimmed))
      .map((artifact) => ({
        id: `artifact:${artifact.id}`,
        group: 'Artifact',
        title: artifact.title,
        preview: artifact.content.slice(0, 180) || 'Artifact content',
        timestamp: artifact.updatedAt,
      }));

    const messageResults: SearchResult[] = messages
      .filter((message) => includesNeedle(message.content, trimmed))
      .map((message) => ({
        id: `message:${message.id}`,
        group: message.role === 'assistant' ? 'Assistant message' : message.role === 'user' ? 'User message' : 'System entry',
        title: message.content.replace(/\s+/g, ' ').trim().slice(0, 72) || 'Message',
        preview: message.content.slice(0, 180) || 'Message',
        timestamp: message.createdAt,
      }));

    return [...sessionResults, ...automationResults, ...artifactResults, ...messageResults]
      .sort((left, right) => new Date(right.timestamp ?? 0).getTime() - new Date(left.timestamp ?? 0).getTime())
      .slice(0, 24);
  }, [artifacts, automations, messages, persistedSessions, query]);

  return (
    <section className="flex min-h-[680px] flex-col rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Search</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Search your workspace context</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Find saved sessions, automations, artifacts, and recent messages from one place.
        </p>
      </div>

      <label className="mt-5 flex flex-col gap-2 text-sm text-slate-300">
        Search query
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions, automations, artifacts, messages..."
          className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
        />
      </label>

      <div className="mt-5 flex-1 rounded-[26px] border border-white/10 bg-slate-950/60 p-4">
        {query.trim().length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-[22px] border border-dashed border-slate-800 p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm font-medium text-slate-200">Start typing to search everything</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Results are pulled from the current local conversation, saved sessions, automation prompts, and artifact contents.
              </p>
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-[22px] border border-dashed border-slate-800 p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm font-medium text-slate-200">No matches yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Try a broader phrase or search by a model name, file goal, automation name, or artifact title.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <article key={result.id} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-slate-300">
                    {result.group}
                  </span>
                  {result.timestamp ? <span>{new Date(result.timestamp).toLocaleString()}</span> : null}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-100">{result.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{result.preview}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
