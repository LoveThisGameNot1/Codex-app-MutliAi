import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent, StartChatRequest } from '../../shared/contracts';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../../shared/contracts';
import { DEFAULT_TOOL_POLICY } from '../../shared/tool-policy';
import { useAppStore } from '@/store/app-store';
import { ChatRuntime } from './chat-runtime';
import { createWorkspaceTask } from './workspace-task';

const runtimeMocks = vi.hoisted(() => ({
  chatEventListener: null as ((event: ChatStreamEvent) => void) | null,
  startChatMock: vi.fn<(request: StartChatRequest) => Promise<void>>(),
  cancelChatMock: vi.fn<(request: { requestId: string }) => Promise<void>>(),
  resetChatMock: vi.fn<(request: { sessionId: string }) => Promise<void>>(),
  updateConfigMock: vi.fn(async (config) => ({
    providerId: DEFAULT_PROVIDER_ID,
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    toolPolicy: DEFAULT_TOOL_POLICY,
    ...config,
  })),
  listSessionsMock: vi.fn(async () => []),
  loadSessionMock: vi.fn(async () => null),
  deleteSessionMock: vi.fn(async () => undefined),
  resolveToolApprovalMock: vi.fn(async () => undefined),
}));

vi.mock('./electron-api', () => ({
  startChat: runtimeMocks.startChatMock,
  cancelChat: runtimeMocks.cancelChatMock,
  resetChat: runtimeMocks.resetChatMock,
  updateConfig: runtimeMocks.updateConfigMock,
  listSessions: runtimeMocks.listSessionsMock,
  loadSession: runtimeMocks.loadSessionMock,
  deleteSession: runtimeMocks.deleteSessionMock,
  resolveToolApproval: runtimeMocks.resolveToolApprovalMock,
  onChatEvent: (listener: (event: ChatStreamEvent) => void) => {
    runtimeMocks.chatEventListener = listener;
    return () => {
      runtimeMocks.chatEventListener = null;
    };
  },
}));

const createStoreTask = (workspaceSessionId: string, taskId: string, title: string) =>
  createWorkspaceTask({
    id: taskId,
    workspaceSessionId,
    title,
    createdAt: '2026-04-21T19:00:00.000Z',
  });

const resetStore = (): void => {
  const sessionId = 'workspace-test';
  const rootTask = createStoreTask(sessionId, 'task-main', 'Main task');
  useAppStore.setState({
    appInfo: null,
    config: {
      providerId: DEFAULT_PROVIDER_ID,
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_MODEL,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      toolPolicy: DEFAULT_TOOL_POLICY,
    },
    sessionId,
    workspaceTasks: [rootTask],
    activeTaskId: rootTask.id,
    messages: [],
    artifacts: [],
    activeArtifactId: null,
    artifactView: 'code',
    toolExecutions: [],
    pendingToolApprovals: [],
    persistedSessions: [],
    automations: [],
    automationRuns: [],
    acknowledgedAutomationRunIds: [],
    composerValue: '',
    isStreaming: false,
    activeRequestId: null,
    settingsOpen: false,
    workspaceSection: 'chat',
    lastError: null,
  });
};

const emit = async (event: ChatStreamEvent): Promise<void> => {
  expect(runtimeMocks.chatEventListener).not.toBeNull();
  await runtimeMocks.chatEventListener?.(event);
  await Promise.resolve();
};

