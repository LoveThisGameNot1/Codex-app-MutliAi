import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
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
        sourcePath,
        enabled: false,
        status: 'invalid',
        statusDetail: error instanceof Error ? error.message : 'Unable to parse plugin manifest.',
      };
    }
  }
}
