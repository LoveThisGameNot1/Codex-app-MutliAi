import { describe, expect, it } from 'vitest';
import type { AutomationRecord, AutomationRunRecord } from '../../shared/contracts';
import {
  buildAutomationSchedule,
  defaultScheduleFormState,
  formatAutomationSchedule,
  getLatestAutomationRuns,
  isAutomationRunning,
  scheduleToFormState,
} from './automation-schedule';

describe('automation-schedule helpers', () => {
  it('formats weekly schedules for display', () => {
    expect(
      formatAutomationSchedule({
        kind: 'weekly',
        weekdays: [1, 3, 5],
        hour: 8,
        minute: 30,
      }),
    ).toBe('Weekly on Mon, Wed, Fri at 08:30');
  });

  it('converts schedule objects into form state and back', () => {
    const formState = scheduleToFormState({
      kind: 'daily',
      hour: 9,
      minute: 15,
    });

    expect(formState.scheduleKind).toBe('daily');
    expect(
      buildAutomationSchedule({
        ...defaultScheduleFormState(),
        ...formState,
      }),
    ).toEqual({
      kind: 'daily',
      hour: 9,
      minute: 15,
    });
  });

  it('tracks the newest run per automation', () => {
    const automation: AutomationRecord = {
      id: 'automation-1',
      name: 'Watcher',
      prompt: 'Do work.',
      schedule: { kind: 'interval', intervalMinutes: 15 },
      status: 'active',
      createdAt: '2026-04-19T12:00:00.000Z',
      updatedAt: '2026-04-19T12:00:00.000Z',
    };
    const runs: AutomationRunRecord[] = [
      {
        id: 'run-1',
        automationId: 'automation-1',
        automationName: 'Watcher',
        status: 'completed',
        startedAt: '2026-04-19T12:00:00.000Z',
        finishedAt: '2026-04-19T12:01:00.000Z',
        summary: 'Done',
      },
      {
        id: 'run-2',
        automationId: 'automation-1',
        automationName: 'Watcher',
        status: 'running',
        startedAt: '2026-04-19T12:02:00.000Z',
        summary: 'Running',
      },
    ];

    const latestRuns = getLatestAutomationRuns(runs);
    expect(latestRuns.get('automation-1')?.id).toBe('run-2');
    expect(isAutomationRunning(automation, latestRuns)).toBe(true);
  });
});
