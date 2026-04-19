import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppConfig, AppConfigUpdate, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';
import { DEFAULT_TOOL_POLICY, normalizeToolPolicy } from '../shared/tool-policy';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PROVIDER_ID,
  getEnvApiKeyForProvider,
  getProviderPreset,
  resolveBaseUrl,
} from '../shared/provider-presets';

const defaultConfig = (): AppConfig => ({
  providerId: DEFAULT_PROVIDER_ID,
  baseUrl: DEFAULT_BASE_URL,
  apiKey: getEnvApiKeyForProvider(DEFAULT_PROVIDER_ID),
  model: DEFAULT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  toolPolicy: DEFAULT_TOOL_POLICY,
});

export class ConfigStore {
  private readonly filePath: string;

  public constructor() {
    this.filePath = path.join(app.getPath('userData'), 'config.json');
  }

  public async get(): Promise<AppConfig> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      const providerId = typeof parsed.providerId === 'string' ? parsed.providerId : DEFAULT_PROVIDER_ID;
      const preset = getProviderPreset(providerId);

      return {
        providerId: preset.id,
        baseUrl: resolveBaseUrl(preset.id, parsed.baseUrl),
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : getEnvApiKeyForProvider(preset.id),
        model: parsed.model ?? DEFAULT_MODEL,
        systemPrompt: parsed.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        toolPolicy: normalizeToolPolicy(parsed.toolPolicy),
      };
    } catch {
      return defaultConfig();
    }
  }

  public async update(update: AppConfigUpdate): Promise<AppConfig> {
    const current = await this.get();
    const providerId = typeof update.providerId === 'string' && update.providerId.trim() ? update.providerId : current.providerId;
    const next: AppConfig = {
      ...current,
      ...update,
      providerId,
      baseUrl: resolveBaseUrl(providerId, update.baseUrl ?? current.baseUrl),
      model: update.model?.trim() || current.model,
      systemPrompt: update.systemPrompt?.trim() || current.systemPrompt,
      apiKey: update.apiKey !== undefined ? update.apiKey.trim() : current.apiKey || getEnvApiKeyForProvider(providerId),
      toolPolicy: normalizeToolPolicy(update.toolPolicy ?? current.toolPolicy),
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');

    return next;
  }
}