describe('ChatRuntime', () => {
  beforeEach(() => {
    runtimeMocks.chatEventListener = null;
    runtimeMocks.startChatMock.mockReset();
    runtimeMocks.cancelChatMock.mockReset();
    runtimeMocks.resetChatMock.mockReset();
    runtimeMocks.updateConfigMock.mockClear();
    runtimeMocks.listSessionsMock.mockClear();
    runtimeMocks.loadSessionMock.mockClear();
    runtimeMocks.deleteSessionMock.mockClear();
    runtimeMocks.resolveToolApprovalMock.mockClear();
    runtimeMocks.startChatMock.mockResolvedValue(undefined);
    runtimeMocks.cancelChatMock.mockResolvedValue(undefined);
    runtimeMocks.resetChatMock.mockResolvedValue(undefined);
    resetStore();
  });

  it('routes concurrent stream events to the correct tasks', async () => {
    const runtime = new ChatRuntime();
    runtime.initialize();

    const childTaskId = useAppStore.getState().createTask({ title: 'Parallel task' });
    useAppStore.getState().setActiveTaskId('task-main');
    useAppStore.getState().setComposerValue('Build the root task');
    await runtime.sendCurrentComposerMessage();

    useAppStore.getState().setActiveTaskId(childTaskId);
    useAppStore.getState().setComposerValue('Inspect the sidebar in parallel');
    await runtime.sendCurrentComposerMessage();

    expect(runtimeMocks.startChatMock).toHaveBeenCalledTimes(2);
    const [rootRequest, childRequest] = runtimeMocks.startChatMock.mock.calls.map(([request]) => request);

    await emit({
      type: 'chat.started',
      requestId: rootRequest.requestId,
      sessionId: rootRequest.sessionId,
      startedAt: '2026-04-21T19:01:00.000Z',
      model: DEFAULT_MODEL,
    });
    await emit({
      type: 'chat.started',
      requestId: childRequest.requestId,
      sessionId: childRequest.sessionId,
      startedAt: '2026-04-21T19:01:01.000Z',
      model: DEFAULT_MODEL,
    });
    await emit({
      type: 'assistant.delta',
      requestId: childRequest.requestId,
      delta: 'Child response',
    });
    await emit({
      type: 'assistant.delta',
      requestId: rootRequest.requestId,
      delta: 'Root response',
    });
    await emit({
      type: 'assistant.completed',
      requestId: childRequest.requestId,
      content: 'Child response',
      finishedAt: '2026-04-21T19:02:00.000Z',
    });
    await emit({
      type: 'assistant.completed',
      requestId: rootRequest.requestId,
      content: 'Root response',
      finishedAt: '2026-04-21T19:02:01.000Z',
    });

    const state = useAppStore.getState();
    const rootTask = state.workspaceTasks.find((task) => task.id === 'task-main');
    const parallelTask = state.workspaceTasks.find((task) => task.id === childTaskId);
    const rootAssistant = state.messages.find((message) => message.taskId === 'task-main' && message.role === 'assistant');
    const childAssistant = state.messages.find((message) => message.taskId === childTaskId && message.role === 'assistant');

    expect(rootTask?.status).toBe('completed');
    expect(parallelTask?.status).toBe('completed');
    expect(rootAssistant?.content).toBe('Root response');
    expect(childAssistant?.content).toBe('Child response');
    expect(state.isStreaming).toBe(false);

    runtime.dispose();
  });

  it('cancels only the targeted task run', async () => {
    const runtime = new ChatRuntime();
    runtime.initialize();

    const childTaskId = useAppStore.getState().createTask({ title: 'Background task' });
    useAppStore.getState().setActiveTaskId(childTaskId);
    useAppStore.getState().setComposerValue('Run a cancellable background task');
    await runtime.sendCurrentComposerMessage();

    expect(runtimeMocks.startChatMock).toHaveBeenCalledTimes(1);
    const [request] = runtimeMocks.startChatMock.mock.calls.map(([call]) => call);

    await emit({
      type: 'chat.started',
      requestId: request.requestId,
      sessionId: request.sessionId,
      startedAt: '2026-04-21T19:03:00.000Z',
      model: DEFAULT_MODEL,
    });

    await runtime.cancelTask(childTaskId);
    expect(runtimeMocks.cancelChatMock).toHaveBeenCalledWith({ requestId: request.requestId });

    await emit({
      type: 'chat.cancelled',
      requestId: request.requestId,
      finishedAt: '2026-04-21T19:04:00.000Z',
    });

    const state = useAppStore.getState();
    const cancelledTask = state.workspaceTasks.find((task) => task.id === childTaskId);
    const assistantMessage = state.messages.find((message) => message.taskId === childTaskId && message.role === 'assistant');

    expect(cancelledTask?.status).toBe('failed');
    expect(cancelledTask?.requestId).toBeNull();
    expect(assistantMessage?.status).toBe('complete');
    expect(state.isStreaming).toBe(false);

    runtime.dispose();
  });

  it('recovers interrupted state when persisted busy tasks are rehydrated', () => {
    const recoveryTask = {
      ...createStoreTask('workspace-test', 'task-recovery', 'Recovered running task'),
      status: 'running' as const,
      requestId: 'request-recovery',
    };

    useAppStore.setState({
      sessionId: 'workspace-test',
      workspaceTasks: [recoveryTask],
      activeTaskId: recoveryTask.id,
      messages: [
        {
          id: 'message-1',
          taskId: recoveryTask.id,
          role: 'assistant',
          content: '',
          createdAt: '2026-04-21T19:05:00.000Z',
          status: 'streaming',
        },
      ],
      artifacts: [
        {
          id: 'artifact-1',
          taskId: recoveryTask.id,
          type: 'code',
          title: 'Recovered artifact',
          language: 'ts',
          content: 'const unfinished = true;',
          status: 'streaming',
          createdAt: '2026-04-21T19:05:00.000Z',
          updatedAt: '2026-04-21T19:05:00.000Z',
          sourceMessageId: 'message-1',
        },
      ],
      toolExecutions: [
        {
          id: 'tool-1',
          taskId: recoveryTask.id,
          name: 'execute_terminal',
          argumentsText: '{"command":"npm test"}',
          status: 'running',
          startedAt: '2026-04-21T19:05:00.000Z',
        },
      ],
      pendingToolApprovals: [
        {
          id: 'approval-1',
          requestId: 'request-recovery',
          taskId: recoveryTask.id,
          source: 'chat',
          toolName: 'write_file',
          policyKey: 'writeFile',
          argumentsText: '{}',
          reason: 'Need confirmation',
          requestedAt: '2026-04-21T19:05:00.000Z',
          scopeOptions: ['once'],
        },
      ],
      isStreaming: true,
      activeRequestId: 'request-recovery',
    });

    useAppStore.getState().markRecoveredFromPersistence();
    const state = useAppStore.getState();
    const task = state.workspaceTasks.find((item) => item.id === recoveryTask.id);

    expect(task?.status).toBe('failed');
    expect(task?.requestId).toBeNull();
    expect(state.pendingToolApprovals).toHaveLength(0);
    expect(state.messages[0]?.status).toBe('error');
    expect(state.artifacts[0]?.status).toBe('error');
    expect(state.toolExecutions[0]?.status).toBe('failed');
    expect(state.isStreaming).toBe(false);
    expect(state.activeRequestId).toBeNull();
  });
});
