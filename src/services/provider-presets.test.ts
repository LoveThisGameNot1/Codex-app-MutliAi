import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PROVIDER_ID,
  getProviderPreset,
  isApiKeyOptionalForProvider,
  LLM_PROVIDER_PRESETS,
  resolveBaseUrl,
} from '../../shared/provider-presets';

describe('provider-presets', () => {
  it('falls back to the default provider for unknown ids', () => {
    expect(getProviderPreset('missing-provider').id).toBe(DEFAULT_PROVIDER_ID);
  });

  it('resolves preset base URLs when a custom one is missing', () => {
    expect(resolveBaseUrl('openai', '')).toBe(DEFAULT_BASE_URL);
    expect(resolveBaseUrl('groq')).toBe('https://api.groq.com/openai/v1');
  });

  it('detects providers that can skip API keys', () => {
    expect(isApiKeyOptionalForProvider('ollama', 'http://localhost:11434/v1')).toBe(true);
    expect(isApiKeyOptionalForProvider('custom', 'http://127.0.0.1:8080/v1')).toBe(true);
    expect(isApiKeyOptionalForProvider('openai', DEFAULT_BASE_URL)).toBe(false);
  });

  it('includes official compatibility presets for Anthropic and Gemini', () => {
    expect(getProviderPreset('anthropic').baseUrl).toBe('https://api.anthropic.com/v1/');
    expect(getProviderPreset('gemini').baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
  });

  it('exposes quick-pick models for each provider preset', () => {
    expect(LLM_PROVIDER_PRESETS.every((preset) => preset.popularModels.length > 0)).toBe(true);
  });
});
