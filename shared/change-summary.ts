import type { AutomationRunRecord } from './contracts';

const DEFAULT_SUMMARY_LIMIT = 280;

type SummaryContentPart = {
  type?: string;
  text?: string;
};

export type SummaryChatMessage = {
  role: 'developer' | 'system' | 'user' | 'assistant' | 'tool';
  content: string | SummaryContentPart[];
};

export type SessionResumeSummaryInput = {
  prompt: string;
  updatedAt: string;
  messages: SummaryChatMessage[];
  maxLength?: number;
};

export type AutomationChangeSummaryInput = {
  currentRun: Pick<AutomationRunRecord, 'status' | 'summary' | 'startedAt' | 'finishedAt'>;
  previousRun?: Pick<AutomationRunRecord, 'status' | 'summary' | 'startedAt' | 'finishedAt'> | null;
  maxLength?: number;
};

const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

const truncate = (input: string, maxLength: number): string => {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const stringifyContent = (content: SummaryChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('');
};

const stripArtifactBlocks = (input: string): string =>
  input.replace(/<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi, '[artifact]');

const summarizeMessage = (message: SummaryChatMessage | undefined): string =>
  message ? collapseWhitespace(stripArtifactBlocks(stringifyContent(message.content))) : '';

const latestMessageByRole = (messages: SummaryChatMessage[], role: SummaryChatMessage['role']): SummaryChatMessage | undefined =>
  [...messages].reverse().find((message) => message.role === role && summarizeMessage(message));

const latestVisibleMessage = (messages: SummaryChatMessage[]): SummaryChatMessage | undefined =>
  [...messages]
    .reverse()
    .find(
      (message) =>
        message.role !== 'developer' &&
        message.role !== 'system' &&
        summarizeMessage(message),
    );

const countArtifacts = (messages: SummaryChatMessage[]): number =>
  messages.reduce((count, message) => {
    if (message.role !== 'assistant') {
      return count;
    }

    return count + (stringifyContent(message.content).match(/<artifact\b/gi)?.length ?? 0);
  }, 0);

const summarizeRun = (
  run: Pick<AutomationRunRecord, 'status' | 'summary' | 'startedAt' | 'finishedAt'>,
): string => {
  const timestamp = run.finishedAt ?? run.startedAt;
  const detail = collapseWhitespace(run.summary);
  return `${run.status}${timestamp ? ` at ${timestamp}` : ''}: ${detail || 'No summary recorded.'}`;
};

export const buildSessionResumeSummary = ({
  prompt,
  updatedAt,
  messages,
  maxLength = DEFAULT_SUMMARY_LIMIT,
}: SessionResumeSummaryInput): string => {
  const userMessage = latestMessageByRole(messages, 'user');
  const assistantMessage = latestMessageByRole(messages, 'assistant');
  const toolMessage = latestMessageByRole(messages, 'tool');
  const fallbackMessage = latestVisibleMessage(messages);
  const fallback = collapseWhitespace(prompt) || summarizeMessage(fallbackMessage) || 'No visible messages yet.';
  const artifactCount = countArtifacts(messages);
  const segments = [
    `Last active ${updatedAt} with ${messages.length} stored messages.`,
    `Latest user: ${summarizeMessage(userMessage) || fallback}`,
    `Latest assistant: ${summarizeMessage(assistantMessage) || 'No assistant reply recorded.'}`,
  ];

  if (toolMessage) {
    segments.push(`Latest tool result: ${summarizeMessage(toolMessage)}`);
  }

  if (artifactCount > 0) {
    segments.push(`${artifactCount} artifact${artifactCount === 1 ? '' : 's'} captured.`);
  }

  return truncate(segments.join(' '), maxLength);
};

export const buildAutomationChangeSummary = ({
  currentRun,
  previousRun,
  maxLength = DEFAULT_SUMMARY_LIMIT,
}: AutomationChangeSummaryInput): string => {
  const currentDetail = summarizeRun(currentRun);

  if (!previousRun) {
    return truncate(`First recorded run. Current ${currentDetail}`, maxLength);
  }

  const previousDetail = summarizeRun(previousRun);
  const previousSummary = collapseWhitespace(previousRun.summary);
  const currentSummary = collapseWhitespace(currentRun.summary);

  if (previousRun.status !== currentRun.status) {
    return truncate(`Status changed since last run. Previous ${previousDetail}. Current ${currentDetail}`, maxLength);
  }

  if (previousSummary === currentSummary) {
    return truncate(`No material summary change since last run. Current ${currentDetail}`, maxLength);
  }

  return truncate(`Output changed since last run. Previous ${previousDetail}. Current ${currentDetail}`, maxLength);
};
