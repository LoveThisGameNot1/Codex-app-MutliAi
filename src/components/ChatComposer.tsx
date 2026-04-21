import { useMemo } from 'react';
import { inferConfiguredModelCapabilities } from '../../shared/model-capabilities';
import { useAppStore } from '@/store/app-store';
import { chatRuntime } from '@/services/chat-runtime';

export const ChatComposer = () => {
  const composerValue = useAppStore((state) => state.composerValue);
  const setComposerValue = useAppStore((state) => state.setComposerValue);
  const config = useAppStore((state) => state.config);
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeTask = workspaceTasks.find((task) => task.id === activeTaskId) ?? null;
  const taskBusy = Boolean(activeTask?.requestId);

  const placeholder = useMemo(
    () =>
      'Ask the agent to inspect files, run terminal commands, or generate UI artifacts with <artifact> output.',
    [],
  );
  const selectedModelCapabilities = useMemo(() => inferConfiguredModelCapabilities(config), [config]);
  const approvalGuardsEnabled = useMemo(
    () => Object.values(config.toolPolicy).some((mode) => mode !== 'allow'),
    [config.toolPolicy],
  );

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-panel backdrop-blur">
      <div className="mb-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
        <span
          className={`rounded-full border px-3 py-1 ${
            selectedModelCapabilities.recommendedForAgent
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
              : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
          }`}
        >
          {selectedModelCapabilities.recommendedForAgent ? 'agent-ready model' : 'agent-risk model'}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${
            selectedModelCapabilities.streaming === 'supported'
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
              : selectedModelCapabilities.streaming === 'likely'
                ? 'border-sky-300/30 bg-sky-300/10 text-sky-100'
                : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
          }`}
        >
          streaming {selectedModelCapabilities.streaming}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${
            selectedModelCapabilities.toolCalling === 'supported'
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
              : selectedModelCapabilities.toolCalling === 'likely'
                ? 'border-sky-300/30 bg-sky-300/10 text-sky-100'
                : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
          }`}
        >
          tools {selectedModelCapabilities.toolCalling}
        </span>
        {approvalGuardsEnabled ? (
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-amber-100">
            approvals active
          </span>
        ) : null}
      </div>
      <textarea
        value={composerValue}
        onChange={(event) => setComposerValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!taskBusy) {
              void chatRuntime.sendCurrentComposerMessage();
            }
          }
        }}
        rows={5}
        placeholder={placeholder}
        className="min-h-[132px] w-full resize-none rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400/40"
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">
            `Enter` sends, `Shift + Enter` inserts a newline. Tools run in the Electron main process.
          </p>
          {!selectedModelCapabilities.recommendedForAgent ? (
            <p className="text-xs text-amber-200/80">
              Current model fit: streaming {selectedModelCapabilities.streaming}, tool calling{' '}
              {selectedModelCapabilities.toolCalling}. This model may behave inconsistently for agent-style runs.
            </p>
          ) : null}
          {approvalGuardsEnabled ? (
            <p className="text-xs text-slate-400">
              Tool guardrails are active. Some file reads, writes, or shell commands may require an approval step
              before the agent can continue.
            </p>
          ) : null}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void chatRuntime.createTask()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10"
          >
            New Task
          </button>
          <button
            type="button"
            onClick={() => void chatRuntime.resetConversation()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10"
          >
            New Session
          </button>
          {taskBusy ? (
            <button
              type="button"
              onClick={() => void chatRuntime.cancelActiveRequest()}
              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/15"
            >
              Stop Stream
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void chatRuntime.sendCurrentComposerMessage()}
              disabled={taskBusy}
              className="rounded-full border border-sky-400/30 bg-sky-400/15 px-5 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25"
            >
              Send Prompt
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
