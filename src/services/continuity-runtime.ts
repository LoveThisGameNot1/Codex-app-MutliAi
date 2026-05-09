import type {
  ContinuityExportResult,
  ContinuityImportInput,
  ContinuityImportResult,
} from '../../shared/contracts';
import {
  exportContinuityData,
  getProjectMemorySnapshot,
  importContinuityData,
  listSessions,
} from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';

class ContinuityRuntime {
  public async exportData(): Promise<ContinuityExportResult | null> {
    return exportContinuityData();
  }

  public async importData(input: ContinuityImportInput): Promise<ContinuityImportResult | null> {
    const result = await importContinuityData(input);
    if (!result) {
      return null;
    }

    const [sessions, memory] = await Promise.all([listSessions(), getProjectMemorySnapshot()]);
    const state = useAppStore.getState();
    state.setPersistedSessions(sessions);
    state.hydrateProjectMemory(memory);
    return result;
  }
}

export const continuityRuntime = new ContinuityRuntime();
