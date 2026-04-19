import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { executeTerminalTool, readFileTool, writeFileTool } from '../../electron/tool-service';

const tempDirs: string[] = [];

const createWorkspace = async (): Promise<string> => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-'));
  tempDirs.push(workspace);
  return workspace;
};

const removeDirWithRetry = async (dir: string, attempts = 5): Promise<void> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }

      await delay(100 * attempt);
    }
  }
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => removeDirWithRetry(dir)),
  );
});

describe('tool-service', () => {
  it('writes and reads files relative to the workspace root', async () => {
    const workspaceRoot = await createWorkspace();

    await writeFileTool(
      {
        path: 'notes/hello.txt',
        content: 'hello world',
      },
      { workspaceRoot },
    );

    const raw = await readFileTool(
      {
        path: 'notes/hello.txt',
      },
      { workspaceRoot },
    );

    const parsed = JSON.parse(raw) as { path: string; content: string };
    expect(parsed.path).toBe(path.join(workspaceRoot, 'notes', 'hello.txt'));
    expect(parsed.content).toBe('hello world');
  });

  it('truncates large file reads before returning them to the model', async () => {
    const workspaceRoot = await createWorkspace();
    const largeContent = 'a'.repeat(130 * 1024);

    await fs.mkdir(path.join(workspaceRoot, 'logs'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'logs', 'large.txt'), largeContent, 'utf8');

    const raw = await readFileTool(
      {
        path: 'logs/large.txt',
      },
      { workspaceRoot },
    );

    const parsed = JSON.parse(raw) as { content: string };
    expect(parsed.content.length).toBeLessThan(largeContent.length);
    expect(parsed.content).toContain('[truncated ');
  });

  it('returns a cancelled result when a terminal command is aborted', async () => {
    const workspaceRoot = await createWorkspace();
    const controller = new AbortController();
    const promise = executeTerminalTool(
      {
        command: process.platform === 'win32' ? 'Start-Sleep -Seconds 5' : 'sleep 5',
      },
      {
        workspaceRoot,
        signal: controller.signal,
      },
    );

    controller.abort();
    const raw = await promise;
    const parsed = JSON.parse(raw) as { exitCode: number; stderr: string };

    expect(parsed.exitCode).toBe(130);
    expect(parsed.stderr).toContain('cancelled');
  });
});
