import { useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { chatRuntime } from '@/services/chat-runtime';

export const ChatComposer = () => {
  const composerValue = useAppStore((state) => state.composerValue);
  const setComposerValue = useAppStore((state) => state.setComposerValue);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const activeRequestId = useAppStore((state) => state.activeRequestId);

  const placeholder = useMemo(
    () =>
      'Ask the agent to inspect files, run terminal commands, or generate UI artifacts with <artifact> output.',
    [],
  );

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-panel backdrop-blur">
      <textarea
        value={composerValue}
        onChange={(event) => setComposerValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void chatRuntime.sendCurrentComposerMessage();
          }
        }}
        rows={5}
        placeholder={placeholder}
        className="min-h-[132px] w-full resize-none rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400/40"
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          `Enter` sends, `Shift + Enter` inserts a newline. Tools run in the Electron main process.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void chatRuntime.resetConversation()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10"
          >
            New Session
          </button>
          {isStreaming && activeRequestId ? (
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