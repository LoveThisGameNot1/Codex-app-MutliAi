import { app } from 'electron';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  AvailableModelRecord,
  AppConfig,
  AutomationRecord,
  AutomationRunRecord,
  ChatStreamEvent,
  CreateAutomationInput,
  DEFAULT_SYSTEM_PROMPT,
  ModelCatalogResult,
  StartChatRequest,
  ToolExecutionRecord,
  UpdateAutomationInput,
} from '../shared/contracts';
import {
  executeTerminalTool,
  readFileTool,
  type ExecuteTerminalArgs,
  type ReadFileArgs,
  type ToolContext,
  writeFileTool,
  type WriteFileArgs,
} from './tool-service';
import { SessionStore } from './session-store';
import {
  getProviderPreset,
  isApiKeyOptionalForProvider,
  resolveBaseUrl,
} from '../shared/provider-presets';
import { dedupeAndSortModels } from '../shared/model-catalog';

const nowIso = (): string => new Date().toISOString();

type EmitEvent = (event: ChatStreamEvent) => void;

type Session = {
  messages: ChatCompletionMessageParam[];
  prompt: string;
};

type AutomationTooling = {
  listAutomations: () => Promise<AutomationRecord[]>;
  createAutomation: (input: CreateAutomationInput) => Promise<AutomationRecord>;
  updateAutomation: (input: UpdateAutomationInput) => Promise<AutomationRecord>;
  deleteAutomation: (automationId: string) => Promise<void>;
  runAutomation: (automationId: string) => Promise<AutomationRunRecord>;
};

const safeJson = (value: unknown): string => JSON.stringify(value, null, 2);

const parseJson = <T>(input: string): T => {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    throw new Error(`Tool arguments were not valid JSON: ${(error as Error).message}`);
  }
};

const buildPrompt = (systemPrompt: string): string => {
  const trimmed = systemPrompt.trim();
  const basePrompt = trimmed || DEFAULT_SYSTEM_PROMPT;
  return `${basePrompt}

Runtime capabilities:
- The workspace supports recurring automations.
- Available automation tools are list_automations, create_automation, update_automation, delete_automation, and run_automation.
- Use automation tools when the user asks for repeated work, scheduled checks, or autonomous follow-up runs.`;
};

const nowCatalogIso = (): string => new Date().toISOString();

const buildDefaultHeaders = (providerId: string): Record<string, string> | undefined => {
  const defaultHeaders: Record<string, string> = {};
  const packageVersion = app.getVersion();

  if (providerId === 'openrouter') {
    defaultHeaders['X-Title'] = 'CodexApp Multi APIs';
  }

  if (providerId === 'gemini') {
    defaultHeaders['x-goog-api-client'] = `codexapp-multi-apis/${packageVersion}`;
  }

  return Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined;
};

const buildClient = (config: AppConfig): OpenAI => {
  const provider = getProviderPreset(config.providerId);
  const baseURL = resolveBaseUrl(provider.id, config.baseUrl);
  const apiKey = config.apiKey.trim() || (isApiKeyOptionalForProvider(provider.id, baseURL) ? 'ollama' : '');

  return new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: buildDefaultHeaders(provider.id),
  });
};

export class LlmService {
  private readonly sessions = new Map<string, Session>();
  private readonly activeRunners = new Map<string, ReturnType<OpenAI['chat']['completions']['runTools']>>();
  private readonly activeAbortControllers = new Map<string, AbortController>();
  private readonly initializationPromise: Promise<void>;
  private automationTooling: AutomationTooling | null = null;

  public constructor(
    private readonly workspaceRoot: string,
    private readonly sessionStore: SessionStore,
  ) {
    this.initializationPromise = this.loadPersistedSessions();
  }

  public setAutomationTooling(automationTooling: AutomationTooling): void {
    this.automationTooling = automationTooling;
  }

