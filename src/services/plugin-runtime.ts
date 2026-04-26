import type { PluginRecord, UpdatePluginStateInput } from '../../shared/contracts';
import { listPlugins, updatePluginState } from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';

class PluginRuntime {
  public async refreshPlugins(): Promise<PluginRecord[]> {
    try {
      const plugins = await listPlugins();
      useAppStore.getState().setPlugins(plugins);
      return plugins;
    } catch {
      useAppStore.getState().setPlugins([]);
      return [];
    }
  }

  public async updatePluginState(input: UpdatePluginStateInput): Promise<PluginRecord> {
    const updated = await updatePluginState(input);
    await this.refreshPlugins();
    return updated;
  }
}

export const pluginRuntime = new PluginRuntime();
