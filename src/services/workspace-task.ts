export type WorkspaceTaskStatus = 'idle' | 'queued' | 'running' | 'blocked' | 'failed' | 'completed';

export type WorkspaceTask = {
  id: string;
  sessionId: string;
  title: string;
  status: WorkspaceTaskStatus;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string;
  requestId: string | null;
};

const nowIso = (): string => new Date().toISOString();

export const createTaskTitleFromPrompt = (prompt: string): string => {
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return 'New task';
  }

  return trimmed.slice(0, 48);
};

export const createWorkspaceTask = (input: {
  id: string;
  workspaceSessionId: string;
  title?: string;
  createdAt?: string;
}): WorkspaceTask => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id,
    sessionId: `${input.workspaceSessionId}:task:${input.id}`,
    title: input.title?.trim() || 'New task',
    status: 'idle',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessagePreview: '',
    requestId: null,
  };
};

export const isTaskBusy = (status: WorkspaceTaskStatus): boolean =>
  status === 'queued' || status === 'running' || status === 'blocked';

export const deriveStreamingState = (
  tasks: WorkspaceTask[],
  activeTaskId: string | null,
): {
  isStreaming: boolean;
  activeRequestId: string | null;
} => ({
  isStreaming: tasks.some((task) => isTaskBusy(task.status)),
  activeRequestId: tasks.find((task) => task.id === activeTaskId)?.requestId ?? null,
});
