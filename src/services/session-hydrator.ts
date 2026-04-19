import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ArtifactRecord, ChatMessage, PersistedSessionPayload, ToolExecutionRecord } from '../../shared/contracts';
import { ArtifactStreamParser } from './artifact-stream-parser';

const nowIso = (): string => new Date().toISOString();

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

const parseAssistantArtifacts = (
  sourceMessageId: string,
  content: string,
): { plainText: string; artifacts: ArtifactRecord[] } => {
  const artifacts: ArtifactRecord[] = [];
  let plainText = '';

  const parser = new ArtifactStreamParser({
    onText: (text) => {
      plainText += text;
    },
    onArtifactOpen: (payload) => {
      artifacts.unshift({
        ...payload,
        content: '',
        status: 'complete',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        sourceMessageId,
      });
    },
    onArtifactDelta: (artifactId, delta) => {
      const artifact = artifacts.find((item) => item.id === artifactId);
      if (artifact) {
        artifact.content += delta;
        artifact.updatedAt = nowIso();
      }
    },
    onArtifactClose: (artifactId) => {
      const artifact = artifacts.find((item) => item.id === artifactId);
      if (artifact) {
        artifact.status = 'complete';
        artifact.updatedAt = nowIso();
      }
    },
  });

  parser.push(content);
  parser.finish();

  return {
    plainText: plainText.trim() ? plainText : plainText,
    artifacts: [...artifacts].reverse(),
  };
};

export const hydratePersistedSession = (session: PersistedSessionPayload): {
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
  toolExecutions: ToolExecutionRecord[];
} => {
  const messages: ChatMessage[] = [];
  const artifacts: ArtifactRecord[] = [];
  const toolExecutions: ToolExecutionRecord[] = [];

  session.messages.forEach((message, index) => {
    if (message.role === 'developer') {
      return;
    }

    const id = `${session.id}:${index}:${createId()}`;
    const createdAt = session.updatedAt;

    if (message.role === 'assistant') {
      const content = stringifyContent(message.content);
      if (!content) {
        return;
      }

      const parsed = parseAssistantArtifacts(id, content);
      messages.push({
        id,
        role: 'assistant',
        content: parsed.plainText,
        createdAt,
        status: 'complete',
      });
      artifacts.push(...parsed.artifacts);
      return;
    }

    if (message.role === 'user') {
      messages.push({
        id,
        role: 'user',
        content: stringifyContent(message.content),
        createdAt,
        status: 'complete',
      });
      return;
    }

    if (message.role === 'tool') {
      const toolExecutionId = `${id}:tool`;
      const toolName = 'tool result';
      const output = stringifyContent(message.content);
      toolExecutions.unshift({
        id: toolExecutionId,
        name: toolName,
        argumentsText: '',
        output,
        status: 'completed',
        startedAt: createdAt,
        finishedAt: createdAt,
      });
      messages.push({
        id,
        role: 'tool',
        content: `${toolName} completed\n\n${output}`,
        createdAt,
        status: 'complete',
        toolExecutionId,
      });
    }
  });

  return {
    messages,
    artifacts,
    toolExecutions,
  };
};