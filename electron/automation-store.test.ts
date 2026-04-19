import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationStore } from './automation-store';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-automations-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('AutomationStore', () => {
  it('persists automations and runs', async () => {
    const baseDir = await createTempDir();
    const store = new AutomationStore(baseDir);

    await store.upsertAutomation({
      id: 'automation-1',
      name: 'Nightly check',
      prompt: 'Run tests.',
      schedule: {
        kind: 'interval',
        intervalMinutes: 30,
      },
      status: 'active',
      createdAt: '2026-04-19T12:00:00.000Z',
      updatedAt: '2026-04-19T12:00:00.000Z',
      nextRunAt: '2026-04-19T12:30:00.000Z',
    });

    await store.upsertRun({
      id: 'run-1',
      automationId: 'automation-1',
      automationName: 'Nightly check',
      status: 'completed',
      startedAt: '2026-04-19T12:00:00.000Z',
      finishedAt: '2026-04-19T12:01:00.000Z',
      summary: 'All green.',
      output: 'All green.',
    });

    const automations = await store.loadAutomations();
    const runs = await store.loadRuns();

    expect(automations).toHaveLength(1);
    expect(automations[0]?.name).toBe('Nightly check');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.summary).toBe('All green.');
  });

  it('migrates legacy interval automations into schedule objects', async () => {
    const baseDir = await createTempDir();
    await fs.writeFile(
      path.join(baseDir, 'automations.json'),
      JSON.stringify([
        {
          id: 'legacy-1',
          name: 'Legacy automation',
          prompt: 'Do work.',
          intervalMinutes: 45,
          status: 'active',
          createdAt: '2026-04-19T12:00:00.000Z',
          updatedAt: '2026-04-19T12:00:00.000Z',
        },
      ]),
      'utf8',
    );

    const store = new AutomationStore(baseDir);
    const automations = await store.loadAutomations();

    expect(automations[0]?.schedule).toEqual({
      kind: 'interval',
      intervalMinutes: 45,
    });
  });

  it('sanitizes interrupted running runs on load', async () => {
    const baseDir = await createTempDir();
    const store = new AutomationStore(baseDir);

    await store.upsertRun({
      id: 'run-1',
      automationId: 'automation-1',
      automationName: 'Nightly check',
      status: 'running',
      startedAt: '2026-04-19T12:00:00.000Z',
      summary: 'Running...',
    });

    const runs = await store.loadRuns();
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.finishedAt).toBeTruthy();
  });

  it('persists output truncation metadata on runs', async () => {
    const baseDir = await createTempDir();
    const store = new AutomationStore(baseDir);

    await store.upsertRun({
      id: 'run-2',
      automationId: 'automation-2',
      automationName: 'Large report',
      status: 'completed',
      startedAt: '2026-04-19T12:00:00.000Z',
      finishedAt: '2026-04-19T12:05:00.000Z',
      summary: 'Stored partial output.',
      output: 'partial',
      outputCharacters: 25000,
      outputTruncated: true,
    });

    const runs = await store.loadRuns();
    expect(runs[0]?.outputCharacters).toBe(25000);
    expect(runs[0]?.outputTruncated).toBe(true);
  });
});
