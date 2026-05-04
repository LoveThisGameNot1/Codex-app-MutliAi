import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateProjectMemoryInput,
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
  UpdateProjectMemoryInput,
  UpdateWorkspaceInstructionsInput,
  WorkspaceInstructionsRecord,
} from '../shared/contracts';

const MAX_MEMORY_ITEMS_PER_WORKSPACE = 80;
const MAX_MEMORY_CONTENT_LENGTH = 12_000;
const MAX_INSTRUCTIONS_LENGTH = 20_000;
const MAX_TAGS = 8;

type WorkspaceMemoryState = {
  instructions: WorkspaceInstructionsRecord;
  memories: ProjectMemoryRecord[];
};

type ProjectMemoryState = {
  version: 1;
  workspaces: Record<string, WorkspaceMemoryState>;
};

const nowIso = (): string => new Date().toISOString();
const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const clampText = (value: string, maxLength: number): string => {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength).trimEnd();
};

const normalizeWorkspaceKey = (workspaceRoot: string): string => path.resolve(workspaceRoot);

const normalizeTags = (tags: string[] | undefined): string[] =>
  [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS);

const emptyInstructions = (workspaceRoot: string): WorkspaceInstructionsRecord => ({
  workspaceRoot,
  content: '',
  updatedAt: nowIso(),
});

const defaultState = (): ProjectMemoryState => ({
  version: 1,
  workspaces: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortMemories = (memories: ProjectMemoryRecord[]): ProjectMemoryRecord[] =>
  [...memories].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

export class ProjectMemoryService {
  private readonly filePath: string;
  private readonly workspaceRoot: string;

  public constructor(baseDir: string, workspaceRoot: string) {
    this.filePath = path.join(baseDir, 'project-memory.json');
    this.workspaceRoot = normalizeWorkspaceKey(workspaceRoot);
  }

  public async getSnapshot(): Promise<ProjectMemorySnapshot> {
    const workspace = await this.loadWorkspace();
    return {
      workspaceRoot: this.workspaceRoot,
      instructions: workspace.instructions,
      memories: sortMemories(workspace.memories),
    };
  }

  public async getPromptContext(): Promise<ProjectMemorySnapshot> {
    return this.getSnapshot();
  }

  public async createMemory(input: CreateProjectMemoryInput): Promise<ProjectMemoryRecord> {
    const title = clampText(input.title, 160);
    const content = clampText(input.content, MAX_MEMORY_CONTENT_LENGTH);
    if (!title) {
      throw new Error('Project memory title cannot be empty.');
    }
    if (!content) {
      throw new Error('Project memory content cannot be empty.');
    }

    const state = await this.loadState();
    const workspace = this.ensureWorkspace(state);
    const timestamp = nowIso();
    const record: ProjectMemoryRecord = {
      id: createId(),
      workspaceRoot: this.workspaceRoot,
      title,
      content,
      tags: normalizeTags(input.tags),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    workspace.memories = sortMemories([record, ...workspace.memories]).slice(0, MAX_MEMORY_ITEMS_PER_WORKSPACE);
    await this.writeState(state);
    return record;
  }

  public async updateMemory(input: UpdateProjectMemoryInput): Promise<ProjectMemoryRecord> {
    const state = await this.loadState();
    const workspace = this.ensureWorkspace(state);
    const current = workspace.memories.find((memory) => memory.id === input.id);
    if (!current) {
      throw new Error('Project memory not found.');
    }

    const title = input.title !== undefined ? clampText(input.title, 160) : current.title;
    const content = input.content !== undefined ? clampText(input.content, MAX_MEMORY_CONTENT_LENGTH) : current.content;
    if (!title) {
      throw new Error('Project memory title cannot be empty.');
    }
    if (!content) {
      throw new Error('Project memory content cannot be empty.');
    }

    const updated: ProjectMemoryRecord = {
      ...current,
      title,
      content,
      tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      updatedAt: nowIso(),
    };

    workspace.memories = sortMemories(workspace.memories.map((memory) => (memory.id === input.id ? updated : memory)));
    await this.writeState(state);
    return updated;
  }

  public async deleteMemory(memoryId: string): Promise<void> {
    const state = await this.loadState();
    const workspace = this.ensureWorkspace(state);
    workspace.memories = workspace.memories.filter((memory) => memory.id !== memoryId);
    await this.writeState(state);
  }

  public async updateInstructions(input: UpdateWorkspaceInstructionsInput): Promise<WorkspaceInstructionsRecord> {
    const state = await this.loadState();
    const workspace = this.ensureWorkspace(state);
    workspace.instructions = {
      workspaceRoot: this.workspaceRoot,
      content: clampText(input.content, MAX_INSTRUCTIONS_LENGTH),
      updatedAt: nowIso(),
    };
    await this.writeState(state);
    return workspace.instructions;
  }

  private async loadWorkspace(): Promise<WorkspaceMemoryState> {
    const state = await this.loadState();
    return this.ensureWorkspace(state);
  }

  private ensureWorkspace(state: ProjectMemoryState): WorkspaceMemoryState {
    state.workspaces[this.workspaceRoot] ??= {
      instructions: emptyInstructions(this.workspaceRoot),
      memories: [],
    };

    return state.workspaces[this.workspaceRoot];
  }

  private async loadState(): Promise<ProjectMemoryState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.workspaces)) {
        return defaultState();
      }

      const state = defaultState();
      for (const [workspaceRoot, rawWorkspace] of Object.entries(parsed.workspaces)) {
        if (!isRecord(rawWorkspace)) {
          continue;
        }

        const normalizedRoot = normalizeWorkspaceKey(workspaceRoot);
        const rawInstructions = isRecord(rawWorkspace.instructions) ? rawWorkspace.instructions : {};
        const instructions: WorkspaceInstructionsRecord = {
          workspaceRoot: normalizedRoot,
          content: typeof rawInstructions.content === 'string' ? clampText(rawInstructions.content, MAX_INSTRUCTIONS_LENGTH) : '',
          updatedAt: typeof rawInstructions.updatedAt === 'string' ? rawInstructions.updatedAt : nowIso(),
        };
        const memories = Array.isArray(rawWorkspace.memories)
          ? rawWorkspace.memories
              .filter(isRecord)
              .map((memory): ProjectMemoryRecord | null => {
                const id = typeof memory.id === 'string' ? memory.id : '';
                const title = typeof memory.title === 'string' ? clampText(memory.title, 160) : '';
                const content = typeof memory.content === 'string' ? clampText(memory.content, MAX_MEMORY_CONTENT_LENGTH) : '';
                if (!id || !title || !content) {
                  return null;
                }
                return {
                  id,
                  workspaceRoot: normalizedRoot,
                  title,
                  content,
                  tags: Array.isArray(memory.tags) ? normalizeTags(memory.tags.filter((tag): tag is string => typeof tag === 'string')) : [],
                  createdAt: typeof memory.createdAt === 'string' ? memory.createdAt : nowIso(),
                  updatedAt: typeof memory.updatedAt === 'string' ? memory.updatedAt : nowIso(),
                };
              })
              .filter((memory): memory is ProjectMemoryRecord => memory !== null)
          : [];

        state.workspaces[normalizedRoot] = {
          instructions,
          memories: sortMemories(memories).slice(0, MAX_MEMORY_ITEMS_PER_WORKSPACE),
        };
      }

      return state;
    } catch {
      return defaultState();
    }
  }

  private async writeState(state: ProjectMemoryState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
