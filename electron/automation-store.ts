import fs from 'node:fs/promises';
import path from 'node:path';
import type { AutomationRecord, AutomationRunRecord, AutomationSchedule, AutomationWeekday } from '../shared/contracts';

const MAX_RUNS = 200;

const sortAutomations = (automations: AutomationRecord[]): AutomationRecord[] =>
  [...automations].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

const sortRuns = (runs: AutomationRunRecord[]): AutomationRunRecord[] =>
  [...runs].sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

const isWeekday = (value: unknown): value is AutomationWeekday =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

const sanitizeSchedule = (value: unknown, legacyIntervalMinutes?: unknown): AutomationSchedule | null => {
  if (!value || typeof value !== 'object') {
    if (typeof legacyIntervalMinutes === 'number' && Number.isInteger(legacyIntervalMinutes)) {
      return {
        kind: 'interval',
        intervalMinutes: legacyIntervalMinutes,
      };
    }

    return null;
  }

  const schedule = value as Partial<AutomationSchedule>;
  if (schedule.kind === 'interval' && typeof schedule.intervalMinutes === 'number' && Number.isInteger(schedule.intervalMinutes)) {
    return {
      kind: 'interval',
      intervalMinutes: schedule.intervalMinutes,
    };
  }

  if (
    schedule.kind === 'daily' &&
    typeof schedule.hour === 'number' &&
    Number.isInteger(schedule.hour) &&
    typeof schedule.minute === 'number' &&
    Number.isInteger(schedule.minute)
  ) {
    return {
      kind: 'daily',
      hour: schedule.hour,
      minute: schedule.minute,
    };
  }

  if (
    schedule.kind === 'weekly' &&
    Array.isArray(schedule.weekdays) &&
    schedule.weekdays.length > 0 &&
    schedule.weekdays.every(isWeekday) &&
    typeof schedule.hour === 'number' &&
    Number.isInteger(schedule.hour) &&
    typeof schedule.minute === 'number' &&
    Number.isInteger(schedule.minute)
  ) {
    return {
      kind: 'weekly',
      weekdays: [...new Set(schedule.weekdays)].sort() as AutomationWeekday[],
      hour: schedule.hour,
      minute: schedule.minute,
    };
  }

  return null;
};

const sanitizeAutomation = (value: unknown): AutomationRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<AutomationRecord>;
  const schedule = sanitizeSchedule((record as { schedule?: unknown }).schedule, (record as { intervalMinutes?: unknown }).intervalMinutes);
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.prompt !== 'string' ||
    !schedule ||
    (record.status !== 'active' && record.status !== 'paused') ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    prompt: record.prompt,
    schedule,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : undefined,
    nextRunAt: typeof record.nextRunAt === 'string' || record.nextRunAt === null ? record.nextRunAt : null,
    lastRunStatus:
      record.lastRunStatus === 'running' || record.lastRunStatus === 'completed' || record.lastRunStatus === 'failed'
        ? record.lastRunStatus
        : undefined,
    lastResultSummary: typeof record.lastResultSummary === 'string' ? record.lastResultSummary : undefined,
  };
};

const sanitizeRun = (value: unknown): AutomationRunRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<AutomationRunRecord>;
  if (
    typeof record.id !== 'string' ||
    typeof record.automationId !== 'string' ||
    typeof record.automationName !== 'string' ||
    (record.status !== 'running' && record.status !== 'completed' && record.status !== 'failed') ||
    typeof record.startedAt !== 'string' ||
    typeof record.summary !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    automationId: record.automationId,
    automationName: record.automationName,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: typeof record.finishedAt === 'string' ? record.finishedAt : undefined,
    summary: record.summary,
    output: typeof record.output === 'string' ? record.output : undefined,
    outputCharacters: typeof record.outputCharacters === 'number' ? record.outputCharacters : undefined,
    outputTruncated: typeof record.outputTruncated === 'boolean' ? record.outputTruncated : undefined,
  };
};

export class AutomationStore {
  private readonly automationsFilePath: string;
  private readonly runsFilePath: string;

  public constructor(baseDir: string) {
    this.automationsFilePath = path.join(baseDir, 'automations.json');
    this.runsFilePath = path.join(baseDir, 'automation-runs.json');
  }

  public async loadAutomations(): Promise<AutomationRecord[]> {
    try {
      const raw = await fs.readFile(this.automationsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return sortAutomations(parsed.map(sanitizeAutomation).filter((value): value is AutomationRecord => Boolean(value)));
    } catch {
      return [];
    }
  }

  public async loadRuns(): Promise<AutomationRunRecord[]> {
    try {
      const raw = await fs.readFile(this.runsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return sortRuns(parsed.map(sanitizeRun).filter((value): value is AutomationRunRecord => Boolean(value))).map(
        (run) =>
          run.status === 'running'
            ? {
                ...run,
                status: 'failed',
                finishedAt: run.finishedAt ?? new Date().toISOString(),
                summary: 'Automation run was interrupted because the app closed before completion.',
              }
            : run,
      );
    } catch {
      return [];
    }
  }

  public async upsertAutomation(automation: AutomationRecord): Promise<void> {
    const automations = await this.loadAutomations();
    const next = sortAutomations([
      automation,
      ...automations.filter((item) => item.id !== automation.id),
    ]);
    await this.writeJson(this.automationsFilePath, next);
  }

  public async deleteAutomation(automationId: string): Promise<void> {
    const automations = await this.loadAutomations();
    await this.writeJson(
      this.automationsFilePath,
      automations.filter((automation) => automation.id !== automationId),
    );

    const runs = await this.loadRuns();
    await this.writeJson(
      this.runsFilePath,
      runs.filter((run) => run.automationId !== automationId),
    );
  }

  public async upsertRun(run: AutomationRunRecord): Promise<void> {
    const runs = await this.loadRuns();
    const next = sortRuns([run, ...runs.filter((item) => item.id !== run.id)]).slice(0, MAX_RUNS);
    await this.writeJson(this.runsFilePath, next);
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  }
}
