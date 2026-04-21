import { app } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  createModelContent,
  createPartFromFunctionResponse,
  createUserContent,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Model as GeminiModel,
  type Part,
} from '@google/genai';
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
  ResolveToolApprovalInput,
  StartChatRequest,
  ToolApprovalRequestRecord,
  ToolApprovalScope,
  ToolExecutionRecord,
  UpdateAutomationInput,
} from '../shared/contracts';
import { inferDiscoveredModelCapabilities, inferModelCapabilities } from '../shared/model-capabilities';
import { dedupeAndSortModels } from '../shared/model-catalog';
import {
  getProviderPreset,
  isApiKeyOptionalForProvider,
  resolveBaseUrl,
} from '../shared/provider-presets';
import { canPersistApprovalForPolicyKey, describeToolPolicyForPrompt, normalizeToolPolicy } from '../shared/tool-policy';
import {
  executeTerminalTool,
  readFileTool,
  type ExecuteTerminalArgs,
  type ReadFileArgs,
  type ToolContext,
  writeFileTool,
  type WriteFileArgs,
} from './tool-service';
import type { ToolPolicyViolation } from './tool-policy';
import { SessionStore } from './session-store';
import { ApprovalRegistry } from './approval-registry';

const nowIso = (): string => new Date().toISOString();
const MAX_NATIVE_OUTPUT_TOKENS = 4096;
const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

type GenericToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: unknown) => Promise<string>;
};

type SpawnSubtaskArgs = {
  title: string;
  prompt: string;
  scope: string;
};

const safeJson = (value: unknown): string => JSON.stringify(value, null, 2);

const parseJson = <T>(input: string): T => {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    throw new Error(`Tool arguments were not valid JSON: ${(error as Error).message}`);
  }
};

const buildPrompt = (config: AppConfig): string => {
  const trimmed = config.systemPrompt.trim();
  const basePrompt = trimmed || DEFAULT_SYSTEM_PROMPT;
  const toolPolicy = normalizeToolPolicy(config.toolPolicy);
  return `${basePrompt}

Runtime capabilities:
- The workspace supports recurring automations.
- Available automation tools are list_automations, create_automation, update_automation, delete_automation, and run_automation.
- Use automation tools when the user asks for repeated work, scheduled checks, or autonomous follow-up runs.

Current tool approval policy:
${describeToolPolicyForPrompt(toolPolicy).join('\n')}`;
};

const normalizeBaseUrl = (input: string): string => input.trim().replace(/\/+$/, '');
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

const buildOpenAIClient = (config: AppConfig): OpenAI => {
  const provider = getProviderPreset(config.providerId);
  const baseURL = resolveBaseUrl(provider.id, config.baseUrl);
  const apiKey = config.apiKey.trim() || (isApiKeyOptionalForProvider(provider.id, baseURL) ? 'ollama' : '');

  return new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: buildDefaultHeaders(provider.id),
  });
};

const stringifyContent = (content: ChatCompletionMessageParam['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if ('type' in item && item.type === 'text') {
        return item.text;
      }

      if ('type' in item && item.type === 'refusal') {
        return item.refusal;
      }

      return '';
    })
    .join('');
};

export class LlmService {
  private readonly sessions = new Map<string, Session>();
  private readonly activeRunners = new Map<string, ReturnType<OpenAI['chat']['completions']['runTools']>>();
  private readonly activeAbortControllers = new Map<string, AbortController>();
  private readonly approvalRegistry = new ApprovalRegistry();
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

    if (this.shouldUseNativeAnthropic(request.config)) {
      await this.startAnthropicChat(request, emitEvent);
      return;
    }

    if (this.shouldUseNativeGemini(request.config)) {
      await this.startGeminiChat(request, emitEvent);
      return;
    }

