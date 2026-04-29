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

const createDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = () => {
      nextResolve();
    };
  });

  return { promise, resolve };
};

const waitFor = async (predicate: () => Promise<boolean>, attempts = 20, delayMs = 10): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timed out while waiting for condition.');
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
      () => undefined,
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

  it('expands workflow slash commands before running automations', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);
    let receivedMessage = '';

    const llmServiceStub = {
      startChat: async ({ sessionId, message }: { sessionId: string; message: string }) => {
        receivedMessage = message;
        await sessionStore.upsert({
          id: sessionId,
          prompt: 'automation prompt',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'developer', content: 'automation prompt' },
            { role: 'user', content: message },
            { role: 'assistant', content: 'Workflow automation done.' },
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
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Weekly dependency audit',
      prompt: '/dependency-audit weekly package risk sweep',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
    });

    await service.runAutomationNow(automation.id);

    expect(receivedMessage).toContain('Run a dependency audit for weekly package risk sweep.');
    expect(receivedMessage).toContain('Inspect package manifests and lockfiles before changing anything.');
  });

  it('preserves ask-first permissions for in-workspace automation tools so runs can pause for approval', async () => {
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
          writeFile: 'ask',
        },
      }),
      () => undefined,
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Approval-ready automation',
      prompt: 'Write a file after approval.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
    });

    await service.runAutomationNow(automation.id);

    expect(receivedToolPolicy).toEqual({
      readFile: 'allow',
      outsideWorkspaceReads: 'block',
      writeFile: 'ask',
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

  it('keeps automation runs pending while an approval is unresolved', async () => {
    const baseDir = await createTempDir();
    const automationStore = new AutomationStore(baseDir);
    const sessionStore = new SessionStore(baseDir);
    const gate = createDeferred();

    const llmServiceStub = {
      startChat: async (
        { requestId, sessionId }: { requestId: string; sessionId: string },
        emitEvent: (event: {
          type: 'approval.requested';
          requestId: string;
          approval: {
            id: string;
            requestId: string;
            source: 'automation';
            toolName: string;
            policyKey: 'writeFile';
            argumentsText: string;
            reason: string;
            requestedAt: string;
            scopeOptions: ['once', 'request', 'always'];
          };
        }) => void,
      ) => {
        emitEvent({
          type: 'approval.requested',
          requestId,
          approval: {
            id: 'approval-1',
            requestId,
            source: 'automation',
            toolName: 'write_file',
            policyKey: 'writeFile',
            argumentsText: '{\n  "path": "notes.txt"\n}',
            reason: 'write_file is not fully allowed in the current tool policy.',
            requestedAt: new Date().toISOString(),
            scopeOptions: ['once', 'request', 'always'],
          },
        });

        await gate.promise;
        await sessionStore.upsert({
          id: sessionId,
          prompt: 'automation prompt',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'developer', content: 'automation prompt' },
            { role: 'assistant', content: 'Automation completed after approval.' },
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
          writeFile: 'ask',
        },
      }),
      () => undefined,
      () => undefined,
    );

    const automation = await service.createAutomation({
      name: 'Approval wait automation',
      prompt: 'Write a file after approval.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
    });

    const runPromise = service.runAutomationNow(automation.id);
    await waitFor(async () => {
      const runs = await service.listRuns();
      return runs[0]?.summary.includes('Waiting for approval') ?? false;
    });

    const interimRuns = await service.listRuns();
    const interimAutomations = await service.listAutomations();

    expect(interimRuns[0]?.status).toBe('running');
    expect(interimRuns[0]?.summary).toContain('Waiting for approval');
    expect(interimAutomations[0]?.lastRunStatus).toBe('running');
    expect(interimAutomations[0]?.nextRunAt).toBeNull();

    gate.resolve();
    const run = await runPromise;
    const updatedAutomations = await service.listAutomations();

    expect(run.status).toBe('completed');
    expect(updatedAutomations[0]?.lastRunStatus).toBe('completed');
    expect(updatedAutomations[0]?.nextRunAt).toBeTruthy();
  });
});
