import { chatRuntime } from '@/services/chat-runtime';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const statusTone: Record<string, string> = {
  idle: 'border-white/10 bg-white/5 text-slate-300',
  queued: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  running: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  blocked: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  failed: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  completed: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
};

export const TaskSwitcher = () => {
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const setActiveTaskId = useAppStore((state) => state.setActiveTaskId);
  const updateTaskWorkingDirectory = useAppStore((state) => state.updateTaskWorkingDirectory);

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-slate-500">Tasks</p>
          <p className="mt-2 text-sm text-slate-300">
            Parallel runs live here. Switch tasks without stopping the others.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void chatRuntime.createTask()}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          New Task
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {workspaceTasks.map((task) => (
          <article
            key={task.id}
            className={cn(
              'min-w-[210px] max-w-[250px] rounded-3xl border p-3 transition',
              activeTaskId === task.id ? 'border-sky-300/30 bg-sky-300/10' : 'border-white/10 bg-white/5',
            )}
          >
            <button
              type="button"
              onClick={() => setActiveTaskId(task.id)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-medium text-white">{task.title}</p>
                <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', statusTone[task.status])}>
                  {task.status}
                </span>
              </div>
              {task.scopeSummary ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-sky-200/80">
                  Scope: {task.scopeSummary}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Workdir: {task.workingDirectory || 'workspace root'}
              </p>
              {task.parentTaskId ? (
                <p className="mt-1 text-[11px] text-slate-500">Subtask of {task.parentTaskId.slice(0, 8)}</p>
              ) : null}
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                {task.lastMessagePreview || 'No prompt yet'}
              </p>
              <p className="mt-3 text-[11px] text-slate-500">{new Date(task.updatedAt).toLocaleTimeString()}</p>
            </button>

            {task.requestId ? (
              <button
                type="button"
                onClick={() => void chatRuntime.cancelTask(task.id)}
                className="mt-3 rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-300/20"
              >
                Stop Task
              </button>
            ) : null}

            {activeTaskId === task.id ? (
              <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Task Working Directory
                </label>
                <input
                  type="text"
                  value={task.workingDirectory ?? ''}
                  onChange={(event) => updateTaskWorkingDirectory(task.id, event.target.value)}
                  placeholder="Workspace root"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-sky-400/40"
                />
                <button
                  type="button"
                  onClick={() => updateTaskWorkingDirectory(task.id, null)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
                >
                  Use Workspace Root
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
