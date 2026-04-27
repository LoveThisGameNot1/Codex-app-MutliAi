import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';
import { DEFAULT_TOOL_POLICY } from '../shared/tool-policy';
import { createPromptHookInput, HookService } from './hook-service';

describe('HookService', () => {
  it('runs prompt hooks in order and records successful execution', async () => {
    const records: string[] = [];
    const service = new HookService();
    const result = await service.applyPromptHooks(
      createPromptHookInput({
        requestId: 'request-1',
        config: {
          providerId: DEFAULT_PROVIDER_ID,
          baseUrl: DEFAULT_BASE_URL,
          apiKey: '',
          model: DEFAULT_MODEL,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          toolPolicy: DEFAULT_TOOL_POLICY,
        },
        workingDirectory: 'C:/workspace',
        systemPrompt: 'Base prompt',
        message: 'Build the feature',
      }),
      (record) => records.push(`${record.stage}:${record.hookId}:${record.status}`),
    );

    expect(result.systemPrompt).toContain('Hook context:');
    expect(result.systemPrompt).toContain('Provider/model: openai/gpt-5.4');
    expect(result.message).toBe('Build the feature');
    expect(records).toEqual(['prompt.beforeSend:builtin.prompt.run-context:completed']);
  });

  it('blocks unsafe tool arguments before execution', async () => {
    const records: string[] = [];
    const service = new HookService();

    await expect(
      service.applyToolBeforeHooks(
        {
          requestId: 'request-2',
          toolName: 'execute_terminal',
          args: { command: 'echo safe\u0000unsafe' },
          argumentsText: '{"command":"echo safe"}',
          workingDirectory: 'C:/workspace',
        },
        (record) => records.push(`${record.stage}:${record.status}:${record.detail}`),
      ),
    ).rejects.toThrow('Tool argument guard blocked execution: execute_terminal command contains control characters.');

    expect(records).toHaveLength(1);
    expect(records[0]).toContain('tool.beforeExecute:failed:execute_terminal command contains control characters.');
  });

  it('records after-tool and post-run hooks without mutating output', async () => {
    const records: string[] = [];
    const service = new HookService();

    await service.applyToolAfterHooks(
      {
        requestId: 'request-3',
        toolName: 'read_file',
        args: { path: 'README.md' },
        argumentsText: '{"path":"README.md"}',
        workingDirectory: 'C:/workspace',
        status: 'completed',
        output: 'file contents',
      },
      (record) => records.push(record.detail),
    );
    await service.applyRunAfterHooks(
      {
        requestId: 'request-3',
        source: 'chat',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'completed',
        content: 'Done',
        toolCount: 1,
      },
      (record) => records.push(record.detail),
    );

    expect(records).toEqual([
      'read_file finished with status completed; 13 output bytes recorded.',
      'Run completed; 1 tools used; 4 response characters.',
    ]);
  });
});
