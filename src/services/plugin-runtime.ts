import type {
  CheckMcpConnectorInput,
  McpConnectorCheckResult,
  McpConnectorRecord,
  PluginRecord,
  UpdatePluginStateInput,
} from '../../shared/contracts';
import { checkMcpConnector, listMcpConnectors, listPlugins, updatePluginState } from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';

class PluginRuntime {
  public async refreshPlugins(): Promise<PluginRecord[]> {
    try {
      const [plugins, mcpConnectors] = await Promise.all([listPlugins(), listMcpConnectors()]);
      useAppStore.getState().setPlugins(plugins);
      useAppStore.getState().setMcpConnectors(mcpConnectors);
      return plugins;
    } catch {
      useAppStore.getState().setPlugins([]);
      useAppStore.getState().setMcpConnectors([]);
      return [];
    }
  }

  public async refreshMcpConnectors(): Promise<McpConnectorRecord[]> {
    try {
      const mcpConnectors = await listMcpConnectors();
      useAppStore.getState().setMcpConnectors(mcpConnectors);
      return mcpConnectors;
    } catch {
      useAppStore.getState().setMcpConnectors([]);
      return [];
    }
  }

  public async checkMcpConnector(input: CheckMcpConnectorInput): Promise<McpConnectorCheckResult> {
    return checkMcpConnector(input);
  }

  public async updatePluginState(input: UpdatePluginStateInput): Promise<PluginRecord> {
    const updated = await updatePluginState(input);
    await this.refreshPlugins();
    return updated;
  }
}

export const pluginRuntime = new PluginRuntime();
