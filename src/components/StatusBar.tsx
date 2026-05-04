import { countUnreadAutomationRuns } from '@/services/automation-inbox';
import { useAppStore } from '@/store/app-store';

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

  const items = [
    config.model || 'No model',
    busyTasks.length > 0 ? `${busyTasks.length} task live` : 'tasks idle',
    gitReview?.available
      ? `${gitReview.branch || 'detached'} | ${gitReview.stagedCount} staged | ${gitReview.unstagedCount} unstaged`
      : 'git review unavailable',
    `${automations.filter((automation) => automation.status === 'active').length} automations active`,
    `${unreadAutomationCount} unread automation updates`,
    `${projectMemory.length} memories`,
    `${workspaceTasks.length} tasks`,
    activeArtifactId ? 'artifact selected' : 'artifact empty',
    appInfo ? `${appInfo.platform} | Node ${appInfo.nodeVersion}` : 'renderer booting',
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {item}
        </span>
      ))}
    </div>
  );
};
