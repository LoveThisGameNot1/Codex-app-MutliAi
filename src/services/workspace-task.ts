export type WorkspaceTaskStatus = 'idle' | 'queued' | 'running' | 'blocked' | 'failed' | 'completed';

export type WorkspaceTask = {
  id: string;
  sessionId: string;
  title: string;
  parentTaskId: string | null;
  scopeSummary: string | null;
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
  parentTaskId?: string | null;
  scopeSummary?: string | null;
  createdAt?: string;
}): WorkspaceTask => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id,
    sessionId: `${input.workspaceSessionId}:task:${input.id}`,
    title: input.title?.trim() || 'New task',
    parentTaskId: input.parentTaskId ?? null,
    scopeSummary: input.scopeSummary?.trim() || null,
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

type RecoveryEntity = {
  taskId?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  requestedAt?: string;
};

type RecoverWorkspaceGraphInput = {
  workspaceSessionId: string;
  workspaceTasks: WorkspaceTask[];
  activeTaskId: string | null;
  messages: RecoveryEntity[];
  artifacts: RecoveryEntity[];
  toolExecutions: RecoveryEntity[];
};

type RecoverWorkspaceGraphResult = {
  workspaceTasks: WorkspaceTask[];
  activeTaskId: string | null;
};

const getLatestTimestamp = (items: Array<string | undefined>, fallback: string): string =>
  items
    .filter((item): item is string => Boolean(item))
    .sort((left, right) => right.localeCompare(left))[0] ?? fallback;

const createRecoveredTaskTitle = (taskId: string, preview: string): string => {
  const trimmedPreview = preview.trim();
  if (trimmedPreview) {
    return trimmedPreview.slice(0, 48);
  }

  return `Recovered task ${taskId.slice(0, 8)}`;
};

export const recoverWorkspaceGraph = (input: RecoverWorkspaceGraphInput): RecoverWorkspaceGraphResult => {
  const taskMap = new Map(input.workspaceTasks.map((task) => [task.id, task]));
  const referencedTaskIds = new Set(
    [...input.messages, ...input.artifacts, ...input.toolExecutions]
      .map((item) => item.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)),
  );

  for (const taskId of referencedTaskIds) {
    if (!taskMap.has(taskId)) {
      taskMap.set(
        taskId,
        createWorkspaceTask({
          id: taskId,
          workspaceSessionId: input.workspaceSessionId,
          title: `Recovered task ${taskId.slice(0, 8)}`,
        }),
      );
    }
  }

  const nextTasks = Array.from(taskMap.values()).map((task) => {
    const taskMessages = input.messages.filter((message) => message.taskId === task.id);
    const taskArtifacts = input.artifacts.filter((artifact) => artifact.taskId === task.id);
    const taskTools = input.toolExecutions.filter((tool) => tool.taskId === task.id);
    const lastUserPreview = taskMessages
      .map((message) => message.content ?? '')
      .filter(Boolean)
      .at(-1) ?? '';
    const updatedAt = getLatestTimestamp(
      [
        task.updatedAt,
        ...taskMessages.flatMap((message) => [message.createdAt, message.updatedAt]),
        ...taskArtifacts.flatMap((artifact) => [artifact.createdAt, artifact.updatedAt]),
        ...taskTools.flatMap((tool) => [tool.startedAt, tool.finishedAt]),
      ],
      task.updatedAt || task.createdAt || nowIso(),
    );

    return {
      ...task,
      parentTaskId: task.parentTaskId && taskMap.has(task.parentTaskId) ? task.parentTaskId : null,
      title:
        task.title.trim() && !task.title.startsWith('Recovered task')
          ? task.title
          : createRecoveredTaskTitle(task.id, lastUserPreview),
      status: isTaskBusy(task.status) ? 'failed' : task.status,
      requestId: null,
      updatedAt,
      lastMessagePreview: task.lastMessagePreview || lastUserPreview.slice(0, 120),
    };
  });

  nextTasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeTaskId =
    input.activeTaskId && nextTasks.some((task) => task.id === input.activeTaskId)
      ? input.activeTaskId
      : nextTasks[0]?.id ?? null;

  return {
    workspaceTasks: nextTasks,
    activeTaskId,
  };
};
