import type { AppConfig, HookExecutionRecord, HookStage } from '../shared/contracts';

type HookFailureMode = 'continue' | 'block';
type HookObserver = (record: HookExecutionRecord) => void;

export type PromptHookInput = {
  requestId: string;
  source: 'chat' | 'automation';
  providerId: string;
  model: string;
  workingDirectory: string;
  systemPrompt: string;
  message: string;
};

export type PromptHookResult = {
  systemPrompt: string;
  message: string;
};

export type ToolBeforeHookInput = {
  requestId: string;
  toolName: string;
  args: unknown;
  argumentsText: string;
  workingDirectory: string;
};

export type ToolBeforeHookResult = {
  args: unknown;
};

export type ToolAfterHookInput = ToolBeforeHookInput & {
  status: 'completed' | 'failed';
  output?: string;
  errorMessage?: string;
};

export type RunAfterHookInput = {
  requestId: string;
  source: 'chat' | 'automation';
  providerId: string;
  model: string;
  status: 'completed' | 'failed' | 'cancelled';
  content?: string;
  errorMessage?: string;
  toolCount: number;
};

type HookDefinition<TInput, TResult> = {
  id: string;
  name: string;
  stage: HookStage;
  failureMode: HookFailureMode;
  run: (input: TInput) => Promise<TResult> | TResult;
  describeSuccess: (result: TResult, input: TInput) => string;
};

const nowIso = (): string => new Date().toISOString();

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getStringProperty = (value: unknown, key: string): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return '';
  }

  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'string' ? item : '';
};

const hasControlCharacters = (value: string): boolean => /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);

const appendPromptBlock = (prompt: string, block: string): string => `${prompt.trim()}\n\n${block.trim()}`;

const runSource = (requestId: string): 'chat' | 'automation' => (requestId.startsWith('automation:') ? 'automation' : 'chat');

export class HookService {
  private readonly promptHooks: Array<HookDefinition<PromptHookInput, PromptHookResult>>;
  private readonly toolBeforeHooks: Array<HookDefinition<ToolBeforeHookInput, ToolBeforeHookResult>>;
  private readonly toolAfterHooks: Array<HookDefinition<ToolAfterHookInput, ToolAfterHookInput>>;
  private readonly runAfterHooks: Array<HookDefinition<RunAfterHookInput, RunAfterHookInput>>;

  public constructor() {
    this.promptHooks = [
      {
        id: 'builtin.prompt.run-context',
        name: 'Run context injector',
        stage: 'prompt.beforeSend',
        failureMode: 'continue',
        run: (input) => ({
          ...input,
          systemPrompt: appendPromptBlock(
            input.systemPrompt,
            [
              'Hook context:',
              `- Run source: ${input.source}`,
              `- Request id: ${input.requestId}`,
              `- Provider/model: ${input.providerId}/${input.model}`,
              `- Working directory: ${input.workingDirectory}`,
              '- If the task is broad, keep the execution plan visible and update it when facts change.',
            ].join('\n'),
          ),
        }),
        describeSuccess: () => 'Injected run context into the system prompt.',
      },
    ];

    this.toolBeforeHooks = [
      {
        id: 'builtin.tool.argument-guard',
        name: 'Tool argument guard',
        stage: 'tool.beforeExecute',
        failureMode: 'block',
        run: (input) => {
          if (!input.toolName.trim()) {
            throw new Error('Tool name is empty.');
          }

          if (input.argumentsText.length > 120_000) {
            throw new Error('Tool arguments are too large for safe execution.');
          }

          if (input.toolName === 'read_file' || input.toolName === 'write_file') {
            const targetPath = getStringProperty(input.args, 'path').trim();
            if (!targetPath) {
              throw new Error(`${input.toolName} requires a non-empty path.`);
            }
            if (hasControlCharacters(targetPath)) {
              throw new Error(`${input.toolName} path contains control characters.`);
            }
          }

          if (input.toolName === 'execute_terminal') {
            const command = getStringProperty(input.args, 'command').trim();
            if (!command) {
              throw new Error('execute_terminal requires a non-empty command.');
            }
            if (hasControlCharacters(command)) {
              throw new Error('execute_terminal command contains control characters.');
            }
          }

          return { args: input.args };
        },
        describeSuccess: (_result, input) => `${input.toolName} arguments passed validation.`,
      },
    ];

    this.toolAfterHooks = [
      {
        id: 'builtin.tool.result-audit',
        name: 'Tool result audit',
        stage: 'tool.afterExecute',
        failureMode: 'continue',
        run: (input) => input,
        describeSuccess: (_result, input) => {
          const outputBytes = Buffer.byteLength(input.output ?? input.errorMessage ?? '', 'utf8');
          return `${input.toolName} finished with status ${input.status}; ${outputBytes} output bytes recorded.`;
        },
      },
    ];

    this.runAfterHooks = [
      {
        id: 'builtin.run.summary',
        name: 'Post-run summary',
        stage: 'run.afterComplete',
        failureMode: 'continue',
        run: (input) => input,
        describeSuccess: (_result, input) => {
          const outputCharacters = input.content?.length ?? 0;
          const failure = input.errorMessage ? ` Error: ${input.errorMessage}` : '';
          return `Run ${input.status}; ${input.toolCount} tools used; ${outputCharacters} response characters.${failure}`;
        },
      },
    ];
  }

