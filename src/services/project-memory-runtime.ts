import type {
  CreateProjectMemoryInput,
  UpdateProjectMemoryInput,
  UpdateWorkspaceInstructionsInput,
} from '../../shared/contracts';
import {
  createProjectMemory,
  deleteProjectMemory,
  getProjectMemorySnapshot,
  updateProjectMemory,
  updateWorkspaceInstructions,
} from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';

class ProjectMemoryRuntime {
  public initialize(): void {
    void this.refresh();
  }

  public async refresh(): Promise<void> {
    const snapshot = await getProjectMemorySnapshot();
    useAppStore.getState().hydrateProjectMemory(snapshot);
  }

  public async create(input: CreateProjectMemoryInput): Promise<void> {
    await createProjectMemory(input);
    await this.refresh();
  }

  public async update(input: UpdateProjectMemoryInput): Promise<void> {
    await updateProjectMemory(input);
    await this.refresh();
  }

  public async delete(memoryId: string): Promise<void> {
    await deleteProjectMemory(memoryId);
    await this.refresh();
  }

  public async updateInstructions(input: UpdateWorkspaceInstructionsInput): Promise<void> {
    await updateWorkspaceInstructions(input);
    await this.refresh();
  }
}

export const projectMemoryRuntime = new ProjectMemoryRuntime();
