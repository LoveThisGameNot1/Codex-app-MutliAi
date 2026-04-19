import { describe, expect, it } from 'vitest';
import type { AutomationRunRecord } from '../../shared/contracts';
import { buildAutomationInboxItems, countUnreadAutomationRuns, getVisibleAutomationRuns } from './automation-inbox';

const runs: AutomationRunRecord[] = [
  {
    id: 'completed-new',
    automationId: 'automation-1',
    automationName: 'Morning sweep',
    status: 'completed',
    startedAt: '2026-04-19T08:00:00.000Z',
    finishedAt: '2026-04-19T08:01:00.000Z',
    summary: 'Finished cleanly.',
    output: 'All good.',
  },
  {
    id: 'running-current',
    automationId: 'automation-2',
    automationName: 'Live build check',
    status: 'running',
    startedAt: '2026-04-19T08:05:00.000Z',
    summary: 'Still running.',
  },
  {
    id: 'failed-old',
    automationId: 'automation-3',
    automationName: 'Weekly sync',
    status: 'failed',
    startedAt: '2026-04-18T08:00:00.000Z',
    finishedAt: '2026-04-18T08:03:00.000Z',
    summary: 'Failed.',
    output: 'Network error.',
  },
];

describe('automation-inbox', () => {
  it('hides running runs and sorts finished activity newest first', () => {
    expect(getVisibleAutomationRuns(runs).map((run) => run.id)).toEqual(['completed-new', 'failed-old']);
  });

  it('marks unread runs based on acknowledgements', () => {
    const items = buildAutomationInboxItems(runs, ['failed-old']);
    expect(items).toEqual([
      {
        run: runs[0],
        unread: true,
      },
      {
        run: runs[2],
        unread: false,
      },
    ]);
  });

  it('counts only unread finished runs', () => {
    expect(countUnreadAutomationRuns(runs, ['failed-old'])).toBe(1);
    expect(countUnreadAutomationRuns(runs, ['completed-new', 'failed-old'])).toBe(0);
  });

  it('limits inbox items without changing unread totals', () => {
    const extraRuns: AutomationRunRecord[] = Array.from({ length: 6 }, (_, index) => ({
      id: `run-${index}`,
      automationId: `automation-${index}`,
      automationName: `Job ${index}`,
      status: 'completed',
      startedAt: `2026-04-19T0${index}:00:00.000Z`,
      finishedAt: `2026-04-19T0${index}:01:00.000Z`,
      summary: `Run ${index}`,
    }));

    expect(buildAutomationInboxItems(extraRuns, [], 3)).toHaveLength(3);
    expect(countUnreadAutomationRuns(extraRuns, [])).toBe(6);
  });
});
