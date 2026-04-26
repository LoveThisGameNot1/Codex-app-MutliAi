import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  CheckMcpConnectorInput,
  McpConnectorCheckResult,
  McpConnectorManifest,
  McpConnectorRecord,
  PluginPermissionKey,
} from '../shared/contracts';
import { PluginService } from './plugin-service';

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_OUTPUT_CHARS = 4000;
const INITIALIZE_REQUEST_ID = 'codexapp-mcp-initialize';

type JsonRpcResponse = {
  id?: string | number | null;
  result?: unknown;
  error?: {
    message?: string;
  };
};

const nowIso = (): string => new Date().toISOString();

const truncate = (value: string, maxLength = MAX_OUTPUT_CHARS): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated]` : value;

const createInitializeRequest = (): Record<string, unknown> => ({
  jsonrpc: '2.0',
  id: INITIALIZE_REQUEST_ID,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'CodexApp Multi APIs',
      version: '0.1.0',
    },
  },
});

const summarizeJsonRpcResponse = (response: JsonRpcResponse): string | undefined => {
  if (response.error) {
    return response.error.message || 'JSON-RPC error response.';
  }
  if (typeof response.result === 'object' && response.result !== null) {
    const serverInfo = (response.result as { serverInfo?: { name?: string; version?: string } }).serverInfo;
    if (serverInfo?.name) {
      return `${serverInfo.name}${serverInfo.version ? ` ${serverInfo.version}` : ''}`;
    }
  }

  return response.result === undefined ? undefined : truncate(JSON.stringify(response.result));
};

const parseJsonRpcResponse = (value: string): JsonRpcResponse | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
      return parsed as JsonRpcResponse;
    }
  } catch {
    return null;
  }

  return null;
};

const requiredPermissionForConnector = (connector: McpConnectorRecord): PluginPermissionKey =>
  connector.transport === 'stdio' ? 'executeCommands' : 'networkAccess';

const createSkippedResult = (connector: McpConnectorRecord, detail: string): McpConnectorCheckResult => ({
  pluginId: connector.pluginId,
  connectorId: connector.id,
  connectorName: connector.name,
  transport: connector.transport,
  status: 'skipped',
  ok: false,
  detail,
  checkedAt: nowIso(),
});

const createFailedResult = (
  connector: McpConnectorRecord,
  detail: string,
  responseSummary?: string,
): McpConnectorCheckResult => ({
  pluginId: connector.pluginId,
  connectorId: connector.id,
  connectorName: connector.name,
  transport: connector.transport,
  status: 'failed',
  ok: false,
  detail,
  checkedAt: nowIso(),
  ...(responseSummary ? { responseSummary } : {}),
});

const createConnectedResult = (
  connector: McpConnectorRecord,
  detail: string,
  responseSummary?: string,
): McpConnectorCheckResult => ({
  pluginId: connector.pluginId,
  connectorId: connector.id,
  connectorName: connector.name,
  transport: connector.transport,
  status: 'connected',
  ok: true,
  detail,
  checkedAt: nowIso(),
  ...(responseSummary ? { responseSummary } : {}),
});

const getTimeoutMs = (connector: McpConnectorManifest): number => connector.timeoutMs ?? DEFAULT_TIMEOUT_MS;

export class McpConnectorService {
  public constructor(private readonly pluginService: PluginService) {}

  public async listConnectors(): Promise<McpConnectorRecord[]> {
    return this.pluginService.listMcpConnectors();
  }

  public async checkConnector(input: CheckMcpConnectorInput): Promise<McpConnectorCheckResult> {
    const connectors = await this.listConnectors();
    const connector = connectors.find(
      (candidate) => candidate.pluginId === input.pluginId && candidate.id === input.connectorId,
    );

    if (!connector) {
      throw new Error(`MCP connector ${input.pluginId}/${input.connectorId} was not found.`);
    }

    if (connector.status !== 'ready') {
      return createSkippedResult(connector, connector.statusDetail);
    }

    const requiredPermission = requiredPermissionForConnector(connector);
    if (!connector.pluginPermissions.includes(requiredPermission)) {
      return createSkippedResult(
        connector,
        `Plugin ${connector.pluginName} must request ${requiredPermission} before this connector can be checked.`,
      );
    }

    if (connector.transport === 'stdio') {
      return this.checkStdioConnector(connector);
    }
    if (connector.transport === 'sse') {
      return this.checkSseConnector(connector);
    }

    return this.checkHttpConnector(connector);
  }

  private async checkStdioConnector(connector: McpConnectorRecord): Promise<McpConnectorCheckResult> {
    if (!connector.command) {
      return createFailedResult(connector, 'Connector command is missing.');
    }

    const pluginDirectory = path.dirname(connector.pluginSourcePath);
    const child = spawn(connector.command, connector.args ?? [], {
      cwd: pluginDirectory,
      env: {
        ...process.env,
        ...(connector.env ?? {}),
      },
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;

    const cleanup = (): void => {
      if (!child.killed) {
        child.kill();
      }
    };

    return new Promise<McpConnectorCheckResult>((resolve) => {
      const finish = (result: McpConnectorCheckResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve(result);
          return;
        }

        const resolveAfterClose = (): void => {
          resolve(result);
        };
        child.once('close', resolveAfterClose);
        cleanup();
        setTimeout(resolveAfterClose, 250).unref();
      };

      const timeout = setTimeout(() => {
        finish(
          createFailedResult(
            connector,
            `Timed out waiting for an MCP initialize response after ${getTimeoutMs(connector)}ms.`,
            truncate(stderrBuffer),
          ),
        );
      }, getTimeoutMs(connector));

      child.on('error', (error) => {
        finish(createFailedResult(connector, error.message, truncate(stderrBuffer)));
      });

      child.on('exit', (code, signal) => {
        if (!settled) {
          finish(
            createFailedResult(
              connector,
              `Connector process exited before responding${code === null ? '' : ` with code ${code}`}${signal ? ` and signal ${signal}` : ''}.`,
              truncate(stderrBuffer),
            ),
          );
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer = truncate(stderrBuffer + chunk.toString('utf8'));
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const response = parseJsonRpcResponse(line.trim());
          if (!response || response.id !== INITIALIZE_REQUEST_ID) {
            continue;
          }

          const summary = summarizeJsonRpcResponse(response);
          if (response.error) {
            finish(createFailedResult(connector, 'MCP initialize returned an error.', summary));
            return;
          }

          finish(createConnectedResult(connector, 'MCP stdio connector responded to initialize.', summary));
          return;
        }
      });

      child.stdin?.write(`${JSON.stringify(createInitializeRequest())}\n`, 'utf8');
    });
  }

  private async checkHttpConnector(connector: McpConnectorRecord): Promise<McpConnectorCheckResult> {
    if (!connector.url) {
      return createFailedResult(connector, 'Connector URL is missing.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs(connector));

    try {
      const response = await fetch(connector.url, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...(connector.headers ?? {}),
        },
        body: JSON.stringify(createInitializeRequest()),
        signal: controller.signal,
      });
      const text = truncate(await response.text());
      if (!response.ok) {
        return createFailedResult(connector, `HTTP connector returned ${response.status}.`, text);
      }

      const jsonRpc = parseJsonRpcResponse(text);
      if (jsonRpc?.error) {
        return createFailedResult(connector, 'MCP initialize returned an error.', summarizeJsonRpcResponse(jsonRpc));
      }

      return createConnectedResult(
        connector,
        'MCP HTTP connector accepted an initialize request.',
        jsonRpc ? summarizeJsonRpcResponse(jsonRpc) : text,
      );
    } catch (error) {
      return createFailedResult(
        connector,
        error instanceof Error ? error.message : 'Unable to reach MCP HTTP connector.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkSseConnector(connector: McpConnectorRecord): Promise<McpConnectorCheckResult> {
    if (!connector.url) {
      return createFailedResult(connector, 'Connector URL is missing.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs(connector));

    try {
      const response = await fetch(connector.url, {
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
          ...(connector.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return createFailedResult(connector, `SSE connector returned ${response.status}.`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream')) {
        return createConnectedResult(connector, 'MCP SSE endpoint accepted an event-stream connection.');
      }

      const reader = response.body?.getReader();
      const firstChunk = reader ? await reader.read() : null;
      const summary = firstChunk?.value ? truncate(new TextDecoder().decode(firstChunk.value)) : undefined;

      return createConnectedResult(connector, 'MCP SSE endpoint responded to a streaming request.', summary);
    } catch (error) {
      return createFailedResult(
        connector,
        error instanceof Error ? error.message : 'Unable to reach MCP SSE connector.',
      );
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }
}
