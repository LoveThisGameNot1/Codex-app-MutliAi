import { useMemo, type ReactNode } from 'react';
import { chatRuntime } from '@/services/chat-runtime';
import { countUnreadAutomationRuns } from '@/services/automation-inbox';
import { useAppStore, type WorkspaceSection } from '@/store/app-store';
import { cn } from '@/utils/cn';

const iconClassName = 'h-4 w-4 shrink-0 text-current';

const PencilSquareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <rect x="4" y="4" width="6" height="6" rx="1.2" />
    <rect x="14" y="4" width="6" height="6" rx="1.2" />
    <rect x="4" y="14" width="6" height="6" rx="1.2" />
    <rect x="14" y="14" width="6" height="6" rx="1.2" />
  </svg>
);

const ReviewIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 5.5h16" />
    <path d="M4 12h16" />
    <path d="M4 18.5h10" />
  </svg>
);

const PlannerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M7 4.5h10" />
    <path d="M7 9h10" />
    <path d="M7 13.5h6" />
    <path d="M5 19.5 3.5 18l1.5-1.5" />
    <path d="M9 18h11" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const MemoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M6 4.5h9.5L19 8v11.5H6V4.5Z" />
    <path d="M15 4.5V8h4" />
    <path d="M9 12h7" />
    <path d="M9 15.5h5" />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M12 3.5v2.2" />
    <path d="M12 18.3v2.2" />
    <path d="m4.8 6.8 1.6 1.6" />
    <path d="m17.6 19.6 1.6 1.6" />
    <path d="M3.5 12h2.2" />
    <path d="M18.3 12h2.2" />
    <path d="m4.8 17.2 1.6-1.6" />
    <path d="m17.6 4.4 1.6-1.6" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

const sectionDescriptions: Record<WorkspaceSection, string> = {
  chat: 'Current agent thread',
  search: 'Find generated context',
  review: 'Inspect repository changes',
  plugins: 'Connect tools and providers',
  planner: 'Break work into steps',
  automations: 'Scheduled agent work',
  memory: 'Durable project facts',
  settings: 'Runtime and providers',
};

const formatWorkspaceName = (workspaceRoot?: string): string => {
  if (!workspaceRoot) {
    return 'Current workspace';
  }

  const normalized = workspaceRoot.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || workspaceRoot;
};

const deriveCurrentChatLabel = (messages: Array<{ role: string; content: string }>): string => {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user' && message.content.trim().length > 0);
  if (!latestUserMessage) {
    return 'New chat';
  }

  return latestUserMessage.content.replace(/\s+/g, ' ').trim().slice(0, 36);
};

type NavigationItem = {
  key: WorkspaceSection;
  label: string;
  icon: ReactNode;
  badge?: string | null;
};

export const WorkspaceSidebar = () => {
  const appInfo = useAppStore((state) => state.appInfo);
  const messages = useAppStore((state) => state.messages);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const sessionId = useAppStore((state) => state.sessionId);
  const automations = useAppStore((state) => state.automations);
  const plans = useAppStore((state) => state.plans);
  const projectMemory = useAppStore((state) => state.projectMemory);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const workspaceSection = useAppStore((state) => state.workspaceSection);
  const setWorkspaceSection = useAppStore((state) => state.setWorkspaceSection);

  const unreadAutomationCount = useMemo(
    () => countUnreadAutomationRuns(automationRuns, acknowledgedAutomationRunIds),
    [acknowledgedAutomationRunIds, automationRuns],
  );

  const workspaceName = useMemo(() => formatWorkspaceName(appInfo?.workspaceRoot), [appInfo?.workspaceRoot]);
  const currentChatLabel = useMemo(() => deriveCurrentChatLabel(messages), [messages]);
  const recentSessions = useMemo(() => persistedSessions.slice(0, 4), [persistedSessions]);

  const navigationItems: NavigationItem[] = [
    { key: 'chat', label: 'Chat', icon: <PencilSquareIcon /> },
    { key: 'search', label: 'Search', icon: <SearchIcon /> },
    { key: 'review', label: 'Review', icon: <ReviewIcon /> },
    { key: 'plugins', label: 'Plugins', icon: <GridIcon /> },
    { key: 'planner', label: 'Planner', icon: <PlannerIcon />, badge: plans.length > 0 ? String(plans.length) : null },
    {
      key: 'automations',
      label: 'Automations',
      icon: <ClockIcon />,
      badge: unreadAutomationCount > 0 ? String(unreadAutomationCount) : null,
    },
    { key: 'memory', label: 'Memory', icon: <MemoryIcon />, badge: projectMemory.length > 0 ? String(projectMemory.length) : null },
  ];

  return (
    <aside className="glass-panel-strong flex min-h-0 flex-col overflow-hidden rounded-[32px] p-3">
      <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-100">
            <FolderIcon />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{workspaceName}</p>
            <p className="mt-1 text-xs text-muted">{sectionDescriptions[workspaceSection]}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void chatRuntime.resetConversation();
            setWorkspaceSection('chat');
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-300/15"
        >
          <PencilSquareIcon />
          New Chat
        </button>
      </div>

      <nav className="mt-3 space-y-1.5">
        {navigationItems.map((item) => {
          const active = workspaceSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setWorkspaceSection(item.key)}
              className={cn(
                'group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition',
                active
                  ? 'border border-sky-300/20 bg-sky-300/10 text-white shadow-glow'
                  : 'border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.055] hover:text-slate-100',
              )}
            >
              <span className="flex items-center gap-3">
                <span className={cn('text-slate-500 transition group-hover:text-slate-200', active && 'text-sky-100')}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </span>
              {item.badge ? (
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-2 flex items-center justify-between px-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
          <span>Project Thread</span>
          <span>{recentSessions.length + 1}</span>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setWorkspaceSection('chat')}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-left transition hover:bg-white/[0.07]"
          >
            <span className="block truncate text-sm font-medium text-slate-100">{currentChatLabel}</span>
            <span className="mt-1 block text-xs text-muted">Current session</span>
          </button>

          {recentSessions.map((session) => {
            const active = session.id === sessionId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  void chatRuntime.loadPersistedSession(session.id);
                  setWorkspaceSection('chat');
                }}
                className={cn(
                  'w-full rounded-2xl border px-3 py-3 text-left transition',
                  active
                    ? 'border-sky-300/20 bg-sky-300/10 text-sky-100'
                    : 'border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.06]',
                )}
              >
                <span className="block truncate text-sm font-medium">{session.title}</span>
                <span className="mt-1 block text-xs text-muted">
                  {new Date(session.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} | {session.messageCount} messages
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-[24px] border border-white/10 bg-white/[0.035] p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-semibold text-white">{automations.filter((automation) => automation.status === 'active').length}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Auto</p>
          </div>
          <div>
            <p className="text-base font-semibold text-white">{projectMemory.length}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Memory</p>
          </div>
          <div>
            <p className="text-base font-semibold text-white">{unreadAutomationCount}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Alerts</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setWorkspaceSection('settings')}
        className={cn(
          'mt-3 flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition',
          workspaceSection === 'settings'
            ? 'border-sky-300/20 bg-sky-300/10 text-white'
            : 'border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.06]',
        )}
      >
        <SettingsIcon />
        Settings
      </button>
    </aside>
  );
};
