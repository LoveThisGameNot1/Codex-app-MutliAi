import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  McpConnectorManifest,
  McpConnectorRecord,
  McpConnectorTransport,
  PluginCapability,
  PluginCapabilityKind,
  PluginManifest,
  PluginPermissionKey,
  PluginRecord,
  UpdatePluginStateInput,
} from '../shared/contracts';

const MANIFEST_FILE = 'plugin.json';
const STATE_FILE = 'plugin-state.json';
const VALID_CAPABILITY_KINDS = new Set<PluginCapabilityKind>(['tool', 'mcp', 'skill', 'automation', 'workflow']);
const VALID_MCP_TRANSPORTS = new Set<McpConnectorTransport>(['stdio', 'http', 'sse']);
const VALID_PERMISSIONS = new Set<PluginPermissionKey>([
  'readWorkspace',
  'writeWorkspace',
  'executeCommands',
  'networkAccess',
  'storeSecrets',
]);

type PersistedPluginState = {
  enabled: Record<string, boolean>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const normalizeCapabilities = (value: unknown): PluginCapability[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((capability) => ({
      kind: String(capability.kind || '') as PluginCapabilityKind,
      name: String(capability.name || '').trim(),
      description: String(capability.description || '').trim(),
    }))
    .filter((capability) => VALID_CAPABILITY_KINDS.has(capability.kind) && capability.name.length > 0);
};

const normalizePermissions = (value: unknown): PluginPermissionKey[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(String).filter((permission): permission is PluginPermissionKey =>
    VALID_PERMISSIONS.has(permission as PluginPermissionKey),
  ))];
};

const normalizeStringArray = (value: unknown, fieldName: string): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
};

const normalizeStringRecord = (value: unknown, fieldName: string): Record<string, string> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object with string values.`);
  }

  const entries = Object.entries(value).map(([key, item]) => {
    if (typeof item !== 'string') {
      throw new Error(`${fieldName} must be an object with string values.`);
    }
    return [key.trim(), item] as const;
  }).filter(([key]) => key.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const assertHttpUrl = (url: string, connectorId: string): void => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol.');
    }
  } catch {
    throw new Error(`MCP connector ${connectorId} needs a valid http or https url.`);
  }
};

const normalizeMcpConnectors = (value: unknown): McpConnectorManifest[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('mcpConnectors must be an array.');
  }

  const seenIds = new Set<string>();

  return value.map((connector, index) => {
    if (!isRecord(connector)) {
      throw new Error(`MCP connector at index ${index} must be an object.`);
    }

    const id = String(connector.id || '').trim();
    const name = String(connector.name || '').trim();
    const description = String(connector.description || '').trim();
    const transport = String(connector.transport || '').trim() as McpConnectorTransport;
    const command = typeof connector.command === 'string' ? connector.command.trim() : undefined;
    const url = typeof connector.url === 'string' ? connector.url.trim() : undefined;
    const timeoutMs =
      typeof connector.timeoutMs === 'number' && Number.isFinite(connector.timeoutMs)
        ? Math.min(Math.max(Math.round(connector.timeoutMs), 1000), 30000)
        : undefined;

    if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
      throw new Error(`MCP connector at index ${index} needs a valid id.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`MCP connector ${id} is duplicated.`);
    }
    seenIds.add(id);
    if (!name) {
      throw new Error(`MCP connector ${id} needs a name.`);
    }
    if (!description) {
      throw new Error(`MCP connector ${id} needs a description.`);
    }
    if (!VALID_MCP_TRANSPORTS.has(transport)) {
      throw new Error(`MCP connector ${id} needs a valid transport.`);
    }
    if (transport === 'stdio' && !command) {
      throw new Error(`MCP connector ${id} with stdio transport needs a command.`);
    }
    if ((transport === 'http' || transport === 'sse') && !url) {
      throw new Error(`MCP connector ${id} with ${transport} transport needs a url.`);
    }
    if (url) {
      assertHttpUrl(url, id);
    }

    const args = normalizeStringArray(connector.args, `MCP connector ${id} args`);
    const env = normalizeStringRecord(connector.env, `MCP connector ${id} env`);
    const headers = normalizeStringRecord(connector.headers, `MCP connector ${id} headers`);

    return {
      id,
      name,
      description,
      transport,
      ...(command ? { command } : {}),
      ...(args.length > 0 ? { args } : {}),
      ...(url ? { url } : {}),
      ...(env ? { env } : {}),
      ...(headers ? { headers } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    };
  });
};

