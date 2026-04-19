import type { AutomationRunRecord } from '../../shared/contracts';

export type AutomationInboxItem = {
  run: AutomationRunRecord;
  unread: boolean;
};

const sortRunsDescending = (runs: AutomationRunRecord[]): AutomationRunRecord[] =>
  [...runs].sort((left, right) => {
    const leftTime = left.finishedAt ?? left.startedAt;
    const rightTime = right.finishedAt ?? right.startedAt;
    return new Date(rightTime).getTime() - new Date(leftTime).getTime();
  });

export const getVisibleAutomationRuns = (runs: AutomationRunRecord[]): AutomationRunRecord[] =>
  sortRunsDescending(runs.filter((run) => run.status !== 'running'));

export const buildAutomationInboxItems = (
  runs: AutomationRunRecord[],
  acknowledgedRunIds: string[],
  limit = 4,
): AutomationInboxItem[] => {
  const acknowledgedIds = new Set(acknowledgedRunIds);

  return getVisibleAutomationRuns(runs)
    .map((run) => ({
      run,
      unread: !acknowledgedIds.has(run.id),
    }))
    .slice(0, limit);
};

export const countUnreadAutomationRuns = (runs: AutomationRunRecord[], acknowledgedRunIds: string[]): number => {
  const acknowledgedIds = new Set(acknowledgedRunIds);
  return getVisibleAutomationRuns(runs).filter((run) => !acknowledgedIds.has(run.id)).length;
};
