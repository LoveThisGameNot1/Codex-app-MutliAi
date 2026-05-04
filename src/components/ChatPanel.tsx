import { useEffect, useMemo, useRef } from 'react';
import { ApprovalCenter } from '@/components/ApprovalCenter';
import { AutomationInbox } from '@/components/AutomationInbox';
import { AutomationPanel } from '@/components/AutomationPanel';
import { ChatComposer } from '@/components/ChatComposer';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { MemoryPanel } from '@/components/MemoryPanel';
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
  user: 'border-sky-300/20 bg-sky-300/[0.085]',
  assistant: 'border-white/10 bg-white/[0.045]',
  tool: 'border-emerald-300/20 bg-emerald-300/[0.08]',
  system: 'border-amber-300/20 bg-amber-300/[0.08]',
};

const roleLabels: Record<string, string> = {
  user: 'You',
  assistant: 'Agent',
  tool: 'Tool',
  system: 'System',
};

const sectionMeta = {
  chat: {
    eyebrow: 'Conversation',
    title: 'Agent desk',
    description: 'A focused command surface for prompts, approvals, tool output, and parallel tasks.',
  },
  search: {
    eyebrow: 'Search',
    title: 'Workspace index',
    description: 'Find sessions, generated artifacts, automations, and useful historical context.',
  },
  review: {
    eyebrow: 'Review',
    title: 'Repository cockpit',
    description: 'Inspect staged and unstaged work, draft commits, and review code without leaving the app.',
  },
  plugins: {
    eyebrow: 'Plugins',
    title: 'Capability layer',
    description: 'Manage providers, integrations, plugin state, and external tool surfaces.',
  },
  planner: {
    eyebrow: 'Planner',
    title: 'Execution map',
    description: 'Turn broad goals into concrete steps before sending agents into the workspace.',
  },
  automations: {
    eyebrow: 'Automations',
    title: 'Scheduled agent work',
    description: 'Create and supervise recurring tasks with approval-aware unattended execution.',
  },
  memory: {
    eyebrow: 'Memory',
    title: 'Project knowledge',
    description: 'Keep durable instructions and facts outside ephemeral chat history.',
  },
  settings: {
    eyebrow: 'Settings',
    title: 'Runtime controls',
    description: 'Tune providers, models, policies, sessions, and local execution behavior.',
  },
} as const;

export const ChatPanel = () => {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const allMessages = useAppStore((state) => state.messages);
  const allToolExecutions = useAppStore((state) => state.toolExecutions);
  const lastError = useAppStore((state) => state.lastError);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const workspaceSection = useAppStore((state) => state.workspaceSection);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const pendingToolApprovals = useAppStore((state) => state.pendingToolApprovals);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const activeTask = workspaceTasks.find((task) => task.id === activeTaskId) ?? null;
  const messages = useMemo(
    () => allMessages.filter((message) => message.taskId === activeTaskId),
    [activeTaskId, allMessages],
  );
  const toolExecutions = useMemo(
    () => allToolExecutions.filter((tool) => tool.taskId === activeTaskId),
    [activeTaskId, allToolExecutions],
  );

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
      <div className="grid gap-3">
        <TaskSwitcher />
        <div className="grid gap-3 xl:grid-cols-2">
          <ApprovalCenter />
          <AutomationInbox />
        </div>
      </div>

      <div
        ref={timelineRef}
        className="glass-panel min-h-0 flex-1 overflow-y-auto rounded-[30px] p-4"
      >
        {messages.length === 0 ? (
          <div className="grid min-h-[320px] place-items-center rounded-[26px] border border-dashed border-slate-700/70 bg-slate-950/45 p-8 text-center">
            <div className="max-w-md">
              <p className="text-xs uppercase tracking-[0.32em] text-sky-200/70">Ready for work</p>
              <h3 className="mt-4 text-2xl font-semibold text-white">
                {activeTask ? activeTask.title : 'Start a new agent task'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Ask for file edits, terminal execution, browser validation, or a live artifact. The right panel stays ready for code and previews.
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.map((message) => (
            <article
              key={message.id}
              className={cn('rounded-[26px] border px-4 py-4', roleStyles[message.role] ?? roleStyles.assistant)}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {roleLabels[message.role] ?? 'Message'}
                  </span>
                  <span className="text-xs text-muted">{new Date(message.createdAt).toLocaleTimeString()}</span>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]',
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

              <div className="prose prose-invert max-w-none text-sm text-slate-200 prose-p:leading-7 prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/30">
                <MarkdownMessage content={message.content || ' '} />
              </div>
            </article>
          ))}
        </div>
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
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              <ApprovalCenter />
              <AutomationInbox />
              <TaskSwitcher />
              <AutomationPanel />
            </div>
          </div>
        );
      case 'memory':
        return <MemoryPanel />;
      case 'settings':
        return <SettingsPanel embedded />;
      case 'chat':
      default:
        return renderChatTimeline();
    }
  };

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-hidden">
      <div className="glass-panel rounded-[32px] p-4">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0 2xl:max-w-[58%]">
            <p className="text-xs uppercase tracking-[0.28em] text-sky-200/75">{activeSectionMeta.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{activeSectionMeta.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{activeSectionMeta.description}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 2xl:w-[360px]">
            <span className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-300">
              {isStreaming ? 'Streaming' : 'Idle'}
            </span>
            <span className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-300">
              {workspaceTasks.length} tasks
            </span>
            <span className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
              {toolSummary.running} tools
            </span>
            <span className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
              {toolSummary.failed} failed
            </span>
            <span className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              {unreadAutomationCount} alerts
            </span>
            <span className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">
              {pendingToolApprovals.length} approvals
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">{renderWorkspaceBody()}</div>
    </section>
  );
};