export const parsePluginManifest = (input: unknown): PluginManifest => {
  if (!isRecord(input)) {
    throw new Error('Plugin manifest must be an object.');
  }

  const id = String(input.id || '').trim();
  const name = String(input.name || '').trim();
  const version = String(input.version || '').trim();
  const description = String(input.description || '').trim();
  const capabilities = normalizeCapabilities(input.capabilities);
  const permissions = normalizePermissions(input.permissions);
  const mcpConnectors = normalizeMcpConnectors(input.mcpConnectors);

  if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error('Plugin manifest needs a valid id.');
  }
  if (!name) {
    throw new Error('Plugin manifest needs a name.');
  }
  if (!version) {
    throw new Error('Plugin manifest needs a version.');
  }
  if (!description) {
    throw new Error('Plugin manifest needs a description.');
  }

  return {
    id,
    name,
    version,
    description,
    author: typeof input.author === 'string' ? input.author.trim() || undefined : undefined,
    capabilities,
    permissions,
    mcpConnectors,
    entrypoint: typeof input.entrypoint === 'string' ? input.entrypoint.trim() || undefined : undefined,
  };
};

export class PluginService {
  private readonly pluginRoot: string;
  private readonly statePath: string;

  public constructor(
    private readonly workspaceRoot: string,
    userDataPath: string,
  ) {
    this.pluginRoot = path.join(workspaceRoot, 'plugins');
    this.statePath = path.join(userDataPath, STATE_FILE);
  }

  public async listPlugins(): Promise<PluginRecord[]> {
    const state = await this.loadState();
    const manifestDirectories = await this.getManifestDirectories();
    const plugins = await Promise.all(manifestDirectories.map((directory) => this.loadPlugin(directory, state)));

    return plugins.sort((left, right) => left.name.localeCompare(right.name));
  }

  public async listMcpConnectors(): Promise<McpConnectorRecord[]> {
    const plugins = await this.listPlugins();

    return plugins
      .flatMap((plugin) =>
        plugin.mcpConnectors.map((connector) => {
          const status =
            plugin.status === 'invalid'
              ? 'invalid'
              : plugin.enabled
                ? 'ready'
                : 'disabled';

          return {
            ...connector,
            pluginId: plugin.id,
            pluginName: plugin.name,
            pluginSourcePath: plugin.sourcePath,
            pluginEnabled: plugin.enabled,
            pluginPermissions: plugin.permissions,
            status,
            statusDetail:
              status === 'ready'
                ? 'Connector is ready for a permission-gated health check.'
                : status === 'disabled'
                  ? 'Enable the plugin before this connector can be used.'
                  : plugin.statusDetail,
          } satisfies McpConnectorRecord;
        }),
      )
      .sort((left, right) => `${left.pluginName}:${left.name}`.localeCompare(`${right.pluginName}:${right.name}`));
  }

  public async updatePluginState(input: UpdatePluginStateInput): Promise<PluginRecord> {
    const plugins = await this.listPlugins();
    const plugin = plugins.find((candidate) => candidate.id === input.id);
    if (!plugin) {
      throw new Error(`Plugin ${input.id} was not found.`);
    }
    if (plugin.status === 'invalid') {
      throw new Error(`Plugin ${input.id} is invalid and cannot be enabled.`);
    }

    const state = await this.loadState();
    state.enabled[input.id] = input.enabled;
    await this.saveState(state);

    return {
      ...plugin,
      enabled: input.enabled,
      status: input.enabled ? 'enabled' : 'disabled',
      statusDetail: input.enabled ? 'Plugin is enabled.' : 'Plugin is disabled.',
    };
  }

  private async loadState(): Promise<PersistedPluginState> {
    const parsed = await readJson<PersistedPluginState>(this.statePath, { enabled: {} });
    return {
      enabled: isRecord(parsed.enabled) ? Object.fromEntries(Object.entries(parsed.enabled).map(([id, enabled]) => [id, Boolean(enabled)])) : {},
    };
  }

  private async saveState(state: PersistedPluginState): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private async getManifestDirectories(): Promise<string[]> {
    try {
      const entries = await readdir(this.pluginRoot, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(this.pluginRoot, entry.name));
    } catch {
      return [];
    }
  }

  private async loadPlugin(directory: string, state: PersistedPluginState): Promise<PluginRecord> {
    const sourcePath = path.join(directory, MANIFEST_FILE);
    try {
      const manifest = parsePluginManifest(JSON.parse(await readFile(sourcePath, 'utf8')));
      const enabled = Boolean(state.enabled[manifest.id]);

      return {
        ...manifest,
        sourcePath,
        enabled,
        status: enabled ? 'enabled' : 'disabled',
        statusDetail: enabled ? 'Plugin is enabled.' : 'Plugin is disabled.',
      };
    } catch (error) {
      const directoryName = path.basename(directory);
      return {
        id: directoryName,
        name: directoryName,
        version: '0.0.0',
        description: 'Invalid plugin manifest.',
        capabilities: [],
        permissions: [],
        mcpConnectors: [],
        sourcePath,
        enabled: false,
        status: 'invalid',
        statusDetail: error instanceof Error ? error.message : 'Unable to parse plugin manifest.',
      };
    }
  }
}
