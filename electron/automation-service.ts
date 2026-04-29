import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  AppConfig,
  AutomationEvent,
  AutomationRecord,
  AutomationRunRecord,
  AutomationSchedule,
  AutomationWeekday,
  ChatStreamEvent,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '../shared/contracts';
import { deriveAutomationToolPolicy } from '../shared/tool-policy';
import { expandWorkflowCommand } from '../shared/workflow-templates';
import { AutomationStore } from './automation-store';
import { LlmService } from './llm-service';
import { SessionStore } from './session-store';

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const MAX_AUTOMATION_OUTPUT_CHARACTERS = 12_000;

const nowIso = (): string => new Date().toISOString();
const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

const truncate = (input: string, maxLength: number): string => {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
};

const sanitizeAutomationOutput = (
  output: string,
): { output: string; outputCharacters: number; outputTruncated: boolean } => ({
  output: truncate(output, MAX_AUTOMATION_OUTPUT_CHARACTERS),
  outputCharacters: output.length,
  outputTruncated: output.length > MAX_AUTOMATION_OUTPUT_CHARACTERS,
});

const isWeekday = (value: unknown): value is AutomationWeekday =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

const setLocalTime = (date: Date, hour: number, minute: number): Date => {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
};

const addLocalDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const validateClockTime = (hour: number, minute: number): { hour: number; minute: number } => {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Automation hour must be between 0 and 23.');
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Automation minute must be between 0 and 59.');
  }

  return { hour, minute };
};

const computeNextRunAt = (schedule: AutomationSchedule, baseTimeIso: string): string => {
  const baseDate = new Date(baseTimeIso);

  if (schedule.kind === 'interval') {
    return new Date(baseDate.getTime() + schedule.intervalMinutes * 60_000).toISOString();
  }

  if (schedule.kind === 'daily') {
    const candidate = setLocalTime(baseDate, schedule.hour, schedule.minute);
    const next = candidate.getTime() > baseDate.getTime() ? candidate : addLocalDays(candidate, 1);
    return next.toISOString();
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const candidateDay = addLocalDays(baseDate, offset);
    const candidateWeekday = candidateDay.getDay() as AutomationWeekday;
    if (!schedule.weekdays.includes(candidateWeekday)) {
      continue;
    }

    const candidate = setLocalTime(candidateDay, schedule.hour, schedule.minute);
    if (candidate.getTime() > baseDate.getTime()) {
      return candidate.toISOString();
    }
  }

  const fallbackDay = addLocalDays(baseDate, 7);
  return setLocalTime(fallbackDay, schedule.hour, schedule.minute).toISOString();
};

const stringifyContent = (content: ChatCompletionMessageParam['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if ('type' in item && item.type === 'text') {
        return item.text;
      }

      return '';
    })
    .join('');
};

const extractLatestAssistantOutput = (messages: ChatCompletionMessageParam[]): string => {
  const assistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && collapseWhitespace(stringifyContent(message.content)));

  return assistantMessage ? collapseWhitespace(stringifyContent(assistantMessage.content)) : '';
};

const validateIntervalMinutes = (intervalMinutes: number): number => {
  if (!Number.isFinite(intervalMinutes) || !Number.isInteger(intervalMinutes)) {
    throw new Error('Automation interval must be a whole number of minutes.');
  }

  if (intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > MAX_INTERVAL_MINUTES) {
    throw new Error(`Automation interval must be between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES} minutes.`);
  }

  return intervalMinutes;
};

const validateSchedule = (schedule: AutomationSchedule): AutomationSchedule => {
  if (schedule.kind === 'interval') {
    return {
      kind: 'interval',
      intervalMinutes: validateIntervalMinutes(schedule.intervalMinutes),
    };
  }

  if (schedule.kind === 'daily') {
    const { hour, minute } = validateClockTime(schedule.hour, schedule.minute);
    return {
      kind: 'daily',
      hour,
      minute,
    };
  }

  if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0 || !schedule.weekdays.every(isWeekday)) {
    throw new Error('Weekly automations must include at least one weekday.');
  }

  const { hour, minute } = validateClockTime(schedule.hour, schedule.minute);
  return {
    kind: 'weekly',
    weekdays: [...new Set(schedule.weekdays)].sort() as AutomationWeekday[],
    hour,
    minute,
  };
};

