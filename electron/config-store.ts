import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppConfig, AppConfigUpdate, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';

const defaultConfig = (): AppConfig => ({
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: DEFAULT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
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

      return {
        apiKey: parsed.apiKey ?? process.env.OPENAI_API_KEY ?? '',
        model: parsed.model ?? DEFAULT_MODEL,
        systemPrompt: parsed.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      };
    } catch {
      return defaultConfig();
    }
  }

  public async update(update: AppConfigUpdate): Promise<AppConfig> {
    const current = await this.get();
    const next: AppConfig = {
      ...current,
      ...update,
      model: update.model?.trim() || current.model,
      systemPrompt: update.systemPrompt?.trim() || current.systemPrompt,
      apiKey: update.apiKey !== undefined ? update.apiKey.trim() : current.apiKey,
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');

    return next;
  }
}