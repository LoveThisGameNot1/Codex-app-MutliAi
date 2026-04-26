import { useEffect, useMemo, useRef } from 'react';
import { ApprovalCenter } from '@/components/ApprovalCenter';
import { AutomationInbox } from '@/components/AutomationInbox';
import { AutomationPanel } from '@/components/AutomationPanel';
import { ChatComposer } from '@/components/ChatComposer';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { PlannerPanel } from '@/components/PlannerPanel';
import { PluginsPanel } from '@/components/PluginsPanel';
import { ReviewPanel } from '@/components/ReviewPanel';
import { SearchPanel } from '@/components/SearchPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TaskSwitcher } from '@/components/TaskSwitcher';
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

const sectionMeta = {
  chat: {
    kicker: 'Workspace Chat',
    title: 'Tool-aware conversation',
    description:
      'Stream markdown into the timeline, route artifacts into the studio, and keep approvals and automation updates in one place.',
  },
  search: {
    kicker: 'Workspace Search',
    title: 'Search sessions, automations, and artifacts',
    description:
      'A calmer index over everything we have generated or scheduled so far, without leaving the current workspace.',
  },
  review: {
    kicker: 'Git Review',
    title: 'Changed files, staged work, and diff previews',
    description:
      'Inspect the repository state from inside the workspace, including staged and unstaged files plus inline diff previews.',
  },
  plugins: {
    kicker: 'Plugins & Integrations',
    title: 'Inspect active providers and tool surfaces',
    description:
      'See which integrations are live today and how the current model profile affects agent-style behavior.',
  },
  planner: {
    kicker: 'Execution Planner',
    title: 'Plan larger goals before running agents',
    description:
      'Break broad work into concrete steps, track progress, and queue structured plans back into chat.',
  },
  automations: {
    kicker: 'Automation Center',
    title: 'Manage scheduled work',
    description:
      'Create, edit, inspect, and supervise recurring tasks without burying them inside the chat stream.',
  },
  settings: {
    kicker: 'Runtime Settings',
    title: 'Adjust providers, policies, and sessions',
    description:
      'Configure model access, tool guardrails, saved sessions, and the broader runtime from one dedicated surface.',
  },
} as const;

export const ChatPanel = () => {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const messages = useAppStore((state) => state.messages.filter((message) => message.taskId === state.activeTaskId));
  const toolExecutions = useAppStore((state) =>
    state.toolExecutions.filter((tool) => tool.taskId === state.activeTaskId),
  );
  const lastError = useAppStore((state) => state.lastError);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const workspaceSection = useAppStore((state) => state.workspaceSection);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const pendingToolApprovals = useAppStore((state) => state.pendingToolApprovals);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const activeTask = workspaceTasks.find((task) => task.id === activeTaskId) ?? null;

  useEffect(() => {
    if (workspaceSection !== 'chat') {
      return;
    }

    const element = timelineRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [messages, toolExecutions, workspaceSection]);

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

  const activeSectionMeta = sectionMeta[workspaceSection];

  const renderChatTimeline = () => (
    <>
      <ApprovalCenter />
      <AutomationInbox />
      <TaskSwitcher />

      <div
        ref={timelineRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-panel backdrop-blur"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-slate-800 bg-slate-900/60 p-8 text-center">
            <div className="max-w-md">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Ready</p>
              <p className="mt-4 text-lg font-medium text-slate-200">
                {activeTask ? `Task "${activeTask.title}" is ready.` : 'Ask for code generation, file edits, terminal execution, or a self-contained UI artifact.'}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Example: &quot;Build a pricing page artifact in React and write the files into src/pages.&quot;
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
    </>
  );

  const renderWorkspaceBody = () => {
    switch (workspaceSection) {
      case 'search':
        return <SearchPanel />;
      case 'plugins':
        return <PluginsPanel />;
      case 'planner':
        return <PlannerPanel />;
      case 'review':
        return <ReviewPanel />;
      case 'automations':
        return (
          <>
            <ApprovalCenter />
            <AutomationInbox />
            <TaskSwitcher />
            <AutomationPanel />
          </>
        );
      case 'settings':
        return <SettingsPanel embedded />;
      case 'chat':
      default:
        return renderChatTimeline();
    }
  };

  return (
    <section className="flex min-h-[600px] flex-col gap-4">
      <div className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">{activeSectionMeta.kicker}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{activeSectionMeta.title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{activeSectionMeta.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {isStreaming ? 'Streaming' : 'Idle'}
            </span>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs text-violet-100">
              {workspaceTasks.length} tasks
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
            <span className="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs text-amber-50">
              {pendingToolApprovals.length} approvals
            </span>
          </div>
        </div>
      </div>

      {renderWorkspaceBody()}
    </section>
  );
};
