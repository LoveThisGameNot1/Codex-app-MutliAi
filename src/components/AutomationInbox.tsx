import { buildAutomationInboxItems, countUnreadAutomationRuns } from '@/services/automation-inbox';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const statusStyles = {
  completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  failed: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
} as const;

const getStatusStyle = (status: 'completed' | 'failed' | 'running'): string => {
  if (status === 'failed') {
    return statusStyles.failed;
  }

  return statusStyles.completed;
};

export const AutomationInbox = () => {
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const acknowledgeAutomationRun = useAppStore((state) => state.acknowledgeAutomationRun);
  const acknowledgeAutomationRuns = useAppStore((state) => state.acknowledgeAutomationRuns);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const inboxItems = buildAutomationInboxItems(automationRuns, acknowledgedAutomationRunIds);
  const unreadCount = countUnreadAutomationRuns(automationRuns, acknowledgedAutomationRunIds);

  if (inboxItems.length === 0) {
    return null;
  }

  const openAutomationCenter = (runId?: string) => {
    if (runId) {
      acknowledgeAutomationRun(runId);
    }
    setSettingsOpen(true);
  };

  return (
    <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/5 p-4 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Automation Inbox</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            {unreadCount > 0 ? `${unreadCount} unread automation update${unreadCount === 1 ? '' : 's'}` : 'Recent automation activity'}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Completed and failed automation runs land here first, so we can react quickly without opening the settings drawer.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => acknowledgeAutomationRuns(inboxItems.map((item) => item.run.id))}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Mark Visible Read
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/20"
          >
            Open Automation Center
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {inboxItems.map(({ run, unread }) => (
          <article
            key={run.id}
            className={cn(
              'rounded-3xl border px-4 py-4 transition',
              unread ? 'border-white/15 bg-white/5' : 'border-white/10 bg-slate-950/40',
            )}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]',
                      getStatusStyle(run.status),
                    )}
                  >
                    {run.status}
                  </span>
                  {unread ? (
                    <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-sky-100">
                      unread
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    {new Date(run.finishedAt ?? run.startedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-100">{run.automationName}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{run.summary}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAutomationCenter(run.id)}
                  className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
                >
                  Inspect Run
                </button>
                {unread ? (
                  <button
                    type="button"
                    onClick={() => acknowledgeAutomationRun(run.id)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    Mark Read
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
