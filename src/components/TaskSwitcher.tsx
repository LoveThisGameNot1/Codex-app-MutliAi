import { chatRuntime } from '@/services/chat-runtime';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const statusTone: Record<string, string> = {
  idle: 'bg-slate-400/20 text-slate-200',
  queued: 'bg-sky-300/15 text-sky-100',
  running: 'bg-emerald-300/15 text-emerald-100',
  blocked: 'bg-amber-300/15 text-amber-100',
  failed: 'bg-rose-300/15 text-rose-100',
  completed: 'bg-slate-300/15 text-slate-100',
};

export const TaskSwitcher = () => {
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const setActiveTaskId = useAppStore((state) => state.setActiveTaskId);
  const updateTaskWorkingDirectory = useAppStore((state) => state.updateTaskWorkingDirectory);
  const activeTask = workspaceTasks.find((task) => task.id === activeTaskId) ?? null;

  return (
    <section className="glass-panel rounded-[28px] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tasks</p>
          <p className="mt-1 text-sm text-slate-300">Switch context without losing parallel work.</p>
        </div>
        <button
          type="button"
          onClick={() => void chatRuntime.createTask()}
          className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.075]"
        >
          New
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {workspaceTasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => setActiveTaskId(task.id)}
            className={cn(
              'min-w-[168px] rounded-2xl border px-3 py-2.5 text-left transition',
              activeTaskId === task.id
                ? 'border-sky-300/25 bg-sky-300/10 shadow-glow'
                : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-sm font-medium text-white">{task.title}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', statusTone[task.status])}>
                {task.status}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-muted">{task.lastMessagePreview || 'No prompt yet'}</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {task.isolationMode === 'safe-clone' ? 'Safe clone' : 'Live'}
            </p>
          </button>
        ))}
      </div>

      {activeTask ? (
        <div className="mt-2 grid gap-2 rounded-2xl border border-white/10 bg-black/15 p-2.5 xl:grid-cols-[1fr_auto_auto] xl:items-center">
          <input
            type="text"
            value={activeTask.liveWorkingDirectory ?? ''}
            onChange={(event) => updateTaskWorkingDirectory(activeTask.id, event.target.value)}
            placeholder="Workspace root"
            disabled={Boolean(activeTask.requestId)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-sky-300/30 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled={Boolean(activeTask.requestId)}
            onClick={() => updateTaskWorkingDirectory(activeTask.id, null)}
            className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Root
          </button>
          {activeTask.isolationMode === 'safe-clone' ? (
            <button
              type="button"
              disabled={Boolean(activeTask.requestId)}
              onClick={() => void chatRuntime.returnTaskToWorkspace(activeTask.id)}
              className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Live
            </button>
          ) : (
            <button
              type="button"
              disabled={Boolean(activeTask.requestId)}
              onClick={() => void chatRuntime.activateSafeClone(activeTask.id)}
              className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clone
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
};
