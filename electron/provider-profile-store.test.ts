import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderProfileStore, maskProviderApiKey } from './provider-profile-store';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexapp-provider-profiles-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('maskProviderApiKey', () => {
  it('masks empty, short, and long provider keys', () => {
    expect(maskProviderApiKey('')).toBe('');
    expect(maskProviderApiKey('abc123')).toBe('****');
    expect(maskProviderApiKey('sk-test-1234567890')).toBe('sk-t...7890');
  });
});

describe('ProviderProfileStore', () => {
  it('persists provider profiles without exposing raw API keys in public records', async () => {
    const baseDir = await createTempDir();
    const store = new ProviderProfileStore(baseDir);

    const saved = await store.save({
      name: 'OpenAI work',
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-live-1234567890',
      model: 'gpt-5.4',
      systemPrompt: 'Use the local workspace.',
      setDefault: true,
    });

    expect(saved.name).toBe('OpenAI work');
    expect(saved.providerLabel).toBe('OpenAI');
    expect(saved.apiKeyMasked).toBe('sk-l...7890');
    expect(saved.hasApiKey).toBe(true);
    expect(saved).not.toHaveProperty('apiKey');

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.apiKeyMasked).toBe('sk-l...7890');
    expect(listed[0]).not.toHaveProperty('apiKey');
  });

  it('keeps a single default profile when another profile is saved as preferred', async () => {
    const baseDir = await createTempDir();
    const store = new ProviderProfileStore(baseDir);

    await store.save({
      name: 'Primary',
      providerId: 'openai',
      baseUrl: '',
      apiKey: 'openai-key',
      model: 'gpt-5.4',
      setDefault: true,
    });
    const secondary = await store.save({
      name: 'Local Ollama',
      providerId: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      model: 'qwen2.5-coder:14b',
      setDefault: true,
    });

    const listed = await store.list();
    expect(listed).toHaveLength(2);
    expect(listed.filter((profile) => profile.isDefault)).toHaveLength(1);
    expect(listed[0]?.id).toBe(secondary.id);
    expect(listed[0]?.providerLabel).toBe('Ollama');
  });

  it('returns raw config updates only when applying a profile and marks it as used', async () => {
    const baseDir = await createTempDir();
    const store = new ProviderProfileStore(baseDir);

    const saved = await store.save({
      name: 'DeepSeek',
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'deepseek-secret-key',
      model: 'deepseek-chat',
      systemPrompt: 'Prefer tool use.',
    });

    const update = await store.apply({ id: saved.id });
    expect(update).toEqual({
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'deepseek-secret-key',
      model: 'deepseek-chat',
      systemPrompt: 'Prefer tool use.',
    });

    const listed = await store.list();
    expect(listed[0]?.lastUsedAt).toBeTruthy();
    expect(listed[0]).not.toHaveProperty('apiKey');
  });

  it('deletes saved profiles and promotes a remaining profile to default', async () => {
    const baseDir = await createTempDir();
    const store = new ProviderProfileStore(baseDir);

    const first = await store.save({
      name: 'First',
      providerId: 'openai',
      baseUrl: '',
      apiKey: 'first-key',
      model: 'gpt-5.4',
      setDefault: true,
    });
    const second = await store.save({
      name: 'Second',
      providerId: 'anthropic',
      baseUrl: '',
      apiKey: 'second-key',
      model: 'claude-sonnet-4-20250514',
    });

    await store.delete(first.id);

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(second.id);
    expect(listed[0]?.isDefault).toBe(true);
  });
});