  public async applyPromptHooks(
    input: Omit<PromptHookInput, 'source'> & { source?: 'chat' | 'automation' },
    observer?: HookObserver,
  ): Promise<PromptHookResult> {
    let current: PromptHookResult = {
      systemPrompt: input.systemPrompt,
      message: input.message,
    };
    const baseInput: PromptHookInput = {
      ...input,
      source: input.source ?? runSource(input.requestId),
      systemPrompt: current.systemPrompt,
      message: current.message,
    };

    for (const hook of this.promptHooks) {
      const result = await this.runHook(
        hook,
        {
          ...baseInput,
          systemPrompt: current.systemPrompt,
          message: current.message,
        },
        observer,
      );
      if (result) {
        current = result;
      }
    }

    return current;
  }

  public async applyToolBeforeHooks(input: ToolBeforeHookInput, observer?: HookObserver): Promise<ToolBeforeHookResult> {
    let current: ToolBeforeHookResult = { args: input.args };

    for (const hook of this.toolBeforeHooks) {
      const result = await this.runHook(
        hook,
        {
          ...input,
          args: current.args,
          argumentsText: safeJson(current.args),
        },
        observer,
      );
      if (result) {
        current = result;
      }
    }

    return current;
  }

  public async applyToolAfterHooks(input: ToolAfterHookInput, observer?: HookObserver): Promise<void> {
    for (const hook of this.toolAfterHooks) {
      await this.runHook(hook, input, observer);
    }
  }

  public async applyRunAfterHooks(input: RunAfterHookInput, observer?: HookObserver): Promise<void> {
    for (const hook of this.runAfterHooks) {
      await this.runHook(hook, input, observer);
    }
  }

  private async runHook<TInput, TResult>(
    hook: HookDefinition<TInput, TResult>,
    input: TInput,
    observer?: HookObserver,
  ): Promise<TResult | null> {
    const startedAt = nowIso();
    try {
      const result = await hook.run(input);
      observer?.({
        id: createId(),
        requestId: (input as { requestId?: string }).requestId ?? 'unknown',
        hookId: hook.id,
        hookName: hook.name,
        stage: hook.stage,
        status: 'completed',
        detail: hook.describeSuccess(result, input),
        startedAt,
        finishedAt: nowIso(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown hook failure.';
      observer?.({
        id: createId(),
        requestId: (input as { requestId?: string }).requestId ?? 'unknown',
        hookId: hook.id,
        hookName: hook.name,
        stage: hook.stage,
        status: 'failed',
        detail: message,
        startedAt,
        finishedAt: nowIso(),
      });

      if (hook.failureMode === 'block') {
        throw new Error(`${hook.name} blocked execution: ${message}`);
      }

      return null;
    }
  }
}

export const createPromptHookInput = (input: {
  requestId: string;
  config: AppConfig;
  workingDirectory: string;
  systemPrompt: string;
  message: string;
}): PromptHookInput => ({
  requestId: input.requestId,
  source: runSource(input.requestId),
  providerId: input.config.providerId,
  model: input.config.model,
  workingDirectory: input.workingDirectory,
  systemPrompt: input.systemPrompt,
  message: input.message,
});
