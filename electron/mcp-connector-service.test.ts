import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpConnectorService } from './mcp-connector-service';
import { PluginService } from './plugin-service';

const tempDirs: string[] = [];

const createWorkspace = async (): Promise<{ workspaceRoot: string; userDataPath: string }> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codexapp-mcp-service-'));
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

describe('McpConnectorService', () => {
  it('skips disabled connectors instead of launching them', async () => {
    const { workspaceRoot, userDataPath } = await createWorkspace();
    await writePluginManifest(workspaceRoot, 'example', {
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      description: 'Example plugin.',
      capabilities: [{ kind: 'mcp', name: 'docs', description: 'Adds an MCP connector.' }],
      permissions: ['executeCommands'],
      mcpConnectors: [
        {
          id: 'docs',
          name: 'Docs MCP',
          description: 'Local docs connector.',
          transport: 'stdio',
          command: process.execPath,
          args: ['server.mjs'],
        },
      ],
    });

    const service = new McpConnectorService(new PluginService(workspaceRoot, userDataPath));
    const result = await service.checkConnector({ pluginId: 'example', connectorId: 'docs' });

    expect(result).toMatchObject({
      status: 'skipped',
      ok: false,
      detail: 'Enable the plugin before this connector can be used.',
    });
  });

  it('checks a stdio connector with an MCP initialize request', async () => {
    const { workspaceRoot, userDataPath } = await createWorkspace();
    const pluginDirectory = path.join(workspaceRoot, 'plugins', 'example');
    await mkdir(pluginDirectory, { recursive: true });
    const serverPath = path.join(pluginDirectory, 'server.mjs');
    await writeFile(
      serverPath,
      `
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\\r?\\n/);
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture-mcp', version: '1.0.0' }
      }
    }) + '\\n');
  }
});
setTimeout(() => process.exit(1), 5000);
`,
      'utf8',
    );
    await writeFile(
      path.join(pluginDirectory, 'plugin.json'),
      JSON.stringify(
        {
          id: 'example',
          name: 'Example',
          version: '1.0.0',
          description: 'Example plugin.',
          capabilities: [{ kind: 'mcp', name: 'docs', description: 'Adds an MCP connector.' }],
          permissions: ['executeCommands'],
          mcpConnectors: [
            {
              id: 'docs',
              name: 'Docs MCP',
              description: 'Local docs connector.',
              transport: 'stdio',
              command: process.execPath,
              args: [serverPath],
              timeoutMs: 3000,
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const pluginService = new PluginService(workspaceRoot, userDataPath);
    await pluginService.updatePluginState({ id: 'example', enabled: true });
    const service = new McpConnectorService(pluginService);
    const result = await service.checkConnector({ pluginId: 'example', connectorId: 'docs' });

    expect(result).toMatchObject({
      status: 'connected',
      ok: true,
      responseSummary: 'fixture-mcp 1.0.0',
    });
  });
});
