import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTerminalTool, readFileTool, writeFileTool } from '../../electron/tool-service';
import { DEFAULT_TOOL_POLICY } from '../../shared/tool-policy';

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

    const canonicalWorkspaceRoot = await fs.realpath(workspaceRoot);
    const expectedPath = path.join(canonicalWorkspaceRoot, 'notes', 'hello.txt');
    const parsed = JSON.parse(raw) as { path: string; requestedPath: string; content: string };
    expect(parsed.requestedPath).toBe(expectedPath);
    expect(parsed.path).toBe(await fs.realpath(expectedPath));
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

  it('blocks terminal execution outside the workspace when policy requires approval', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);

    await expect(
      executeTerminalTool(
        {
          command: process.platform === 'win32' ? 'Write-Output hello' : 'echo hello',
          cwd: outsideDir,
        },
        {
          workspaceRoot,
          toolPolicy: DEFAULT_TOOL_POLICY,
        },
      ),
    ).rejects.toThrow('Approval required by tool policy');
  });

  it('blocks reading files through a workspace junction that resolves outside the project', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const linkedDir = path.join(workspaceRoot, 'linked-outside');

    await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'outside secret', 'utf8');
    await fs.symlink(outsideDir, linkedDir, 'junction');

    await expect(
      readFileTool(
        {
          path: 'linked-outside/secret.txt',
        },
        {
          workspaceRoot,
          toolPolicy: DEFAULT_TOOL_POLICY,
        },
      ),
    ).rejects.toThrow('Approval required by tool policy');
  });

  it('blocks writing files through a workspace junction that resolves outside the project', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const linkedDir = path.join(workspaceRoot, 'linked-outside');

    await fs.symlink(outsideDir, linkedDir, 'junction');

    await expect(
      writeFileTool(
        {
          path: 'linked-outside/created.txt',
          content: 'should be blocked',
        },
        {
          workspaceRoot,
          toolPolicy: DEFAULT_TOOL_POLICY,
        },
      ),
    ).rejects.toThrow('Approval required by tool policy');
  });

  it('blocks terminal execution from a workspace junction that resolves outside the project', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const linkedDir = path.join(workspaceRoot, 'linked-outside');

    await fs.symlink(outsideDir, linkedDir, 'junction');

    await expect(
      executeTerminalTool(
        {
          command: process.platform === 'win32' ? 'Write-Output hello' : 'echo hello',
          cwd: 'linked-outside',
        },
        {
          workspaceRoot,
          toolPolicy: DEFAULT_TOOL_POLICY,
        },
      ),
    ).rejects.toThrow('Approval required by tool policy');
  });

  it('keeps the original file intact and cleans up temp files when atomic rename fails', async () => {
    const workspaceRoot = await createWorkspace();
    const targetPath = path.join(workspaceRoot, 'notes', 'atomic.txt');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, 'original', 'utf8');

    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async () => {
      throw Object.assign(new Error('rename failed'), { code: 'EPERM' });
    });

    try {
      await expect(
        writeFileTool(
          {
            path: 'notes/atomic.txt',
            content: 'updated',
          },
          { workspaceRoot },
        ),
      ).rejects.toThrow('rename failed');
    } finally {
      renameSpy.mockRestore();
    }

    expect(await fs.readFile(targetPath, 'utf8')).toBe('original');
    const directoryEntries = await fs.readdir(path.dirname(targetPath));
    expect(directoryEntries.some((entry) => entry.startsWith('.codexapp-write-'))).toBe(false);
  });

  it('allows a one-time approved read outside the workspace', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const outsideFile = path.join(outsideDir, 'allowed.txt');
    const requestApproval = vi.fn().mockResolvedValue({ approved: true as const, scope: 'once' as const });

    await fs.writeFile(outsideFile, 'approved read', 'utf8');

    const raw = await readFileTool(
      { path: outsideFile },
      {
        workspaceRoot,
        toolPolicy: DEFAULT_TOOL_POLICY,
        approvalState: {
          grantedPolicies: new Set(),
        },
        requestApproval,
      },
    );

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(JSON.parse(raw)).toMatchObject({
      content: 'approved read',
    });
  });

  it('reuses request-scope approval for repeated outside-workspace reads in the same run', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const approvalState = {
      grantedPolicies: new Set<keyof typeof DEFAULT_TOOL_POLICY>(),
    };
    const requestApproval = vi.fn().mockResolvedValue({ approved: true as const, scope: 'request' as const });

    await fs.writeFile(path.join(outsideDir, 'first.txt'), 'first', 'utf8');
    await fs.writeFile(path.join(outsideDir, 'second.txt'), 'second', 'utf8');

    await readFileTool(
      { path: path.join(outsideDir, 'first.txt') },
      {
        workspaceRoot,
        toolPolicy: DEFAULT_TOOL_POLICY,
        approvalState,
        requestApproval,
      },
    );

    await readFileTool(
      { path: path.join(outsideDir, 'second.txt') },
      {
        workspaceRoot,
        toolPolicy: DEFAULT_TOOL_POLICY,
        approvalState,
        requestApproval,
      },
    );

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(approvalState.grantedPolicies.has('outsideWorkspaceReads')).toBe(true);
  });

  it('surfaces a clear error when the user rejects an approval request', async () => {
    const workspaceRoot = await createWorkspace();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-tools-outside-'));
    tempDirs.push(outsideDir);
    const requestApproval = vi.fn().mockResolvedValue({ approved: false as const });

    await expect(
      writeFileTool(
        {
          path: path.join(outsideDir, 'rejected.txt'),
          content: 'denied',
        },
        {
          workspaceRoot,
          toolPolicy: DEFAULT_TOOL_POLICY,
          approvalState: {
            grantedPolicies: new Set(),
          },
          requestApproval,
        },
      ),
    ).rejects.toThrow('Tool approval was rejected by the user');

    await expect(fs.access(path.join(outsideDir, 'rejected.txt'))).rejects.toThrow();
  });
});
