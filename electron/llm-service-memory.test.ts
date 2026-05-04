import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';
import type { ProjectMemorySnapshot } from '../shared/contracts';
import { DEFAULT_TOOL_POLICY } from '../shared/tool-policy';
import { LlmService } from './llm-service';
import { SessionStore } from './session-store';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-llm-memory-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('LlmService project memory prompt context', () => {
  it('injects workspace instructions and project memory into reset prompts', async () => {
    const baseDir = await createTempDir();
    const sessionStore = new SessionStore(baseDir);
    const context: ProjectMemorySnapshot = {
      workspaceRoot: 'C:/workspace/app',
      instructions: {
        workspaceRoot: 'C:/workspace/app',
        content: 'Always run npm run test before committing.',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      memories: [
        {
          id: 'memory-1',
          workspaceRoot: 'C:/workspace/app',
          title: 'Packaging rule',
          content: 'Run npm run dist after Electron main-process changes.',
          tags: ['packaging', 'electron'],
          createdAt: '2026-05-04T00:00:00.000Z',
          updatedAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    };
    const service = new LlmService('C:/workspace/app', sessionStore, async () => context);

    await service.resetSession('session-1', {
      providerId: DEFAULT_PROVIDER_ID,
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_MODEL,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      toolPolicy: DEFAULT_TOOL_POLICY,
    });

    const session = await sessionStore.load('session-1');

    expect(session?.prompt).toContain('Project memory and workspace instructions:');
    expect(session?.prompt).toContain('Always run npm run test before committing.');
    expect(session?.prompt).toContain('Packaging rule [packaging, electron]');
    expect(session?.prompt).toContain('Run npm run dist after Electron main-process changes.');
  });
});
