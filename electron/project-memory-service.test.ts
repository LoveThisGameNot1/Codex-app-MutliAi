import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectMemoryService } from './project-memory-service';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-project-memory-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ProjectMemoryService', () => {
  it('stores instructions and project memory separately from sessions', async () => {
    const baseDir = await createTempDir();
    const service = new ProjectMemoryService(baseDir, 'C:/workspace/app');

    const instructions = await service.updateInstructions({
      content: 'Always run npm run test before packaging.',
    });
    const memory = await service.createMemory({
      title: 'Packaging preference',
      content: 'The user expects npm run dist after major Electron changes.',
      tags: ['Release', 'electron', 'release'],
    });
    const snapshot = await service.getSnapshot();

    expect(instructions.content).toBe('Always run npm run test before packaging.');
    expect(memory.tags).toEqual(['release', 'electron']);
    expect(snapshot.instructions.content).toContain('npm run test');
    expect(snapshot.memories).toHaveLength(1);
    expect(snapshot.memories[0]?.title).toBe('Packaging preference');
  });

  it('updates and deletes memories inside the active workspace', async () => {
    const service = new ProjectMemoryService(await createTempDir(), 'C:/workspace/app');
    const memory = await service.createMemory({
      title: 'Old title',
      content: 'Old content',
    });

    const updated = await service.updateMemory({
      id: memory.id,
      title: 'New title',
      content: 'New content',
      tags: ['ux'],
    });
    await service.deleteMemory(memory.id);
    const snapshot = await service.getSnapshot();

    expect(updated.title).toBe('New title');
    expect(updated.content).toBe('New content');
    expect(updated.tags).toEqual(['ux']);
    expect(snapshot.memories).toEqual([]);
  });

  it('keeps memory isolated by workspace root', async () => {
    const baseDir = await createTempDir();
    const left = new ProjectMemoryService(baseDir, 'C:/workspace/left');
    const right = new ProjectMemoryService(baseDir, 'C:/workspace/right');

    await left.createMemory({
      title: 'Left memory',
      content: 'Only left workspace should see this.',
    });

    expect((await left.getSnapshot()).memories).toHaveLength(1);
    expect((await right.getSnapshot()).memories).toHaveLength(0);
  });

  it('imports memory snapshots by merging instructions and remapping records to the active workspace', async () => {
    const service = new ProjectMemoryService(await createTempDir(), 'C:/workspace/app');
    await service.updateInstructions({ content: 'Local instructions stay available.' });

    const result = await service.importSnapshot(
      {
        workspaceRoot: 'D:/old-workspace',
        instructions: {
          workspaceRoot: 'D:/old-workspace',
          content: 'Imported instructions should be appended.',
          updatedAt: '2026-04-19T12:00:00.000Z',
        },
        memories: [
          {
            id: 'memory-1',
            workspaceRoot: 'D:/old-workspace',
            title: 'Imported architecture note',
            content: 'Renderer state is hydrated after continuity import.',
            tags: ['Architecture', 'Import'],
            createdAt: '2026-04-19T12:00:00.000Z',
            updatedAt: '2026-04-19T12:00:00.000Z',
          },
        ],
      },
      'merge',
    );

    const snapshot = await service.getSnapshot();
    expect(result.importedMemories).toBe(1);
    expect(result.instructionsUpdated).toBe(true);
    expect(snapshot.instructions.content).toContain('Local instructions stay available.');
    expect(snapshot.instructions.content).toContain('Imported instructions should be appended.');
    expect(snapshot.memories).toHaveLength(1);
    expect(snapshot.memories[0]?.workspaceRoot).toBe(snapshot.workspaceRoot);
    expect(snapshot.memories[0]?.tags).toEqual(['architecture', 'import']);
  });

  it('can replace memory for the active workspace from an import snapshot', async () => {
    const service = new ProjectMemoryService(await createTempDir(), 'C:/workspace/app');
    await service.updateInstructions({ content: 'Old instructions' });
    await service.createMemory({ title: 'Old memory', content: 'Old content' });

    const result = await service.importSnapshot(
      {
        workspaceRoot: 'D:/old-workspace',
        instructions: {
          workspaceRoot: 'D:/old-workspace',
          content: 'Replacement instructions',
          updatedAt: '2026-04-19T12:00:00.000Z',
        },
        memories: [
          {
            id: 'memory-2',
            workspaceRoot: 'D:/old-workspace',
            title: 'Replacement memory',
            content: 'Replacement content',
            tags: [],
            createdAt: '2026-04-20T12:00:00.000Z',
            updatedAt: '2026-04-20T12:00:00.000Z',
          },
        ],
      },
      'replace',
    );

    const snapshot = await service.getSnapshot();
    expect(result.importedMemories).toBe(1);
    expect(result.totalMemories).toBe(1);
    expect(snapshot.instructions.content).toBe('Replacement instructions');
    expect(snapshot.memories.map((memory) => memory.title)).toEqual(['Replacement memory']);
  });

  it('rejects empty memory records', async () => {
    const service = new ProjectMemoryService(await createTempDir(), 'C:/workspace/app');

    await expect(
      service.createMemory({
        title: '',
        content: 'content',
      }),
    ).rejects.toThrow('Project memory title cannot be empty.');

    await expect(
      service.createMemory({
        title: 'title',
        content: '',
      }),
    ).rejects.toThrow('Project memory content cannot be empty.');
  });
});
