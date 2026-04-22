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

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v5l3 2" />
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

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const sectionDescriptions: Record<WorkspaceSection, string> = {
  chat: 'Current workspace chat',
  search: 'Search everything',
  review: 'Review changed files',
  plugins: 'Provider and tool integrations',
  automations: 'Scheduled work and runs',
  settings: 'Runtime configuration',
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

  return latestUserMessage.content.replace(/\s+/g, ' ').trim().slice(0, 34);
};

export const WorkspaceSidebar = () => {
  const appInfo = useAppStore((state) => state.appInfo);
  const messages = useAppStore((state) => state.messages);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const sessionId = useAppStore((state) => state.sessionId);
  const automations = useAppStore((state) => state.automations);
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
  const recentSessions = useMemo(() => persistedSessions.slice(0, 5), [persistedSessions]);

  const navigationItems: Array<{
    key: WorkspaceSection;
    label: string;
    icon: ReactNode;
    badge?: string | null;
  }> = [
    { key: 'search', label: 'Search', icon: <SearchIcon /> },
    { key: 'review', label: 'Review', icon: <ReviewIcon /> },
    { key: 'plugins', label: 'Plugins', icon: <GridIcon /> },
    {
      key: 'automations',
      label: 'Automations',
      icon: <ClockIcon />,
      badge: unreadAutomationCount > 0 ? String(unreadAutomationCount) : null,
    },
  ];

  return (
    <aside className="flex min-h-[760px] flex-col rounded-[30px] border border-white/10 bg-slate-950/85 p-4 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-2 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Workspace</p>
          <p className="mt-2 text-lg font-semibold text-white">CodexApp</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100">
          Local
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          void chatRuntime.resetConversation();
          setWorkspaceSection('chat');
        }}
        className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium text-slate-100 transition hover:bg-white/5"
      >
        <PencilSquareIcon />
        <span>New chat</span>
      </button>

      <div className="mt-3 space-y-1">
        {navigationItems.map((item) => {
          const isActive = workspaceSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setWorkspaceSection(item.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition',
                isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.badge ? (
                <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-[11px] text-slate-100">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6 px-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-500">
          <span>Projects</span>
          <span>{recentSessions.length + 1}</span>
        </div>
        <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-slate-900/80 p-2 text-slate-200">
              <FolderIcon />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{workspaceName}</p>
              <p className="mt-1 text-xs text-slate-500">{sectionDescriptions[workspaceSection]}</p>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <button
              type="button"
              onClick={() => setWorkspaceSection('chat')}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition',
                workspaceSection === 'chat' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5',
              )}
            >
              <span className="truncate">{currentChatLabel}</span>
              <span className="text-xs text-slate-500">now</span>
            </button>

            {recentSessions.map((session) => {
              const isActive = session.id === sessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    void chatRuntime.loadPersistedSession(session.id);
                    setWorkspaceSection('chat');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition',
                    isActive ? 'bg-sky-400/10 text-sky-100' : 'text-slate-300 hover:bg-white/5',
                  )}
                >
                  <span className="truncate">{session.title}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(session.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex-1 px-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-500">
          <span>Chats</span>
          <span>{messages.length === 0 ? 0 : 1}</span>
        </div>
        <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No chats yet</p>
          ) : (
            <button
              type="button"
              onClick={() => setWorkspaceSection('chat')}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
            >
              <span className="truncate">{currentChatLabel}</span>
              <ChevronRightIcon />
            </button>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500">
            {automations.filter((automation) => automation.status === 'active').length} active automations, {unreadAutomationCount}{' '}
            unread updates.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setWorkspaceSection('settings')}
        className={cn(
          'mt-4 flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition',
          workspaceSection === 'settings' ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )}
      >
        <SettingsIcon />
        <span>Settings</span>
      </button>
    </aside>
  );
};
