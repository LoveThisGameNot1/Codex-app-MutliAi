import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AppConfigUpdate,
  ApplyProviderProfileInput,
  ProviderProfileRecord,
  SaveProviderProfileInput,
} from '../shared/contracts';
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../shared/contracts';
import { getProviderPreset, resolveBaseUrl } from '../shared/provider-presets';

const MAX_PROVIDER_PROFILES = 24;
const MAX_PROFILE_NAME_LENGTH = 80;

type StoredProviderProfile = {
  id: string;
  name: string;
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readIsoString = (value: unknown, fallback: string): string => {
  const candidate = readString(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : fallback;
};

const trimToLength = (value: string, maxLength: number): string => value.trim().slice(0, maxLength);

export const maskProviderApiKey = (apiKey: string): string => {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= 8) {
    return '****';
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};

const toPublicProfile = (profile: StoredProviderProfile): ProviderProfileRecord => {
  const preset = getProviderPreset(profile.providerId);

  return {
    id: profile.id,
    name: profile.name,
    providerId: preset.id,
    providerLabel: preset.label,
    baseUrl: profile.baseUrl,
    model: profile.model,
    systemPrompt: profile.systemPrompt,
    apiKeyMasked: maskProviderApiKey(profile.apiKey),
    hasApiKey: Boolean(profile.apiKey.trim()),
    isDefault: profile.isDefault,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedAt: profile.lastUsedAt,
  };
};

const compareProfiles = (left: StoredProviderProfile, right: StoredProviderProfile): number => {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
};

export class ProviderProfileStore {
  private readonly filePath: string;

  public constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'provider-profiles.json');
  }

  public async list(): Promise<ProviderProfileRecord[]> {
    const profiles = await this.loadAll();
    return profiles.sort(compareProfiles).map(toPublicProfile);
  }

  public async save(input: SaveProviderProfileInput): Promise<ProviderProfileRecord> {
    const profiles = await this.loadAll();
    const now = new Date().toISOString();
    const existingIndex = input.id ? profiles.findIndex((profile) => profile.id === input.id) : -1;
    const existing = existingIndex >= 0 ? profiles[existingIndex] : null;

    if (!existing && profiles.length >= MAX_PROVIDER_PROFILES) {
      throw new Error(`Provider profile limit reached (${MAX_PROVIDER_PROFILES}). Delete an old profile first.`);
    }

    const name = trimToLength(input.name, MAX_PROFILE_NAME_LENGTH);
    if (!name) {
      throw new Error('Provider profile name is required.');
    }

    const preset = getProviderPreset(input.providerId);
    const model = input.model.trim() || preset.suggestedModel || DEFAULT_MODEL;
    const systemPrompt =
      input.systemPrompt !== undefined
        ? input.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT
        : existing?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const apiKey = input.apiKey !== undefined ? input.apiKey.trim() : existing?.apiKey ?? '';
    const shouldBeDefault = Boolean(input.setDefault || profiles.length === 0);
    const nextProfile: StoredProviderProfile = {
      id: existing?.id ?? randomUUID(),
      name,
      providerId: preset.id,
      baseUrl: resolveBaseUrl(preset.id, input.baseUrl),
      apiKey,
      model,
      systemPrompt,
      isDefault: shouldBeDefault || Boolean(existing?.isDefault),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastUsedAt: existing?.lastUsedAt,
    };

    const nextProfiles = profiles.map((profile) => ({
      ...profile,
      isDefault: nextProfile.isDefault ? false : profile.isDefault,
    }));

    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = nextProfile;
    } else {
      nextProfiles.push(nextProfile);
    }

    await this.writeAll(this.ensureSingleDefault(nextProfiles));
    return toPublicProfile(nextProfile);
  }

  public async apply(input: ApplyProviderProfileInput): Promise<AppConfigUpdate> {
    const profiles = await this.loadAll();
    const profileIndex = profiles.findIndex((profile) => profile.id === input.id);
    if (profileIndex < 0) {
      throw new Error('Provider profile not found.');
    }

    const profile = profiles[profileIndex];
    const now = new Date().toISOString();
    profiles[profileIndex] = {
      ...profile,
      lastUsedAt: now,
      updatedAt: now,
    };
    await this.writeAll(this.ensureSingleDefault(profiles));

    return {
      providerId: profile.providerId,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
      systemPrompt: profile.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    };
  }

  public async delete(profileId: string): Promise<void> {
    const profiles = await this.loadAll();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      return;
    }

    await this.writeAll(this.ensureSingleDefault(nextProfiles));
  }

  private async loadAll(): Promise<StoredProviderProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return this.ensureSingleDefault(parsed.flatMap((item) => {
        const normalized = this.normalizeStoredProfile(item);
        return normalized ? [normalized] : [];
      }));
    } catch {
      return [];
    }
  }

  private normalizeStoredProfile(value: unknown): StoredProviderProfile | null {
    if (!isRecord(value)) {
      return null;
    }

    const id = readString(value.id)?.trim();
    const rawName = readString(value.name)?.trim();
    const rawProviderId = readString(value.providerId)?.trim();
    const now = new Date().toISOString();
    if (!id || !rawName || !rawProviderId) {
      return null;
    }

    const preset = getProviderPreset(rawProviderId);
    const baseUrl = resolveBaseUrl(preset.id, readString(value.baseUrl));
    const model = readString(value.model)?.trim() || preset.suggestedModel || DEFAULT_MODEL;
    const systemPrompt = readString(value.systemPrompt)?.trim() || DEFAULT_SYSTEM_PROMPT;
    const createdAt = readIsoString(value.createdAt, now);
    const updatedAt = readIsoString(value.updatedAt, createdAt);
    const lastUsedAt = readString(value.lastUsedAt);

    return {
      id,
      name: trimToLength(rawName, MAX_PROFILE_NAME_LENGTH),
      providerId: preset.id,
      baseUrl,
      apiKey: readString(value.apiKey)?.trim() ?? '',
      model,
      systemPrompt,
      isDefault: value.isDefault === true,
      createdAt,
      updatedAt,
      lastUsedAt: lastUsedAt && !Number.isNaN(Date.parse(lastUsedAt)) ? lastUsedAt : undefined,
    };
  }

  private ensureSingleDefault(profiles: StoredProviderProfile[]): StoredProviderProfile[] {
    if (profiles.length === 0) {
      return [];
    }

    const firstDefaultIndex = profiles.findIndex((profile) => profile.isDefault);
    if (firstDefaultIndex < 0) {
      return profiles.map((profile, index) => ({
        ...profile,
        isDefault: index === 0,
      }));
    }

    return profiles.map((profile, index) => ({
      ...profile,
      isDefault: index === firstDefaultIndex,
    }));
  }

  private async writeAll(profiles: StoredProviderProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(profiles.sort(compareProfiles), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
