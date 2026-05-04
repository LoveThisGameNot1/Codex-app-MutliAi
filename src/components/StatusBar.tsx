import { countUnreadAutomationRuns } from '@/services/automation-inbox';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

export const StatusBar = () => {
  const appInfo = useAppStore((state) => state.appInfo);
  const automations = useAppStore((state) => state.automations);
  const automationRuns = useAppStore((state) => state.automationRuns);
  const acknowledgedAutomationRunIds = useAppStore((state) => state.acknowledgedAutomationRunIds);
  const config = useAppStore((state) => state.config);
  const activeArtifactId = useAppStore((state) => state.activeArtifactId);
  const gitReview = useAppStore((state) => state.gitReview);
  const projectMemory = useAppStore((state) => state.projectMemory);
  const workspaceTasks = useAppStore((state) => state.workspaceTasks);
  const unreadAutomationCount = countUnreadAutomationRuns(automationRuns, acknowledgedAutomationRunIds);
  const busyTasks = workspaceTasks.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'blocked');

  const statusItems = [
    {
      label: config.model || 'No model',
      tone: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
    },
    {
      label: busyTasks.length > 0 ? `${busyTasks.length} task live` : 'idle',
      tone: busyTasks.length > 0
        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
        : 'border-white/10 bg-white/5 text-slate-300',
    },
    {
      label: gitReview?.available
        ? `${gitReview.branch || 'detached'} | ${gitReview.stagedCount}/${gitReview.unstagedCount}`
        : 'git unavailable',
      tone: 'border-white/10 bg-white/5 text-slate-300',
    },
    {
      label: `${automations.filter((automation) => automation.status === 'active').length} auto`,
      tone: unreadAutomationCount > 0
        ? 'border-amber-300/25 bg-amber-300/10 text-amber-100'
        : 'border-white/10 bg-white/5 text-slate-300',
    },
    {
      label: `${projectMemory.length} memory`,
      tone: 'border-emerald-300/15 bg-emerald-300/5 text-emerald-100/90',
    },
    {
      label: activeArtifactId ? 'artifact ready' : 'no artifact',
      tone: activeArtifactId
        ? 'border-sky-300/25 bg-sky-300/10 text-sky-100'
        : 'border-white/10 bg-white/5 text-slate-400',
    },
    {
      label: appInfo ? appInfo.platform : 'booting',
      tone: 'border-white/10 bg-white/5 text-slate-400',
    },
  ];

  return (
    <div className="hidden min-w-0 flex-wrap justify-end gap-2 lg:flex">
      {statusItems.map((item) => (
        <span key={item.label} className={cn('rounded-full border px-3 py-1 text-[11px] font-medium', item.tone)}>
          {item.label}
        </span>
      ))}
    </div>
  );
};