const isApprovalWaitingSummary = (summary: string): boolean => summary.trim().toLowerCase().startsWith('waiting for approval');
const expandAutomationWorkflowPrompt = (prompt: string): string => {
  const expansion = expandWorkflowCommand(prompt);
  return expansion?.matched ? expansion.prompt : prompt;
};

type EmitAutomationEvent = (event: AutomationEvent) => void;
type EmitChatEvent = (event: ChatStreamEvent) => void;

export class AutomationService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly runningAutomations = new Set<string>();
  private initialized = false;

  public constructor(
    private readonly automationStore: AutomationStore,
    private readonly sessionStore: SessionStore,
    private readonly llmService: LlmService,
    private readonly getConfig: () => Promise<AppConfig>,
    private readonly emitEvent: EmitAutomationEvent,
    private readonly emitChatEvent: EmitChatEvent,
  ) {}

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    await this.automationStore.markInterruptedRunsAsFailed();
    const automations = await this.automationStore.loadAutomations();
    for (const automation of automations) {
      this.scheduleAutomation(automation);
    }
  }

  public async listAutomations(): Promise<AutomationRecord[]> {
    return this.automationStore.loadAutomations();
  }

  public async listRuns(): Promise<AutomationRunRecord[]> {
    return this.automationStore.loadRuns();
  }

  public async createAutomation(input: CreateAutomationInput): Promise<AutomationRecord> {
    const timestamp = nowIso();
    const schedule = validateSchedule(input.schedule);
    const automation: AutomationRecord = {
      id: createId(),
      name: input.name.trim() || 'Untitled automation',
      prompt: input.prompt.trim(),
      schedule,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      nextRunAt: computeNextRunAt(schedule, timestamp),
    };

    if (!automation.prompt) {
      throw new Error('Automation prompt cannot be empty.');
    }

    await this.automationStore.upsertAutomation(automation);
    this.scheduleAutomation(automation);
    this.emitEvent({ type: 'automation.changed' });
    return automation;
  }

  public async updateAutomation(input: UpdateAutomationInput): Promise<AutomationRecord> {
    const automations = await this.automationStore.loadAutomations();
    const current = automations.find((automation) => automation.id === input.id);
    if (!current) {
      throw new Error('Automation not found.');
    }

    const timestamp = nowIso();
    const schedule = input.schedule !== undefined ? validateSchedule(input.schedule) : current.schedule;
    const status = input.status ?? current.status;
    const prompt = input.prompt !== undefined ? input.prompt.trim() : current.prompt;
    if (!prompt) {
      throw new Error('Automation prompt cannot be empty.');
    }

    const automation: AutomationRecord = {
      ...current,
      name: input.name !== undefined ? input.name.trim() || current.name : current.name,
      prompt,
      schedule,
      status,
      updatedAt: timestamp,
      nextRunAt: status === 'active' ? computeNextRunAt(schedule, timestamp) : null,
    };

    await this.automationStore.upsertAutomation(automation);
    this.scheduleAutomation(automation);
    this.emitEvent({ type: 'automation.changed' });
    return automation;
  }

  public async deleteAutomation(automationId: string): Promise<void> {
    this.clearTimer(automationId);
    await this.automationStore.deleteAutomation(automationId);
    this.emitEvent({ type: 'automation.changed' });
  }

  public async runAutomationNow(automationId: string): Promise<AutomationRunRecord> {
    return this.executeAutomation(automationId);
  }

  private scheduleAutomation(automation: AutomationRecord): void {
    this.clearTimer(automation.id);

    if (automation.status !== 'active' || !automation.nextRunAt) {
      return;
    }

    const delayMs = Math.max(new Date(automation.nextRunAt).getTime() - Date.now(), 1_000);
    const timer = setTimeout(() => {
      void this.executeAutomation(automation.id);
    }, delayMs);
    timer.unref?.();
    this.timers.set(automation.id, timer);
  }

  private clearTimer(automationId: string): void {
    const timer = this.timers.get(automationId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(automationId);
    }
  }

  private async executeAutomation(automationId: string): Promise<AutomationRunRecord> {
    if (this.runningAutomations.has(automationId)) {
      throw new Error('Automation is already running.');
    }

    const automations = await this.automationStore.loadAutomations();
    const automation = automations.find((item) => item.id === automationId);
    if (!automation) {
      throw new Error('Automation not found.');
    }

    this.runningAutomations.add(automationId);
    this.clearTimer(automationId);

    const startedAt = nowIso();
    const runId = createId();
    const runningRun: AutomationRunRecord = {
      id: runId,
      automationId: automation.id,
      automationName: automation.name,
      status: 'running',
      startedAt,
      summary: `Running "${automation.name}"...`,
    };

    await this.automationStore.upsertRun(runningRun);
    this.emitEvent({ type: 'automation.changed' });

    try {
      const config = await this.getConfig();
      const automationConfig: AppConfig = {
        ...config,
        toolPolicy: deriveAutomationToolPolicy(config.toolPolicy),
      };
      const requestId = `automation:${automation.id}:${runId}`;
      const sessionId = `automation:${automation.id}`;
      const automationPrompt = expandAutomationWorkflowPrompt(automation.prompt);
      const updateRunningState = async (summary: string): Promise<void> => {
        const timestamp = nowIso();
        await this.automationStore.upsertRun({
          ...runningRun,
          summary,
        });
        await this.automationStore.upsertAutomation({
          ...automation,
          updatedAt: timestamp,
          lastRunAt: timestamp,
          nextRunAt: null,
          lastRunStatus: 'running',
          lastResultSummary: truncate(summary, 220),
        });
        this.emitEvent({ type: 'automation.changed' });
      };

      await this.llmService.startChat(
        {
          requestId,
          sessionId,
          message: automationPrompt,
          config: automationConfig,
        },
        (event: ChatStreamEvent) => {
          this.emitChatEvent(event);

          if (event.type === 'approval.requested') {
            void updateRunningState(truncate(`Waiting for approval: ${event.approval.toolName} - ${event.approval.reason}`, 220));
          }

          if (event.type === 'approval.resolved') {
            void updateRunningState(
              event.decision === 'approve'
                ? 'Approval granted. Automation resumed.'
                : 'Approval rejected. Automation will stop.',
            );
          }
        },
      );

      const session = await this.sessionStore.load(sessionId);
      const rawOutput = session ? extractLatestAssistantOutput(session.messages) : '';
      const summary = truncate(rawOutput || 'Automation completed successfully.', 220);
      const finishedAt = nowIso();
      const sanitizedOutput = sanitizeAutomationOutput(rawOutput);

      const completedRun: AutomationRunRecord = {
        ...runningRun,
        status: 'completed',
        finishedAt,
        summary,
        output: sanitizedOutput.output,
        outputCharacters: sanitizedOutput.outputCharacters,
        outputTruncated: sanitizedOutput.outputTruncated,
      };

      const updatedAutomation: AutomationRecord = {
        ...automation,
        updatedAt: finishedAt,
        lastRunAt: finishedAt,
        nextRunAt:
          automation.status === 'active' && !isApprovalWaitingSummary(summary)
            ? computeNextRunAt(automation.schedule, finishedAt)
            : null,
        lastRunStatus: 'completed',
        lastResultSummary: summary,
      };

      await this.automationStore.upsertRun(completedRun);
      await this.automationStore.upsertAutomation(updatedAutomation);
      this.scheduleAutomation(updatedAutomation);
      this.emitEvent({ type: 'automation.changed' });
      return completedRun;
    } catch (error) {
      const finishedAt = nowIso();
      const message = error instanceof Error ? error.message : 'Automation failed.';
      const sanitizedOutput = sanitizeAutomationOutput(message);
      const failedRun: AutomationRunRecord = {
        ...runningRun,
        status: 'failed',
        finishedAt,
        summary: truncate(message, 220),
        output: sanitizedOutput.output,
        outputCharacters: sanitizedOutput.outputCharacters,
        outputTruncated: sanitizedOutput.outputTruncated,
      };
      const updatedAutomation: AutomationRecord = {
        ...automation,
        updatedAt: finishedAt,
        lastRunAt: finishedAt,
        nextRunAt: automation.status === 'active' ? computeNextRunAt(automation.schedule, finishedAt) : null,
        lastRunStatus: 'failed',
        lastResultSummary: truncate(message, 220),
      };

      await this.automationStore.upsertRun(failedRun);
      await this.automationStore.upsertAutomation(updatedAutomation);
      this.scheduleAutomation(updatedAutomation);
      this.emitEvent({ type: 'automation.changed' });
      return failedRun;
    } finally {
      this.runningAutomations.delete(automationId);
    }
  }
}
