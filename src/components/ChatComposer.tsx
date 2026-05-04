import { useMemo } from 'react';
import { inferConfiguredModelCapabilities } from '../../shared/model-capabilities';
import { useAppStore } from '@/store/app-store';
import { chatRuntime } from '@/services/chat-runtime';
import { getSlashCommandSuggestions } from '@/services/slash-commands';
import { cn } from '@/utils/cn';

const capabilityTone = (level: string): string => {
  if (level === 'supported') {
    return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100';
  }

  if (level === 'likely') {
    return 'border-sky-300/25 bg-sky-300/10 text-sky-100';
  }

  return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
};

export const ChatComposer = () => {
  const composerValue = useAppStore((state) => state.composerValue);
  const setComposerValue = useAppStore((state) => state.setComposerValue);
  const config = useAppStore((state) => state.config);
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeTask = workspaceTasks.find((task) => task.id === activeTaskId) ?? null;
  const taskBusy = Boolean(activeTask?.requestId);

  const placeholder = useMemo(
    () => 'Describe the outcome. The agent can inspect files, run terminal commands, write code, and stream artifacts.',
    [],
  );
  const selectedModelCapabilities = useMemo(() => inferConfiguredModelCapabilities(config), [config]);
  const slashCommandSuggestions = useMemo(() => getSlashCommandSuggestions(composerValue, 5), [composerValue]);
  const approvalGuardsEnabled = useMemo(
    () => Object.values(config.toolPolicy).some((mode) => mode !== 'allow'),
    [config.toolPolicy],
  );

  return (
    <div className="glass-panel-strong rounded-[30px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
          <span
            className={cn(
              'rounded-full border px-3 py-1',
              selectedModelCapabilities.recommendedForAgent
                ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                : 'border-amber-300/25 bg-amber-300/10 text-amber-100',
            )}
          >
            {selectedModelCapabilities.recommendedForAgent ? 'Agent ready' : 'Use caution'}
          </span>
          <span className={cn('rounded-full border px-3 py-1', capabilityTone(selectedModelCapabilities.streaming))}>
            Stream {selectedModelCapabilities.streaming}
          </span>
          <span className={cn('rounded-full border px-3 py-1', capabilityTone(selectedModelCapabilities.toolCalling))}>
            Tools {selectedModelCapabilities.toolCalling}
          </span>
          {approvalGuardsEnabled ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-amber-100">
              Approvals on
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted">Enter sends | Shift + Enter breaks line | / opens commands</p>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-black/20 transition focus-within:border-sky-300/30 focus-within:shadow-glow">
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
          rows={4}
          placeholder={placeholder}
          className="min-h-[118px] w-full resize-none border-0 bg-transparent px-4 py-4 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
        />

        <div className="flex flex-col gap-3 border-t border-white/10 bg-white/[0.025] px-3 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 text-xs text-muted">
            <span className="text-slate-300">{activeTask?.isolationMode === 'safe-clone' ? 'Safe clone' : 'Live workspace'}</span>
            {' '}in{' '}
            <span className="text-slate-300">{activeTask?.workingDirectory || 'workspace root'}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void chatRuntime.createTask()}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.075]"
            >
              New Task
            </button>
            <button
              type="button"
              onClick={() => void chatRuntime.resetConversation()}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.075]"
            >
              New Session
            </button>
            {taskBusy ? (
              <button
                type="button"
                onClick={() => void chatRuntime.cancelActiveRequest()}
                className="rounded-full border border-rose-300/25 bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-300/15"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void chatRuntime.sendCurrentComposerMessage()}
                disabled={taskBusy}
                className="rounded-full border border-sky-300/25 bg-sky-300/15 px-5 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      {slashCommandSuggestions.length > 0 ? (
        <div className="mt-3 grid gap-2 rounded-[24px] border border-sky-300/15 bg-sky-300/[0.06] p-2 lg:grid-cols-2">
          {slashCommandSuggestions.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => setComposerValue(`/${command.id}${command.kind === 'prompt-template' ? ' ' : ''}`)}
              className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-left transition hover:border-sky-300/25 hover:bg-sky-300/10"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-100">{command.usage}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {command.category}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted">{command.summary}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!selectedModelCapabilities.recommendedForAgent ? (
        <p className="mt-3 text-xs leading-5 text-amber-100/80">
          Current model may be weaker for agent runs: streaming {selectedModelCapabilities.streaming}, tool calling{' '}
          {selectedModelCapabilities.toolCalling}.
        </p>
      ) : null}
    </div>
  );
};
