import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePluginManifest, PluginService } from './plugin-service';

const tempDirs: string[] = [];

const createWorkspace = async (): Promise<{ workspaceRoot: string; userDataPath: string }> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codexapp-plugin-service-'));
  tempDirs.push(root);
  return {
    workspaceRoot: path.join(root, 'workspace'),
    userDataPath: path.join(root, 'user-data'),
  };
};

const writePluginManifest = async (workspaceRoot: string, pluginId: string, manifest: unknown): Promise<void> => {
  const pluginDirectory = path.join(workspaceRoot, 'plugins', pluginId);
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(path.join(pluginDirectory, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('parsePluginManifest', () => {
  it('normalizes capabilities and permissions', () => {
    const manifest = parsePluginManifest({
      id: 'example.plugin',
      name: 'Example Plugin',
      version: '1.0.0',
      description: 'Example local plugin.',
      capabilities: [
        { kind: 'tool', name: 'example_tool', description: 'Runs an example tool.' },
        { kind: 'invalid', name: 'bad', description: 'Ignored.' },
      ],
      permissions: ['readWorkspace', 'readWorkspace', 'badPermission'],
    });

    expect(manifest.capabilities).toEqual([
      { kind: 'tool', name: 'example_tool', description: 'Runs an example tool.' },
    ]);
    expect(manifest.permissions).toEqual(['readWorkspace']);
  });

  it('rejects manifests without required identity fields', () => {
    expect(() => parsePluginManifest({ id: '', name: '', version: '', description: '' })).toThrow(
      'Plugin manifest needs a valid id.',
    );
  });
});

describe('PluginService', () => {
  it('lists workspace plugin manifests', async () => {
    const { workspaceRoot, userDataPath } = await createWorkspace();
    await writePluginManifest(workspaceRoot, 'example', {
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      description: 'Example plugin.',
      capabilities: [{ kind: 'skill', name: 'example_skill', description: 'Adds a skill.' }],
      permissions: ['readWorkspace'],
    });

    const plugins = await new PluginService(workspaceRoot, userDataPath).listPlugins();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      id: 'example',
      enabled: false,
      status: 'disabled',
      permissions: ['readWorkspace'],
    });
  });

  it('persists enabled state across service instances', async () => {
    const { workspaceRoot, userDataPath } = await createWorkspace();
    await writePluginManifest(workspaceRoot, 'example', {
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      description: 'Example plugin.',
      capabilities: [{ kind: 'tool', name: 'example_tool', description: 'Adds a tool.' }],
      permissions: ['readWorkspace'],
    });

    const firstService = new PluginService(workspaceRoot, userDataPath);
    const enabled = await firstService.updatePluginState({ id: 'example', enabled: true });
    const secondService = new PluginService(workspaceRoot, userDataPath);
    const plugins = await secondService.listPlugins();

    expect(enabled.status).toBe('enabled');
    expect(plugins[0]).toMatchObject({
      id: 'example',
      enabled: true,
      status: 'enabled',
    });
  });

  it('surfaces invalid plugin manifests without enabling them', async () => {
    const { workspaceRoot, userDataPath } = await createWorkspace();
    await writePluginManifest(workspaceRoot, 'broken', {
      name: 'Broken',
    });

    const service = new PluginService(workspaceRoot, userDataPath);
    const plugins = await service.listPlugins();

    expect(plugins[0]).toMatchObject({
      id: 'broken',
      status: 'invalid',
      enabled: false,
    });
    await expect(service.updatePluginState({ id: 'broken', enabled: true })).rejects.toThrow(
      'Plugin broken is invalid and cannot be enabled.',
    );
  });
});
