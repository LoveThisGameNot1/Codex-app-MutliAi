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