  public async startChat(request: StartChatRequest, emitEvent: EmitEvent): Promise<void> {
    await this.initializationPromise;
    const { config, message, requestId, sessionId } = request;
    const provider = getProviderPreset(config.providerId);
    const baseURL = resolveBaseUrl(provider.id, config.baseUrl);
    const apiKey = config.apiKey.trim();

    if (!apiKey && !isApiKeyOptionalForProvider(provider.id, baseURL)) {
      emitEvent({
        type: 'chat.error',
        requestId,
        message: `No API key is configured for ${provider.label}. Add one in the settings panel.`,
        finishedAt: nowIso(),
      });
      return;
    }

    const client = buildClient(config);
    const prompt = buildPrompt(config.systemPrompt);
    const session = this.ensureSession(sessionId, prompt);

    session.messages.push({
      role: 'user',
      content: message,
    });
    await this.persistSession(sessionId, session);

    emitEvent({
      type: 'chat.started',
      requestId,
      sessionId,
      startedAt: nowIso(),
      model: config.model,
    });

    let toolCounter = 0;
    let contentSnapshot = '';
    const abortController = new AbortController();
    this.activeAbortControllers.set(requestId, abortController);
    const context: ToolContext = { workspaceRoot: this.workspaceRoot, signal: abortController.signal };

    const createToolRecord = (name: string, argumentsPayload: unknown): ToolExecutionRecord => ({
      id: `${requestId}:tool:${++toolCounter}`,
      name,
      argumentsText: safeJson(argumentsPayload),
      status: 'running',
      startedAt: nowIso(),
    });

    const runInstrumentedTool = async <TArgs>(
      name: string,
      args: TArgs,
      execute: (input: TArgs, toolContext: ToolContext) => Promise<string>,
    ): Promise<string> => {
      const startedRecord = createToolRecord(name, args);
      emitEvent({
        type: 'tool.started',
        requestId,
        tool: startedRecord,
      });

      try {
        const output = await execute(args, context);
        emitEvent({
          type: 'tool.completed',
          requestId,
          tool: {
            ...startedRecord,
            output,
            status: 'completed',
            finishedAt: nowIso(),
          },
        });
        return output;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown tool error';
        emitEvent({
          type: 'tool.failed',
          requestId,
          tool: {
            ...startedRecord,
            output: messageText,
            status: 'failed',
            finishedAt: nowIso(),
          },
        });
        throw error;
      }
    };

    const tools: Array<Parameters<OpenAI['chat']['completions']['runTools']>[0]['tools'][number]> = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the UTF-8 text contents of a file from disk.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path or path relative to the workspace root.',
              },
            },
            required: ['path'],
            additionalProperties: false,
          },
          parse: (input: string) => parseJson<ReadFileArgs>(input),
          function: (args: ReadFileArgs) => runInstrumentedTool('read_file', args, readFileTool),
        },
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Create or overwrite a UTF-8 text file on disk.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path or path relative to the workspace root.',
              },
              content: {
                type: 'string',
                description: 'Full file contents to write.',
              },
            },
            required: ['path', 'content'],
            additionalProperties: false,
          },
          parse: (input: string) => parseJson<WriteFileArgs>(input),
          function: (args: WriteFileArgs) => runInstrumentedTool('write_file', args, writeFileTool),
        },
      },
      {
        type: 'function',
        function: {
          name: 'execute_terminal',
          description:
            'Run a terminal command. Use it for builds, tests, inspections, package installs, git commands, or scripts.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The exact command to run in the system shell.',
              },
              cwd: {
                type: 'string',
                description: 'Optional working directory, absolute or relative to the workspace root.',
              },
            },
            required: ['command'],
            additionalProperties: false,
          },
          parse: (input: string) => parseJson<ExecuteTerminalArgs>(input),
          function: (args: ExecuteTerminalArgs) => runInstrumentedTool('execute_terminal', args, executeTerminalTool),
        },
      },
    ];

    if (this.automationTooling) {
      tools.push(
        {
          type: 'function',
          function: {
            name: 'list_automations',
            description: 'List all saved recurring automations.',
            parameters: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            parse: () => ({}),
            function: async () =>
              safeJson(
                await this.automationTooling!.listAutomations().then((automations) =>
                  automations.map((automation) => ({
                    id: automation.id,
                    name: automation.name,
                    status: automation.status,
                    schedule: automation.schedule,
                    nextRunAt: automation.nextRunAt ?? null,
                    lastRunAt: automation.lastRunAt ?? null,
                    lastRunStatus: automation.lastRunStatus ?? null,
                    lastResultSummary: automation.lastResultSummary ?? null,
                  })),
                ),
              ),
          },
        },
        {
          type: 'function',
          function: {
            name: 'create_automation',
            description: 'Create a recurring automation that can run later without additional context.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                prompt: { type: 'string' },
                schedule: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['interval', 'daily', 'weekly'] },
                    intervalMinutes: { type: 'number' },
                    hour: { type: 'number' },
                    minute: { type: 'number' },
                    weekdays: {
                      type: 'array',
                      items: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6] },
                    },
                  },
                  required: ['kind'],
                  additionalProperties: false,
                },
              },
              required: ['name', 'prompt', 'schedule'],
              additionalProperties: false,
            },
            parse: (input: string) => parseJson<CreateAutomationInput>(input),
            function: async (args: CreateAutomationInput) =>
              safeJson(await this.automationTooling!.createAutomation(args)),
          },
        },
        {
          type: 'function',
          function: {
            name: 'update_automation',
            description: 'Update an existing automation. You can rename it, pause/resume it, or adjust its schedule.',
            parameters: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                prompt: { type: 'string' },
                schedule: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['interval', 'daily', 'weekly'] },
                    intervalMinutes: { type: 'number' },
                    hour: { type: 'number' },
                    minute: { type: 'number' },
                    weekdays: {
                      type: 'array',
                      items: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6] },
                    },
                  },
                  required: ['kind'],
                  additionalProperties: false,
                },
                status: { type: 'string', enum: ['active', 'paused'] },
              },
              required: ['id'],
              additionalProperties: false,
            },
            parse: (input: string) => parseJson<UpdateAutomationInput>(input),
            function: async (args: UpdateAutomationInput) =>
              safeJson(await this.automationTooling!.updateAutomation(args)),
          },
        },
        {
          type: 'function',
          function: {
            name: 'delete_automation',
            description: 'Delete an automation permanently.',
            parameters: {
              type: 'object',
              properties: {
                automationId: { type: 'string' },
              },
              required: ['automationId'],
              additionalProperties: false,
            },
            parse: (input: string) => parseJson<{ automationId: string }>(input),
            function: async (args: { automationId: string }) => {
              await this.automationTooling!.deleteAutomation(args.automationId);
              return 'Automation deleted.';
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'run_automation',
            description: 'Run an automation immediately without waiting for its next schedule.',
            parameters: {
              type: 'object',
              properties: {
                automationId: { type: 'string' },
              },
              required: ['automationId'],
              additionalProperties: false,
            },
            parse: (input: string) => parseJson<{ automationId: string }>(input),
            function: async (args: { automationId: string }) =>
              safeJson(await this.automationTooling!.runAutomation(args.automationId)),
          },
        },
      );
    }

    const runner = client.chat.completions.runTools(
      {
        model: config.model,
        stream: true,
        messages: session.messages,
        parallel_tool_calls: false,
        tool_choice: 'auto',
        tools: tools as never,
      },
      {
        maxChatCompletions: 12,
      },
    ) as ReturnType<OpenAI['chat']['completions']['runTools']>;

    this.activeRunners.set(requestId, runner);

    runner.on('content', (delta: string, snapshot: string) => {
      contentSnapshot = snapshot;
      emitEvent({
        type: 'assistant.delta',
        requestId,
        delta,
      });
    });

    runner.on('abort', () => {
      emitEvent({
        type: 'chat.cancelled',
        requestId,
        finishedAt: nowIso(),
      });
    });

    runner.on('error', (error) => {
      emitEvent({
        type: 'chat.error',
        requestId,
        message: error.message,
        finishedAt: nowIso(),
      });
    });

    try {
      await runner.finalChatCompletion();
      if (abortController.signal.aborted) {
        return;
      }
      session.messages = [...runner.messages];
      await this.persistSession(sessionId, session);

      emitEvent({
        type: 'assistant.completed',
        requestId,
        content: contentSnapshot,
        finishedAt: nowIso(),
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      const messageText = error instanceof Error ? error.message : 'Unknown OpenAI error';
      emitEvent({
        type: 'chat.error',
        requestId,
        message: messageText,
        finishedAt: nowIso(),
      });
    } finally {
      this.activeRunners.delete(requestId);
      this.activeAbortControllers.delete(requestId);
    }
  }

  public async listAvailableModels(config: AppConfig): Promise<ModelCatalogResult> {
    const provider = getProviderPreset(config.providerId);
    const baseUrl = resolveBaseUrl(provider.id, config.baseUrl);
    const fallbackModels = dedupeAndSortModels([], provider.popularModels);
    const apiKey = config.apiKey.trim();

    if (!apiKey && !isApiKeyOptionalForProvider(provider.id, baseUrl)) {
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        baseUrl,
        source: 'preset-fallback',
        fetchedAt: nowCatalogIso(),
        warning: `No API key is configured for ${provider.label}, so showing preset models only.`,
        models: fallbackModels,
      };
    }

    if (provider.supportsModelDiscovery === false) {
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        baseUrl,
        source: 'preset-fallback',
        fetchedAt: nowCatalogIso(),
        warning: `${provider.label} does not expose reliable model discovery through this transport yet.`,
        models: fallbackModels,
      };
    }

    try {
      const client = buildClient(config);
      const response = await client.models.list();
      const liveModels = dedupeAndSortModels(
        response.data.map<AvailableModelRecord>((model) => ({
          id: model.id,
          ownedBy: typeof model.owned_by === 'string' ? model.owned_by : undefined,
        })),
        provider.popularModels,
      );

      return {
        providerId: provider.id,
        providerLabel: provider.label,
        baseUrl,
        source: 'live',
        fetchedAt: nowCatalogIso(),
        models: liveModels,
        warning: liveModels.length === 0 ? 'The provider returned no models, so preset suggestions were merged in.' : undefined,
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown model catalog error';
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        baseUrl,
        source: 'preset-fallback',
        fetchedAt: nowCatalogIso(),
        warning: `Live model discovery failed: ${messageText}`,
        models: fallbackModels,
      };
    }
  }

  public async cancelChat(requestId: string): Promise<void> {
    this.activeAbortControllers.get(requestId)?.abort();
    const runner = this.activeRunners.get(requestId);
    runner?.abort();
    this.activeRunners.delete(requestId);
    this.activeAbortControllers.delete(requestId);
  }

  public async resetSession(sessionId: string, config: AppConfig): Promise<void> {
    await this.initializationPromise;
    const session: Session = {
      prompt: buildPrompt(config.systemPrompt),
      messages: [
        {
          role: 'developer',
          content: buildPrompt(config.systemPrompt),
        },
      ],
    };

    this.sessions.set(sessionId, session);
    await this.persistSession(sessionId, session);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.initializationPromise;
    this.sessions.delete(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  private ensureSession(sessionId: string, prompt: string): Session {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.prompt !== prompt) {
        existing.prompt = prompt;
        if (existing.messages.length > 0 && existing.messages[0]?.role === 'developer') {
          existing.messages[0] = {
            role: 'developer',
            content: prompt,
          };
        } else {
          existing.messages.unshift({
            role: 'developer',
            content: prompt,
          });
        }
        void this.persistSession(sessionId, existing);
      }
      return existing;
    }

    const session: Session = {
      prompt,
      messages: [
        {
          role: 'developer',
          content: prompt,
        },
      ],
    };

    this.sessions.set(sessionId, session);
    void this.persistSession(sessionId, session);
    return session;
  }

  private async loadPersistedSessions(): Promise<void> {
    const persistedSessions = await this.sessionStore.loadAll();
    for (const session of persistedSessions) {
      this.sessions.set(session.id, {
        prompt: session.prompt,
        messages: session.messages,
      });
    }
  }

  private async persistSession(sessionId: string, session: Session): Promise<void> {
    await this.sessionStore.upsert({
      id: sessionId,
      prompt: session.prompt,
      messages: session.messages,
      updatedAt: nowIso(),
    });
  }
}
