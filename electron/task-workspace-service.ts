import fs from 'node:fs/promises';
import path from 'node:path';
import type { CreateSafeTaskCloneInput, TaskCloneResult } from '../shared/contracts';

const EXCLUDED_NAMES = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'coverage']);

const nowIso = (): string => new Date().toISOString();

const sanitizeTaskId = (taskId: string): string => taskId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80) || 'task';

const isWithinRoot = (candidatePath: string, rootPath: string): boolean => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export class TaskWorkspaceService {
  public constructor(
    private readonly workspaceRoot: string,
    private readonly clonesRoot: string,
  ) {}

  public async createSafeClone(input: CreateSafeTaskCloneInput): Promise<TaskCloneResult> {
    const sourcePath = await this.resolveSourcePath(input.sourcePath);
    const sourceStats = await fs.stat(sourcePath);
    if (!sourceStats.isDirectory()) {
      throw new Error(`Safe clones require a directory source: ${sourcePath}`);
    }

    await fs.mkdir(this.clonesRoot, { recursive: true });
    const clonePath = path.join(this.clonesRoot, `${sanitizeTaskId(input.taskId)}-${Date.now()}`);
    await fs.cp(sourcePath, clonePath, {
      recursive: true,
      force: true,
      filter: (entryPath) => this.shouldIncludeEntry(sourcePath, entryPath),
    });
    await fs.writeFile(
      path.join(clonePath, '.codexapp-clone.json'),
      JSON.stringify(
        {
          taskId: input.taskId,
          sourcePath,
          createdAt: nowIso(),
        },
        null,
        2,
      ),
      'utf8',
    );

    return {
      clonePath,
      sourcePath,
      createdAt: nowIso(),
    };
  }

  public async discardSafeClone(clonePath: string): Promise<void> {
    const normalizedClonePath = path.normalize(clonePath);
    const normalizedClonesRoot = path.normalize(this.clonesRoot);
    if (!isWithinRoot(normalizedClonePath, normalizedClonesRoot)) {
      throw new Error(`Refusing to delete unmanaged clone path: ${clonePath}`);
    }

    await fs.rm(normalizedClonePath, { recursive: true, force: true });
  }

  private async resolveSourcePath(sourcePath?: string | null): Promise<string> {
    const trimmed = sourcePath?.trim();
    const candidatePath = trimmed
      ? path.isAbsolute(trimmed)
        ? path.normalize(trimmed)
        : path.resolve(this.workspaceRoot, trimmed)
      : path.normalize(this.workspaceRoot);

    const normalizedWorkspaceRoot = path.normalize(await fs.realpath(this.workspaceRoot).catch(() => this.workspaceRoot));
    const normalizedCandidatePath = path.normalize(await fs.realpath(candidatePath).catch(() => candidatePath));

    if (!isWithinRoot(normalizedCandidatePath, normalizedWorkspaceRoot)) {
      throw new Error(`Safe clones must stay inside the workspace root: ${normalizedCandidatePath}`);
    }

    return normalizedCandidatePath;
  }

  private shouldIncludeEntry(sourcePath: string, entryPath: string): boolean {
    if (path.normalize(entryPath) === path.normalize(sourcePath)) {
      return true;
    }

    return !EXCLUDED_NAMES.has(path.basename(entryPath));
  }
}
