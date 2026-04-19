import { useMemo } from 'react';
import { AutomationPanel } from '@/components/AutomationPanel';
import { useAppStore } from '@/store/app-store';
import { chatRuntime } from '@/services/chat-runtime';

export const SettingsPanel = () => {
  const config = useAppStore((state) => state.config);
  const updateConfig = useAppStore((state) => state.updateConfig);
  const isOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const appInfo = useAppStore((state) => state.appInfo);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const activeSessionId = useAppStore((state) => state.sessionId);
  const isStreaming = useAppStore((state) => state.isStreaming);

  const workspaceLabel = useMemo(() => appInfo?.workspaceRoot || 'Unavailable', [appInfo]);

  if (!isOpen) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Runtime Settings</h3>
          <p className="mt-1 text-sm text-slate-400">
            API credentials stay in the Electron main process and are persisted in the app user data folder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          OpenAI API Key
          <input
            type="password"
            value={config.apiKey}
            onChange={(event) =>
              updateConfig((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            placeholder="sk-..."
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Model
          <input
            type="text"
            value={config.model}
            onChange={(event) =>
              updateConfig((current) => ({
                ...current,
                model: event.target.value,
              }))
            }
            placeholder="gpt-5.4"
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-2 text-sm text-slate-300">
        System Prompt
        <textarea
          value={config.systemPrompt}
          onChange={(event) =>
            updateConfig((current) => ({
              ...current,
              systemPrompt: event.target.value,
            }))
          }
          rows={10}
          className="min-h-[220px] rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
          Workspace root: <span className="text-slate-200">{workspaceLabel}</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void chatRuntime.refreshSessionLibrary()}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Refresh Sessions
          </button>
          <button
            type="button"
            onClick={() => void chatRuntime.persistConfig()}
            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Save Settings
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Saved Sessions</h4>
            <p className="mt-1 text-sm text-slate-500">
              Resume a persisted backend conversation, including reconstructed artifacts.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {persistedSessions.length} stored
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Stop the current response before switching or deleting the active session.
        </p>

        <div className="mt-4 space-y-3">
          {persistedSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 text-sm text-slate-500">
              No persisted sessions yet.
            </div>
          ) : null}

          {persistedSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const loadDisabled = isStreaming || isActive;
            const deleteDisabled = isStreaming && isActive;
            return (
              <div
                key={session.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{session.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{session.preview}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(session.updatedAt).toLocaleString()} | {session.messageCount} messages
                  </p>
                </div>
                <div className="flex gap-2 self-start md:self-center">
                  <button
                    type="button"
                    disabled={loadDisabled}
                    onClick={() => void chatRuntime.loadPersistedSession(session.id)}
                    className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    {isActive ? 'Current Session' : 'Load Session'}
                  </button>
                  <button
                    type="button"
                    disabled={deleteDisabled}
                    onClick={() => {
                      const confirmed = window.confirm(
                        isActive
                          ? 'Delete the current session and start a fresh conversation?'
                          : 'Delete this saved session permanently?',
                      );
                      if (!confirmed) {
                        return;
                      }

                      void chatRuntime.deletePersistedSession(session.id);
                    }}
                    className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AutomationPanel />
    </section>
  );
};
