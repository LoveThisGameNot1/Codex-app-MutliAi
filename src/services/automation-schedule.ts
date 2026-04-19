import type { AutomationRecord, AutomationRunRecord, AutomationSchedule, AutomationWeekday } from '../../shared/contracts';

export const weekdayOptions: Array<{ label: string; value: AutomationWeekday }> = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export type ScheduleFormState = {
  scheduleKind: 'interval' | 'daily' | 'weekly';
  intervalMinutes: string;
  dailyHour: string;
  dailyMinute: string;
  weeklyHour: string;
  weeklyMinute: string;
  weeklyDays: AutomationWeekday[];
};

export const defaultScheduleFormState = (): ScheduleFormState => ({
  scheduleKind: 'interval',
  intervalMinutes: '30',
  dailyHour: '09',
  dailyMinute: '00',
  weeklyHour: '09',
  weeklyMinute: '00',
  weeklyDays: [1],
});

const sortWeekdays = (weekdays: AutomationWeekday[]): AutomationWeekday[] =>
  [...weekdays].sort((left, right) => left - right) as AutomationWeekday[];

export const formatAutomationTimestamp = (value?: string | null): string => {
  if (!value) {
    return 'Not scheduled';
  }

  return new Date(value).toLocaleString();
};

export const formatAutomationSchedule = (schedule: AutomationSchedule): string => {
  if (schedule.kind === 'interval') {
    return `Every ${schedule.intervalMinutes} minutes`;
  }

  const time = `${schedule.hour.toString().padStart(2, '0')}:${schedule.minute.toString().padStart(2, '0')}`;
  if (schedule.kind === 'daily') {
    return `Daily at ${time}`;
  }

  const weekdayLabels = schedule.weekdays
    .map((weekday) => weekdayOptions.find((option) => option.value === weekday)?.label ?? '?')
    .join(', ');
  return `Weekly on ${weekdayLabels} at ${time}`;
};

export const scheduleToFormState = (schedule: AutomationSchedule): ScheduleFormState => {
  const defaults = defaultScheduleFormState();
  if (schedule.kind === 'interval') {
    return {
      ...defaults,
      scheduleKind: 'interval',
      intervalMinutes: String(schedule.intervalMinutes),
    };
  }

  if (schedule.kind === 'daily') {
    return {
      ...defaults,
      scheduleKind: 'daily',
      dailyHour: String(schedule.hour).padStart(2, '0'),
      dailyMinute: String(schedule.minute).padStart(2, '0'),
    };
  }

  return {
    ...defaults,
    scheduleKind: 'weekly',
    weeklyHour: String(schedule.hour).padStart(2, '0'),
    weeklyMinute: String(schedule.minute).padStart(2, '0'),
    weeklyDays: sortWeekdays(schedule.weekdays),
  };
};

export const buildAutomationSchedule = (state: ScheduleFormState): AutomationSchedule | null => {
  if (state.scheduleKind === 'interval') {
    const parsedInterval = Number.parseInt(state.intervalMinutes, 10);
    if (!Number.isInteger(parsedInterval)) {
      return null;
    }

    return {
      kind: 'interval',
      intervalMinutes: parsedInterval,
    };
  }

  if (state.scheduleKind === 'daily') {
    const hour = Number.parseInt(state.dailyHour, 10);
    const minute = Number.parseInt(state.dailyMinute, 10);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }

    return {
      kind: 'daily',
      hour,
      minute,
    };
  }

  const hour = Number.parseInt(state.weeklyHour, 10);
  const minute = Number.parseInt(state.weeklyMinute, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || state.weeklyDays.length === 0) {
    return null;
  }

  return {
    kind: 'weekly',
    weekdays: sortWeekdays(state.weeklyDays),
    hour,
    minute,
  };
};

export const getLatestAutomationRuns = (runs: AutomationRunRecord[]): Map<string, AutomationRunRecord> => {
  const latest = new Map<string, AutomationRunRecord>();
  for (const run of runs) {
    const existing = latest.get(run.automationId);
    if (!existing || new Date(run.startedAt).getTime() > new Date(existing.startedAt).getTime()) {
      latest.set(run.automationId, run);
    }
  }

  return latest;
};

export const isAutomationRunning = (
  automation: AutomationRecord,
  latestRuns: Map<string, AutomationRunRecord>,
): boolean => latestRuns.get(automation.id)?.status === 'running';