    await this.startCompatibleChat(request, emitEvent);
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
        models: fallbackModels.map((model) => ({
          ...model,
          capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
        })),
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
        models: fallbackModels.map((model) => ({
          ...model,
          capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
        })),
      };
    }

    if (provider.id === 'gemini' && this.shouldUseNativeGemini(config)) {
      try {
        const liveModels = await this.listNativeGeminiModels(config, baseUrl, provider.popularModels);
        return {
          providerId: provider.id,
          providerLabel: provider.label,
          baseUrl,
          source: 'live',
          fetchedAt: nowCatalogIso(),
          models: liveModels,
          warning: liveModels.length === 0 ? 'Gemini returned no generateContent-capable models, so preset suggestions were merged in.' : undefined,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown Gemini model catalog error';
        return {
          providerId: provider.id,
          providerLabel: provider.label,
          baseUrl,
          source: 'preset-fallback',
          fetchedAt: nowCatalogIso(),
          warning: `Live Gemini model discovery failed: ${messageText}`,
          models: fallbackModels.map((model) => ({
            ...model,
            capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
          })),
        };
      }
    }

    if (provider.id === 'openrouter') {
      try {
        const liveModels = await this.listOpenRouterModels(config, baseUrl, provider.popularModels);
        return {
          providerId: provider.id,
          providerLabel: provider.label,
          baseUrl,
          source: 'live',
          fetchedAt: nowCatalogIso(),
          models: liveModels,
          warning: liveModels.length === 0 ? 'OpenRouter returned no text-capable models, so preset suggestions were merged in.' : undefined,
        };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown OpenRouter model catalog error';
        return {
          providerId: provider.id,
          providerLabel: provider.label,
          baseUrl,
          source: 'preset-fallback',
          fetchedAt: nowCatalogIso(),
          warning: `Live OpenRouter model discovery failed: ${messageText}`,
          models: fallbackModels.map((model) => ({
            ...model,
            capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
          })),
        };
      }
    }

    try {
      const client = buildOpenAIClient(config);
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
        models: liveModels.map((model) => ({
          ...model,
          capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
        })),
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
        models: fallbackModels.map((model) => ({
          ...model,
          capabilities: inferModelCapabilities(provider.id, model.id, baseUrl),
        })),
      };
    }
  }

  private async listNativeGeminiModels(
    config: AppConfig,
    baseUrl: string,
    fallbackModelIds: string[],
  ): Promise<AvailableModelRecord[]> {
    const client = new GoogleGenAI({
      apiKey: config.apiKey.trim(),
      apiVersion: 'v1beta',
      httpOptions: {
        headers: buildDefaultHeaders(config.providerId),
      },
    });

    const pager = await client.models.list({
      config: {
        pageSize: 200,
      },
    });

    const liveModels: AvailableModelRecord[] = [];
    for await (const model of pager) {
      const normalized = this.toGeminiAvailableModelRecord(model, baseUrl);
      if (normalized) {
        liveModels.push(normalized);
      }
    }

    return dedupeAndSortModels(liveModels, fallbackModelIds);
  }

  private toGeminiAvailableModelRecord(model: GeminiModel, baseUrl: string): AvailableModelRecord | null {
    const modelId = (model.name || '').replace(/^models\//, '').trim();
    if (!modelId) {
      return null;
    }

    return {
      id: modelId,
      ownedBy: 'google',
      capabilities: inferDiscoveredModelCapabilities('gemini', modelId, baseUrl, {
        supportedGenerationMethods: model.supportedActions,
        sourceLabel: 'Gemini models.list supportedGenerationMethods',
      }),
    };
  }

  private async listOpenRouterModels(
    config: AppConfig,
    baseUrl: string,
    fallbackModelIds: string[],
  ): Promise<AvailableModelRecord[]> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(buildDefaultHeaders(config.providerId) ?? {}),
    };

    const apiKey = config.apiKey.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter models endpoint returned ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        supported_parameters?: string[];
        architecture?: { output_modalities?: string[] };
      }>;
    };

    const liveModels = (payload.data ?? [])
      .map<AvailableModelRecord | null>((model) => {
        const modelId = model.id?.trim();
        if (!modelId) {
          return null;
        }

        return {
          id: modelId,
          ownedBy: modelId.includes('/') ? modelId.split('/')[0] : 'openrouter',
          capabilities: inferDiscoveredModelCapabilities('openrouter', modelId, baseUrl, {
            supportedParameters: model.supported_parameters,
            outputModalities: model.architecture?.output_modalities,
            sourceLabel: 'OpenRouter models supported_parameters',
          }),
        };
      })
      .filter((model): model is AvailableModelRecord => model !== null);

    return dedupeAndSortModels(liveModels, fallbackModelIds);
  }

  public async cancelChat(requestId: string): Promise<void> {
    this.approvalRegistry.rejectPendingForRequest(requestId, 'cancelled');
    this.approvalRegistry.clearRequestState(requestId);
    this.activeAbortControllers.get(requestId)?.abort();
    const runner = this.activeRunners.get(requestId);
    runner?.abort();
    this.activeRunners.delete(requestId);
    this.activeAbortControllers.delete(requestId);
  }

  public async resolveToolApproval(input: ResolveToolApprovalInput): Promise<void> {
    this.approvalRegistry.resolve(input);
  }

  public async resetSession(sessionId: string, config: AppConfig): Promise<void> {
    await this.initializationPromise;
    const prompt = buildPrompt(config);
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
    await this.persistSession(sessionId, session);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.initializationPromise;
    this.sessions.delete(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  private async startCompatibleChat(request: StartChatRequest, emitEvent: EmitEvent): Promise<void> {
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

    const client = buildOpenAIClient(config);
    const prompt = buildPrompt(config);
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

    let contentSnapshot = '';
    const abortController = new AbortController();
    this.activeAbortControllers.set(requestId, abortController);
    const context: ToolContext = {
      workspaceRoot: this.workspaceRoot,
      signal: abortController.signal,
      toolPolicy: normalizeToolPolicy(config.toolPolicy),
      approvalState: {
        grantedPolicies: new Set(),
        unsafeAutoApproveAsk: false,
      },
      requestApproval: (input) => this.requestToolApproval(requestId, input, emitEvent),
    };
    const toolDefinitions = this.createToolDefinitions(requestId, context, emitEvent);

    const tools: Array<Parameters<OpenAI['chat']['completions']['runTools']>[0]['tools'][number]> = toolDefinitions.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        parse: (input: string) => parseJson<unknown>(input),
        function: (args: unknown) => tool.execute(args),
      },
    }));

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
      this.approvalRegistry.clearRequestState(requestId);
      this.activeRunners.delete(requestId);
      this.activeAbortControllers.delete(requestId);
    }
  }

  private async startAnthropicChat(request: StartChatRequest, emitEvent: EmitEvent): Promise<void> {
    const { config, message, requestId, sessionId } = request;
    const provider = getProviderPreset(config.providerId);
    const apiKey = config.apiKey.trim();

    if (!apiKey) {
      emitEvent({
        type: 'chat.error',
        requestId,
        message: `No API key is configured for ${provider.label}. Add one in the settings panel.`,
        finishedAt: nowIso(),
      });
      return;
    }

    const prompt = buildPrompt(config);
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

    const abortController = new AbortController();
    this.activeAbortControllers.set(requestId, abortController);
    const context: ToolContext = {
      workspaceRoot: this.workspaceRoot,
      signal: abortController.signal,
      toolPolicy: normalizeToolPolicy(config.toolPolicy),
      approvalState: {
        grantedPolicies: new Set(),
        unsafeAutoApproveAsk: false,
      },
      requestApproval: (input) => this.requestToolApproval(requestId, input, emitEvent),
    };
    const toolDefinitions = this.createToolDefinitions(requestId, context, emitEvent);
    const anthropicTools: Anthropic.Tool[] = toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
    const toolMap = new Map(toolDefinitions.map((tool) => [tool.name, tool]));
    const client = new Anthropic({
      apiKey,
      baseURL: resolveBaseUrl(config.providerId, config.baseUrl),
      defaultHeaders: buildDefaultHeaders(config.providerId),
    });

    let contentSnapshot = '';
    const providerMessages = this.toAnthropicMessages(session.messages);

    try {
      while (true) {
        const stream = client.messages.stream(
          {
            model: config.model,
            max_tokens: MAX_NATIVE_OUTPUT_TOKENS,
            system: prompt,
            messages: providerMessages,
            tools: anthropicTools,
            tool_choice: {
              type: 'auto',
              disable_parallel_tool_use: true,
            },
          },
          {
            signal: abortController.signal,
          },
        );

        stream.on('text', (textDelta: string) => {
          contentSnapshot += textDelta;
          emitEvent({
            type: 'assistant.delta',
            requestId,
            delta: textDelta,
          });
        });

        const finalMessage = await stream.finalMessage();
        const assistantContent = finalMessage.content
          .map((block) => {
            if (block.type === 'text') {
              return {
                type: 'text' as const,
                text: block.text,
              };
            }

            if (block.type === 'tool_use') {
              return {
                type: 'tool_use' as const,
                id: block.id,
                name: block.name,
                input: block.input,
              };
            }

            return null;
          })
          .filter((block): block is NonNullable<typeof block> => block !== null) as Anthropic.ContentBlockParam[];

        providerMessages.push({
          role: 'assistant',
          content: assistantContent,
        });

        const toolUses = finalMessage.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (toolUses.length === 0) {
          break;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          const tool = toolMap.get(toolUse.name);
          if (!tool) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Unknown tool: ${toolUse.name}`,
              is_error: true,
            });
            continue;
          }

          try {
            const output = await tool.execute(toolUse.input);
            session.messages.push(this.createStoredToolMessage(requestId, toolUse.name, output));
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: output,
            });
          } catch (error) {
            const messageText = error instanceof Error ? error.message : `Unknown tool failure for ${toolUse.name}`;
            session.messages.push(this.createStoredToolMessage(requestId, toolUse.name, messageText));
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: messageText,
              is_error: true,
            });
          }
        }

        providerMessages.push({
          role: 'user',
          content: toolResults,
        });
      }

      if (abortController.signal.aborted) {
        emitEvent({
          type: 'chat.cancelled',
          requestId,
          finishedAt: nowIso(),
        });
        return;
      }

      session.messages.push({
        role: 'assistant',
        content: contentSnapshot,
      });
      await this.persistSession(sessionId, session);

      emitEvent({
        type: 'assistant.completed',
        requestId,
        content: contentSnapshot,
        finishedAt: nowIso(),
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        emitEvent({
          type: 'chat.cancelled',
          requestId,
          finishedAt: nowIso(),
        });
        return;
      }

      const messageText = error instanceof Error ? error.message : 'Unknown Anthropic error';
      emitEvent({
        type: 'chat.error',
        requestId,
        message: messageText,
        finishedAt: nowIso(),
      });
    } finally {
      this.approvalRegistry.clearRequestState(requestId);
      this.activeAbortControllers.delete(requestId);
    }
  }

  private async startGeminiChat(request: StartChatRequest, emitEvent: EmitEvent): Promise<void> {
    const { config, message, requestId, sessionId } = request;
    const provider = getProviderPreset(config.providerId);
    const apiKey = config.apiKey.trim();

    if (!apiKey) {
      emitEvent({
        type: 'chat.error',
        requestId,
        message: `No API key is configured for ${provider.label}. Add one in the settings panel.`,
        finishedAt: nowIso(),
      });
      return;
    }

    const prompt = buildPrompt(config);
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

    const abortController = new AbortController();
    this.activeAbortControllers.set(requestId, abortController);
    const context: ToolContext = {
      workspaceRoot: this.workspaceRoot,
      signal: abortController.signal,
      toolPolicy: normalizeToolPolicy(config.toolPolicy),
      approvalState: {
        grantedPolicies: new Set(),
        unsafeAutoApproveAsk: false,
      },
      requestApproval: (input) => this.requestToolApproval(requestId, input, emitEvent),
    };
    const toolDefinitions = this.createToolDefinitions(requestId, context, emitEvent);
    const toolMap = new Map(toolDefinitions.map((tool) => [tool.name, tool]));
    const functionDeclarations: FunctionDeclaration[] = toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema,
    }));
    const client = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: buildDefaultHeaders(config.providerId),
      },
    });

    let contentSnapshot = '';
    const contents = this.toGeminiContents(session.messages);

    try {
      while (true) {
        const stream = await client.models.generateContentStream({
          model: config.model,
          contents,
          config: {
            abortSignal: abortController.signal,
            systemInstruction: prompt,
            tools: [{ functionDeclarations }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          },
        });

        let functionCalls: FunctionCall[] = [];

        for await (const chunk of stream) {
          if (chunk.text) {
            contentSnapshot += chunk.text;
            emitEvent({
              type: 'assistant.delta',
              requestId,
              delta: chunk.text,
            });
          }

          if (chunk.functionCalls?.length) {
            functionCalls = chunk.functionCalls;
          }
        }

        if (functionCalls.length === 0) {
          break;
        }

        contents.push(
          createModelContent(
            functionCalls.map<Part>((functionCall) => ({
              functionCall,
            })),
          ),
        );

        const functionResponses: Part[] = [];
        for (const functionCall of functionCalls) {
          const tool = functionCall.name ? toolMap.get(functionCall.name) : undefined;
          if (!tool || !functionCall.name) {
            functionResponses.push(
              createPartFromFunctionResponse(functionCall.id || functionCall.name || 'unknown', functionCall.name || 'unknown', {
                error: `Unknown tool: ${functionCall.name || 'unknown'}`,
              }),
            );
            continue;
          }

          try {
            const output = await tool.execute(functionCall.args ?? {});
            session.messages.push(this.createStoredToolMessage(requestId, functionCall.name, output));
            functionResponses.push(
              createPartFromFunctionResponse(functionCall.id || functionCall.name, functionCall.name, {
                output,
              }),
            );
          } catch (error) {
            const messageText = error instanceof Error ? error.message : `Unknown tool failure for ${functionCall.name}`;
            session.messages.push(this.createStoredToolMessage(requestId, functionCall.name, messageText));
            functionResponses.push(
              createPartFromFunctionResponse(functionCall.id || functionCall.name, functionCall.name, {
                error: messageText,
              }),
            );
          }
        }

        contents.push(createUserContent(functionResponses));
      }

      if (abortController.signal.aborted) {
        emitEvent({
          type: 'chat.cancelled',
          requestId,
          finishedAt: nowIso(),
        });
        return;
      }

      session.messages.push({
        role: 'assistant',
        content: contentSnapshot,
      });
      await this.persistSession(sessionId, session);

      emitEvent({
        type: 'assistant.completed',
        requestId,
        content: contentSnapshot,
        finishedAt: nowIso(),
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        emitEvent({
          type: 'chat.cancelled',
          requestId,
          finishedAt: nowIso(),
        });
        return;
      }

      const messageText = error instanceof Error ? error.message : 'Unknown Gemini error';
      emitEvent({
        type: 'chat.error',
        requestId,
        message: messageText,
        finishedAt: nowIso(),
      });
    } finally {
      this.approvalRegistry.clearRequestState(requestId);
      this.activeAbortControllers.delete(requestId);
    }
  }

  private shouldUseNativeAnthropic(config: AppConfig): boolean {
    if (config.providerId !== 'anthropic') {
      return false;
    }

    const provider = getProviderPreset(config.providerId);
    return normalizeBaseUrl(resolveBaseUrl(config.providerId, config.baseUrl)) === normalizeBaseUrl(provider.baseUrl);
  }

  private shouldUseNativeGemini(config: AppConfig): boolean {
    if (config.providerId !== 'gemini') {
      return false;
    }

    const provider = getProviderPreset(config.providerId);
    return normalizeBaseUrl(resolveBaseUrl(config.providerId, config.baseUrl)) === normalizeBaseUrl(provider.baseUrl);
  }

  private createToolDefinitions(requestId: string, context: ToolContext, emitEvent: EmitEvent): GenericToolDefinition[] {
    let toolCounter = 0;

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

    const definitions: GenericToolDefinition[] = [
      {
        name: 'read_file',
        description: 'Read the UTF-8 text contents of a file from disk.',
        inputSchema: {
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
        execute: (args: unknown) => runInstrumentedTool('read_file', args as ReadFileArgs, readFileTool),
      },
      {
        name: 'write_file',
        description: 'Create or overwrite a UTF-8 text file on disk.',
        inputSchema: {
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
        execute: (args: unknown) => runInstrumentedTool('write_file', args as WriteFileArgs, writeFileTool),
      },
      {
        name: 'execute_terminal',
        description: 'Run a terminal command. Use it for builds, tests, inspections, package installs, git commands, or scripts.',
        inputSchema: {
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
        execute: (args: unknown) => runInstrumentedTool('execute_terminal', args as ExecuteTerminalArgs, executeTerminalTool),
      },
      {
        name: 'spawn_subtask',
        description:
          'Create a bounded parallel subtask when a piece of work should continue independently from the current task. Always keep the scope explicit and narrow.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short readable title for the child task.',
            },
            prompt: {
              type: 'string',
              description: 'Self-contained task prompt for the child agent.',
            },
            scope: {
              type: 'string',
              description: 'One-sentence boundary describing what the child task should focus on and avoid.',
            },
          },
          required: ['title', 'prompt', 'scope'],
          additionalProperties: false,
        },
        execute: async (args: unknown) =>
          runInstrumentedTool('spawn_subtask', args as SpawnSubtaskArgs, async (input) => {
            const title = input.title.trim();
            const prompt = input.prompt.trim();
            const scope = input.scope.trim();

            if (!title || !prompt || !scope) {
              throw new Error('spawn_subtask requires non-empty title, prompt, and scope.');
            }

            emitEvent({
              type: 'task.spawn-requested',
              requestId,
              title,
              prompt,
              scope,
              requestedAt: nowIso(),
            });

            return safeJson({
              status: 'queued',
              title,
              scope,
            });
          }),
      },
    ];

    if (this.automationTooling) {
      definitions.push(
        {
          name: 'list_automations',
          description: 'List all saved recurring automations.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          execute: async () =>
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
        {
          name: 'create_automation',
          description: 'Create a recurring automation that can run later without additional context.',
          inputSchema: {
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
          execute: async (args: unknown) => safeJson(await this.automationTooling!.createAutomation(args as CreateAutomationInput)),
        },
        {
          name: 'update_automation',
          description: 'Update an existing automation. You can rename it, pause/resume it, or adjust its schedule.',
          inputSchema: {
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
          execute: async (args: unknown) => safeJson(await this.automationTooling!.updateAutomation(args as UpdateAutomationInput)),
        },
        {
          name: 'delete_automation',
          description: 'Delete an automation permanently.',
          inputSchema: {
            type: 'object',
            properties: {
              automationId: { type: 'string' },
            },
            required: ['automationId'],
            additionalProperties: false,
          },
          execute: async (args: unknown) => {
            const automationId = (args as { automationId: string }).automationId;
            await this.automationTooling!.deleteAutomation(automationId);
            return 'Automation deleted.';
          },
        },
        {
          name: 'run_automation',
          description: 'Run an automation immediately without waiting for its next schedule.',
          inputSchema: {
            type: 'object',
            properties: {
              automationId: { type: 'string' },
            },
            required: ['automationId'],
            additionalProperties: false,
          },
          execute: async (args: unknown) => {
            const automationId = (args as { automationId: string }).automationId;
            return safeJson(await this.automationTooling!.runAutomation(automationId));
          },
        },
      );
    }

    return definitions;
  }

  private toAnthropicMessages(messages: ChatCompletionMessageParam[]): Anthropic.MessageParam[] {
    return messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role,
        content: stringifyContent(message.content),
      }))
      .filter((message) => message.content.trim().length > 0);
  }

  private toGeminiContents(messages: ChatCompletionMessageParam[]): Content[] {
    return messages.flatMap((message) => {
      const content = stringifyContent(message.content);
      if (!content.trim()) {
        return [];
      }

      if (message.role === 'user') {
        return [createUserContent(content)];
      }

      if (message.role === 'assistant') {
        return [createModelContent(content)];
      }

      return [];
    });
  }

  private createStoredToolMessage(requestId: string, toolName: string, content: string): ChatCompletionMessageParam {
    return {
      role: 'tool',
      tool_call_id: `${requestId}:${toolName}:${Date.now()}`,
      content,
    };
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

  private async requestToolApproval(
    requestId: string,
    input: {
      toolName: string;
      argumentsText: string;
      violation: ToolPolicyViolation;
    },
    emitEvent: EmitEvent,
  ): Promise<{ approved: boolean; scope?: ToolApprovalScope }> {
    if (this.approvalRegistry.isUnsafeAutoApproveEnabled(requestId)) {
      return {
        approved: true,
        scope: 'unsafe-run',
      };
    }

    const approval: ToolApprovalRequestRecord = {
      id: createId(),
      requestId,
      source: requestId.startsWith('automation:') ? 'automation' : 'chat',
      toolName: input.toolName,
      policyKey: input.violation.policyKey,
      argumentsText: input.argumentsText,
      reason: input.violation.reason,
      requestedAt: nowIso(),
      scopeOptions: canPersistApprovalForPolicyKey(input.violation.policyKey)
        ? ['once', 'request', 'always', 'unsafe-run']
        : ['once', 'request', 'unsafe-run'],
    };

    const resolution = await this.approvalRegistry.register({
      requestId,
      approval,
      emitEvent,
    });

    return {
      approved: resolution.approved,
      scope: resolution.scope,
    };
  }
}
