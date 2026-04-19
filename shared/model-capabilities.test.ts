import { describe, expect, it } from 'vitest';
import { inferDiscoveredModelCapabilities, inferModelCapabilities } from './model-capabilities';

describe('inferModelCapabilities', () => {
  it('marks official Anthropic Claude models as native and supported', () => {
    const result = inferModelCapabilities('anthropic', 'claude-sonnet-4-20250514', 'https://api.anthropic.com/v1/');

    expect(result.transport).toBe('native');
    expect(result.streaming).toBe('supported');
    expect(result.toolCalling).toBe('supported');
    expect(result.recommendedForAgent).toBe(true);
  });

  it('downgrades Ollama tool calling confidence for local models', () => {
    const result = inferModelCapabilities('ollama', 'qwen2.5-coder:14b', 'http://localhost:11434/v1');

    expect(result.streaming).toBe('likely');
    expect(result.toolCalling).toBe('limited');
    expect(result.recommendedForAgent).toBe(false);
  });

  it('flags non-chat model families as weak for the agent workflow', () => {
    const result = inferModelCapabilities('openai', 'text-embedding-3-large', 'https://api.openai.com/v1');

    expect(result.streaming).toBe('limited');
    expect(result.toolCalling).toBe('limited');
    expect(result.recommendedForAgent).toBe(false);
  });

  it('treats OpenRouter models as gateway dependent', () => {
    const result = inferModelCapabilities('openrouter', 'anthropic/claude-3.7-sonnet', 'https://openrouter.ai/api/v1');

    expect(result.transport).toBe('gateway-unknown');
    expect(result.streaming).toBe('likely');
    expect(result.toolCalling).toBe('likely');
  });

  it('upgrades OpenRouter tool calling when provider metadata confirms tools support', () => {
    const result = inferDiscoveredModelCapabilities('openrouter', 'openai/gpt-4o-mini', 'https://openrouter.ai/api/v1', {
      supportedParameters: ['tools', 'tool_choice', 'max_tokens'],
      outputModalities: ['text'],
      sourceLabel: 'OpenRouter models supported_parameters',
    });

    expect(result.toolCalling).toBe('supported');
    expect(result.streaming).toBe('likely');
    expect(result.notes.some((note) => note.includes('Provider metadata source'))).toBe(true);
  });

  it('downgrades Gemini models that lack generateContent in provider metadata', () => {
    const result = inferDiscoveredModelCapabilities('gemini', 'embedding-001', 'https://generativelanguage.googleapis.com/v1beta/openai/', {
      supportedGenerationMethods: ['embedContent'],
      sourceLabel: 'Gemini models.list supportedGenerationMethods',
    });

    expect(result.streaming).toBe('limited');
    expect(result.toolCalling).toBe('limited');
    expect(result.recommendedForAgent).toBe(false);
  });
});
