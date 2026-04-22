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

  it('keeps clone file edits isolated from the live workspace', async () => {
    const workspaceRoot = await createTempDir('codexapp-clone-workspace-');
    const clonesRoot = await createTempDir('codexapp-clone-targets-');
    const sourceFile = path.join(workspaceRoot, 'src', 'isolated.ts');
    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.writeFile(sourceFile, 'export const mode = "live";', 'utf8');

    const service = new TaskWorkspaceService(workspaceRoot, clonesRoot);
    const result = await service.createSafeClone({
      taskId: 'task-isolation',
      sourcePath: null,
    });

    const cloneFile = path.join(result.clonePath, 'src', 'isolated.ts');
    await fs.writeFile(cloneFile, 'export const mode = "clone";', 'utf8');

    await expect(fs.readFile(cloneFile, 'utf8')).resolves.toContain('"clone"');
    await expect(fs.readFile(sourceFile, 'utf8')).resolves.toContain('"live"');
  });

  it('prunes expired clones and retains only the freshest recent clones', async () => {
    const workspaceRoot = await createTempDir('codexapp-clone-workspace-');
    const clonesRoot = await createTempDir('codexapp-clone-targets-');
    await fs.writeFile(path.join(workspaceRoot, 'index.ts'), 'export {};', 'utf8');
    const service = new TaskWorkspaceService(workspaceRoot, clonesRoot);

    const now = Date.parse('2026-04-22T12:00:00.000Z');
    for (let index = 0; index < 10; index += 1) {
      const clone = await service.createSafeClone({
        taskId: `task-${index}`,
        sourcePath: null,
      });
      await fs.writeFile(
        path.join(clone.clonePath, '.codexapp-clone.json'),
        JSON.stringify(
          {
            taskId: `task-${index}`,
            sourcePath: workspaceRoot,
            createdAt: new Date(now - index * 60_000).toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
    }

    const staleClone = await service.createSafeClone({
      taskId: 'task-stale',
      sourcePath: null,
    });
    await fs.writeFile(
      path.join(staleClone.clonePath, '.codexapp-clone.json'),
      JSON.stringify(
        {
          taskId: 'task-stale',
          sourcePath: workspaceRoot,
          createdAt: '2026-04-10T12:00:00.000Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    await service.pruneStaleClones(now);

    const remainingEntries = await fs.readdir(clonesRoot, { withFileTypes: true });
    const remainingDirectories = remainingEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    expect(remainingDirectories).toHaveLength(8);
    expect(remainingDirectories.some((entry) => entry.includes('task-stale'))).toBe(false);
    expect(remainingDirectories.some((entry) => entry.includes('task-9'))).toBe(false);
    expect(remainingDirectories.some((entry) => entry.includes('task-0'))).toBe(true);
  });
});
