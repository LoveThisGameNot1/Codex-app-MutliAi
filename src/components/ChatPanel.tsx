import { useEffect, useMemo, useRef } from 'react';
import { AutomationInbox } from '@/components/AutomationInbox';
import { ChatComposer } from '@/components/ChatComposer';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { SettingsPanel } from '@/components/SettingsPanel';
import { countUnreadAutomationRuns } from '@/services/automation-inbox';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const roleStyles: Record<string, string> = {
  user: 'border-sky-400/20 bg-sky-500/10',
  assistant: 'border-white/10 bg-white/5',
  tool: 'border-emerald-400/20 bg-emerald-500/10',
  system: 'border-amber-400/20 bg-amber-500/10',
};

const roleLabels: Record<string, string> = {
  user: 'You',
  assistant: 'Agent',
  tool: 'Tool',
  system: 'System',
};

export const ChatPanel = () => {
  const messages = useAppStore((state) => state.messages);
  const toolExecutions = useAppStore((state) => state.toolExecutions);
  const lastError = useAppStore((state) => state.lastError);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = timelineRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [messages, toolExecutions]);

  const toolSummary = useMemo(
    () => ({
      running: toolExecutions.filter((tool) => tool.status === 'running').length,
      failed: toolExecutions.filter((tool) => tool.status === 'failed').length,
    }),
    [toolExecutions],
  );

  const unreadAutomationCount = useMemo(
    () => countUnreadAutomationRuns(automationRuns, acknowledgedAutomationRunIds),
    [acknowledgedAutomationRunIds, automationRuns],
  );

  return (
    <section className="flex min-h-[600px] flex-col gap-4">
      <div className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Chat Control</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Tool-Aware Conversation</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              The assistant streams markdown into the left pane while any detected
              <code className="ml-1 rounded bg-slate-950 px-1.5 py-0.5 text-sky-200">&lt;artifact&gt;</code>
              payloads are peeled off into the studio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {isStreaming ? 'Streaming' : 'Idle'}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              {toolSummary.running} tools running
            </span>
            <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200">
              {toolSummary.failed} failed
            </span>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              {unreadAutomationCount} automation alerts
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
            >
              {settingsOpen ? 'Hide Settings' : 'Show Settings'}
            </button>
          </div>
        </div>
      </div>

      <SettingsPanel />
      <AutomationInbox />

      <div
        ref={timelineRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-panel backdrop-blur"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-slate-800 bg-slate-900/60 p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Ready</p>
              <p className="mt-4 text-lg font-medium text-slate-200">
                Ask for code generation, file edits, terminal execution, or a self-contained UI artifact.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Example: "Build a pricing page artifact in React and write the files into src/pages."
              </p>
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <article
            key={message.id}
            className={cn(
              'rounded-[24px] border px-4 py-4 shadow-lg shadow-slate-950/10',
              roleStyles[message.role] ?? roleStyles.assistant,
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                  {roleLabels[message.role] ?? 'Message'}
                </span>
                <span className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleTimeString()}</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.2em]',
                  message.status === 'error'
                    ? 'bg-rose-400/10 text-rose-200'
                    : message.status === 'streaming'
                      ? 'bg-sky-400/10 text-sky-200'
                      : 'bg-white/5 text-slate-400',
                )}
              >
                {message.status}
              </span>
            </div>

            <div className="space-y-3 text-sm text-slate-200">
              <MarkdownMessage content={message.content || ' '} />
            </div>
          </article>
        ))}
      </div>

      {lastError ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {lastError}
        </div>
      ) : null}

      <ChatComposer />
    </section>
  );
};
