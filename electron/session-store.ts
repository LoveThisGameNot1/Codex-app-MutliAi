import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { buildSessionResumeSummary, type SummaryChatMessage } from '../shared/change-summary';
import type { ArtifactKind, PersistedSessionSummary } from '../shared/contracts';

const MAX_SESSIONS = 40;
const SUMMARY_TITLE_LIMIT = 80;
const SUMMARY_PREVIEW_LIMIT = 160;

export type PersistedSession = {
  id: string;
  prompt: string;
  messages: ChatCompletionMessageParam[];
  updatedAt: string;
  providerId?: string;
  providerLabel?: string;
  model?: string;
};

const sortSessions = (sessions: PersistedSession[]): PersistedSession[] =>
  [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const normalizeSession = (item: unknown): PersistedSession | null => {
  const candidate = item as Partial<PersistedSession> | null | undefined;
  if (
    typeof candidate?.id !== 'string' ||
    typeof candidate.prompt !== 'string' ||
    !Array.isArray(candidate.messages) ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    prompt: candidate.prompt,
    messages: candidate.messages,
    updatedAt: candidate.updatedAt,
    providerId: optionalString(candidate.providerId),
    providerLabel: optionalString(candidate.providerLabel),
    model: optionalString(candidate.model),
  };
};

const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

const truncate = (input: string, maxLength: number): string => {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
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

      return '';
    })
    .join('');
};

const summarizeMessage = (message: ChatCompletionMessageParam | undefined): string =>
  message ? collapseWhitespace(stringifyContent(message.content)) : '';

const artifactTypeValues: ArtifactKind[] = ['code', 'html', 'react'];

const extractArtifactTypes = (messages: ChatCompletionMessageParam[]): ArtifactKind[] => {
  const types = new Set<ArtifactKind>();

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    const content = stringifyContent(message.content);
    for (const match of content.matchAll(/<artifact\b[^>]*\btype=["']([^"']+)["'][^>]*>/gi)) {
      const type = match[1]?.trim().toLowerCase();
      if (artifactTypeValues.includes(type as ArtifactKind)) {
        types.add(type as ArtifactKind);
      }
    }
  }

  return [...types].sort();
};

const extractToolNames = (messages: ChatCompletionMessageParam[]): string[] => {
  const names = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'tool') {
      continue;
    }

    const toolCallId = (message as { tool_call_id?: unknown }).tool_call_id;
    if (typeof toolCallId === 'string') {
      const [, toolName] = toolCallId.match(/^[^:]+:([^:]+):/) ?? [];
      if (toolName) {
        names.add(toolName);
        continue;
      }
    }

    names.add('tool result');
  }

  return [...names].sort((left, right) => left.localeCompare(right));
};

const toSummaryMessages = (messages: ChatCompletionMessageParam[]): SummaryChatMessage[] =>
  messages.flatMap((message) => {
    if (
      message.role !== 'developer' &&
      message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'tool'
    ) {
      return [];
    }

    return [
      {
        role: message.role,
        content: stringifyContent(message.content),
      },
    ];
  });

export const toSessionSummary = (session: PersistedSession): PersistedSessionSummary => {
  const firstUserMessage = session.messages.find((message) => message.role === 'user');
  const latestVisibleMessage = [...session.messages]
    .reverse()
    .find((message) => message.role !== 'developer' && message.role !== 'system' && summarizeMessage(message));

  const fallback = collapseWhitespace(session.prompt) || 'Saved session';
  const title = truncate(summarizeMessage(firstUserMessage) || fallback, SUMMARY_TITLE_LIMIT);
  const preview = truncate(summarizeMessage(latestVisibleMessage) || fallback, SUMMARY_PREVIEW_LIMIT);

  return {
    id: session.id,
    prompt: session.prompt,
    title,
    preview,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    providerId: session.providerId,
    providerLabel: session.providerLabel,
    model: session.model,
    toolNames: extractToolNames(session.messages),
    artifactTypes: extractArtifactTypes(session.messages),
    resumeSummary: buildSessionResumeSummary({
      prompt: session.prompt,
      updatedAt: session.updatedAt,
      messages: toSummaryMessages(session.messages),
    }),
  };
};

export class SessionStore {
  private readonly filePath: string;

  public constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'sessions.json');
  }

  public async loadAll(): Promise<PersistedSession[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedSession[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      const sessions = parsed
        .map(normalizeSession)
        .filter((session): session is PersistedSession => Boolean(session));

      return sortSessions(sessions).slice(0, MAX_SESSIONS);
    } catch {
      return [];
    }
  }

  public async load(sessionId: string): Promise<PersistedSession | null> {
    const sessions = await this.loadAll();
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  public async upsert(session: PersistedSession): Promise<void> {
    const sessions = await this.loadAll();
    const next = sortSessions([
      {
        ...session,
        updatedAt: new Date().toISOString(),
      },
      ...sessions.filter((item) => item.id !== session.id),
    ]).slice(0, MAX_SESSIONS);

    await this.writeAll(next);
  }

  public async delete(sessionId: string): Promise<void> {
    const sessions = await this.loadAll();
    await this.writeAll(sessions.filter((session) => session.id !== sessionId));
  }

  private async writeAll(sessions: PersistedSession[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(sessions, null, 2), 'utf8');
  }
}
