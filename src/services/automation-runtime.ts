import type { AutomationEvent, CreateAutomationInput, UpdateAutomationInput } from '../../shared/contracts';
import {
  createAutomation,
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  onAutomationEvent,
  runAutomation,
  updateAutomation,
} from './electron-api';
import { useAppStore } from '@/store/app-store';

class AutomationRuntime {
  private unsubscribe: (() => void) | null = null;

  public initialize(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = onAutomationEvent((event) => {
      void this.handleEvent(event);
    });

    void this.refresh();
  }

  public async refresh(): Promise<void> {
    const [automations, runs] = await Promise.all([listAutomations(), listAutomationRuns()]);
    useAppStore.getState().setAutomations(automations);
    useAppStore.getState().setAutomationRuns(runs);
  }

  public async create(input: CreateAutomationInput): Promise<void> {
    await createAutomation(input);
    await this.refresh();
  }

  public async update(input: UpdateAutomationInput): Promise<void> {
    await updateAutomation(input);
    await this.refresh();
  }

  public async delete(automationId: string): Promise<void> {
    await deleteAutomation(automationId);
    await this.refresh();
  }

  public async run(automationId: string): Promise<void> {
    await runAutomation(automationId);
    await this.refresh();
  }

  private async handleEvent(_event: AutomationEvent): Promise<void> {
    await this.refresh();
  }
}

export const automationRuntime = new AutomationRuntime();
