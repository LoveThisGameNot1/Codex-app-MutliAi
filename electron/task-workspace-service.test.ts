import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskWorkspaceService } from './task-workspace-service';

const tempDirs: string[] = [];

const createTempDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('TaskWorkspaceService', () => {
  it('creates safe clones without copying excluded heavy directories', async () => {
    const workspaceRoot = await createTempDir('codexapp-clone-workspace-');
    const clonesRoot = await createTempDir('codexapp-clone-targets-');
    await fs.writeFile(path.join(workspaceRoot, 'README.md'), '# demo', 'utf8');
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'index.ts'), 'export const value = 1;', 'utf8');
    await fs.mkdir(path.join(workspaceRoot, 'node_modules', 'demo'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'node_modules', 'demo', 'index.js'), 'module.exports = {};', 'utf8');

    const service = new TaskWorkspaceService(workspaceRoot, clonesRoot);
    const result = await service.createSafeClone({
      taskId: 'task-safe-clone',
      sourcePath: null,
    });

    expect(path.normalize(result.sourcePath).toLowerCase()).toBe(path.normalize(await fs.realpath(workspaceRoot)).toLowerCase());
    await expect(fs.readFile(path.join(result.clonePath, 'README.md'), 'utf8')).resolves.toContain('# demo');
    await expect(fs.readFile(path.join(result.clonePath, 'src', 'index.ts'), 'utf8')).resolves.toContain('value = 1');
    await expect(fs.stat(path.join(result.clonePath, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects clone sources outside the workspace root', async () => {
    const workspaceRoot = await createTempDir('codexapp-clone-workspace-');
    const clonesRoot = await createTempDir('codexapp-clone-targets-');
    const outsideDir = await createTempDir('codexapp-clone-outside-');
    const service = new TaskWorkspaceService(workspaceRoot, clonesRoot);

    await expect(
      service.createSafeClone({
        taskId: 'task-outside',
        sourcePath: outsideDir,
      }),
    ).rejects.toThrow(/inside the workspace root/i);
  });

  it('discards managed clone directories', async () => {
    const workspaceRoot = await createTempDir('codexapp-clone-workspace-');
    const clonesRoot = await createTempDir('codexapp-clone-targets-');
    await fs.writeFile(path.join(workspaceRoot, 'index.ts'), 'export {};', 'utf8');
    const service = new TaskWorkspaceService(workspaceRoot, clonesRoot);
    const result = await service.createSafeClone({
      taskId: 'task-delete',
      sourcePath: null,
    });

    await service.discardSafeClone(result.clonePath);
    await expect(fs.stat(result.clonePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
