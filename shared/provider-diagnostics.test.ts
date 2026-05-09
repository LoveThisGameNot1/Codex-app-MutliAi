import { describe, expect, it } from 'vitest';
import type { AppConfig, ModelCatalogResult } from './contracts';
import { inferModelCapabilities } from './model-capabilities';
import { buildProviderDiagnostics } from './provider-diagnostics';
import { DEFAULT_SYSTEM_PROMPT } from './contracts';
import { DEFAULT_TOOL_POLICY } from './tool-policy';

const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  providerId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-5.4',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  toolPolicy: DEFAULT_TOOL_POLICY,
  ...overrides,
});

describe('buildProviderDiagnostics', () => {
  it('blocks hosted providers when no required API key is configured', () => {
    const config = createConfig();
    const result = buildProviderDiagnostics(config, inferModelCapabilities(config.providerId, config.model, config.baseUrl), null);

    expect(result.overallStatus).toBe('blocked');
    expect(result.checks.find((check) => check.id === 'auth')?.status).toBe('blocked');
    expect(result.checks.find((check) => check.id === 'consumer-plan')?.detail).toContain('ChatGPT Plus/Pro');
  });

  it('treats local Ollama endpoints as auth-ready but warns on tool calling', () => {
    const config = createConfig({
      providerId: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder:14b',
    });
    const result = buildProviderDiagnostics(config, inferModelCapabilities(config.providerId, config.model, config.baseUrl), null);

    expect(result.checks.find((check) => check.id === 'auth')?.status).toBe('ready');
    expect(result.checks.find((check) => check.id === 'tool-calling')?.status).toBe('warning');
    expect(result.overallStatus).toBe('warning');
  });

  it('marks a provider ready when live discovery and capabilities line up', () => {
    const config = createConfig({ apiKey: 'sk-test' });
    const capabilities = inferModelCapabilities(config.providerId, config.model, config.baseUrl);
    const catalog: ModelCatalogResult = {
      providerId: 'openai',
      providerLabel: 'OpenAI',
      baseUrl: config.baseUrl,
      source: 'live',
      fetchedAt: '2026-05-09T14:00:00.000Z',
      models: [
        {
          id: config.model,
          capabilities,
        },
      ],
    };

    const result = buildProviderDiagnostics(config, capabilities, catalog);
    expect(result.overallStatus).toBe('ready');
    expect(result.checks.every((check) => check.status === 'ready')).toBe(true);
  });
});
