import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../shared/contracts';
import { AutomationService } from './automation-service';
import { AutomationStore } from './automation-store';
import { SessionStore } from './session-store';
import { DEFAULT_BASE_URL, DEFAULT_PROVIDER_ID } from '../shared/provider-presets';
import { DEFAULT_TOOL_POLICY } from '../shared/tool-policy';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-automation-service-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('AutomationService', () => {
  it('creates automations and executes them through the LLM service', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);

    const llmServiceStub = {
      startChat: async ({ sessionId, message }: { sessionId: string; message: string }) => {
        await sessionStore.upsert({
          id: sessionId,
          prompt: 'automation prompt',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'developer', content: 'automation prompt' },
            { role: 'user', content: message },
            { role: 'assistant', content: `Completed: ${message}` },
          ],
        });
      },
    } as never;

    const events: string[] = [];
    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: DEFAULT_TOOL_POLICY,
      }),
      () => {
        events.push('changed');
      },
    );

    const automation = await service.createAutomation({
      name: 'Dependency sweep',
      prompt: 'Inspect dependencies and summarize risks.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
    });

    const run = await service.runAutomationNow(automation.id);
    const automations = await service.listAutomations();
    const runs = await service.listRuns();

    expect(automation.status).toBe('active');
    expect(run.status).toBe('completed');
    expect(run.summary).toContain('Completed: Inspect dependencies');
    expect(automations[0]?.lastRunStatus).toBe('completed');
    expect(automations[0]?.schedule).toEqual({
      kind: 'interval',
      intervalMinutes: 30,
    });
    expect(runs[0]?.automationId).toBe(automation.id);
    expect(events.length).toBeGreaterThan(0);
  });

  it('clamps automation tool policy before starting unattended runs', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);
    let receivedToolPolicy: AppConfig['toolPolicy'] | null = null;

    const llmServiceStub = {
      startChat: async ({ sessionId, config }: { sessionId: string; config: AppConfig }) => {
        receivedToolPolicy = config.toolPolicy;
        await sessionStore.upsert({
          id: sessionId,
          prompt: 'automation prompt',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'developer', content: 'automation prompt' },
            { role: 'assistant', content: 'Automation done.' },
          ],
        });
      },
    } as never;

    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: {
          ...DEFAULT_TOOL_POLICY,
          readFile: 'allow',
          writeFile: 'allow',
          executeTerminal: 'allow',
          outsideWorkspaceReads: 'allow',
          outsideWorkspaceWrites: 'allow',
          outsideWorkspaceTerminal: 'allow',
          riskyTerminal: 'allow',
        },
      }),
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Safety clamp',
      prompt: 'Inspect and write safe workspace files only.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
    });

    await service.runAutomationNow(automation.id);

    expect(receivedToolPolicy).toEqual({
      readFile: 'allow',
      outsideWorkspaceReads: 'block',
      writeFile: 'allow',
      outsideWorkspaceWrites: 'block',
      executeTerminal: 'allow',
      outsideWorkspaceTerminal: 'block',
      riskyTerminal: 'block',
    });
  });

  it('pauses automations by clearing the next run time', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);

    const llmServiceStub = {
      startChat: async () => undefined,
    } as never;

    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: DEFAULT_TOOL_POLICY,
      }),
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Watch tests',
      prompt: 'Run tests.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 15,
      },
    });

    const paused = await service.updateAutomation({
      id: automation.id,
      status: 'paused',
    });

    expect(paused.status).toBe('paused');
    expect(paused.nextRunAt).toBeNull();
  });

  it('supports daily schedules', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);

    const llmServiceStub = {
      startChat: async () => undefined,
    } as never;

    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: DEFAULT_TOOL_POLICY,
      }),
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Daily digest',
      prompt: 'Summarize the workspace.',
      schedule: {
        kind: 'daily',
        hour: 9,
        minute: 15,
      },
    });

    expect(automation.schedule).toEqual({
      kind: 'daily',
      hour: 9,
      minute: 15,
    });
    expect(automation.nextRunAt).toBeTruthy();
  });

  it('supports weekly schedules', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);

    const llmServiceStub = {
      startChat: async () => undefined,
    } as never;

    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: DEFAULT_TOOL_POLICY,
      }),
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Weekly report',
      prompt: 'Write the weekly report.',
      schedule: {
        kind: 'weekly',
        weekdays: [1, 3, 5],
        hour: 8,
        minute: 0,
      },
    });

    expect(automation.schedule).toEqual({
      kind: 'weekly',
      weekdays: [1, 3, 5],
      hour: 8,
      minute: 0,
    });
    expect(automation.nextRunAt).toBeTruthy();
  });

  it('truncates oversized automation output before persisting runs', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);
    const oversizedOutput = 'A'.repeat(12_500);

    const llmServiceStub = {
      startChat: async ({ sessionId }: { sessionId: string }) => {
        await sessionStore.upsert({
          id: sessionId,
          prompt: 'automation prompt',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'developer', content: 'automation prompt' },
            { role: 'assistant', content: oversizedOutput },
          ],
        });
      },
    } as never;

    const service = new AutomationService(
      automationStore,
      sessionStore,
      llmServiceStub,
      async () => ({
        providerId: DEFAULT_PROVIDER_ID,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'test-key',
        model: 'gpt-5.4',
        systemPrompt: 'system',
        toolPolicy: DEFAULT_TOOL_POLICY,
      }),
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Oversized output check',
      prompt: 'Generate a huge report.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 60,
      },
    });

    const run = await service.runAutomationNow(automation.id);

    expect(run.outputCharacters).toBe(12_500);
    expect(run.outputTruncated).toBe(true);
    expect(run.output?.length).toBeLessThanOrEqual(12_000);
    expect(run.output?.endsWith('...')).toBe(true);
  });
});
