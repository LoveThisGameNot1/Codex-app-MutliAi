import type { ArtifactRecord, ChatStreamEvent } from '../../shared/contracts';
import {
  cancelChat,
  deleteSession,
  listSessions,
  loadSession,
  onChatEvent,
  resetChat,
  resolveToolApproval,
  startChat,
  updateConfig,
} from './electron-api';
import { ArtifactStreamParser } from './artifact-stream-parser';
import { hydratePersistedSession } from './session-hydrator';
import { useAppStore } from '@/store/app-store';
import { createTaskTitleFromPrompt } from '@/services/workspace-task';

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type ActiveTaskRun = {
  taskId: string;
  assistantMessageId: string;
  parser: ArtifactStreamParser;
};

type ChatRuntimeDependencies = {
  startChat: typeof startChat;
  cancelChat: typeof cancelChat;
  resetChat: typeof resetChat;
  updateConfig: typeof updateConfig;
  listSessions: typeof listSessions;
  loadSession: typeof loadSession;
  deleteSession: typeof deleteSession;
  resolveToolApproval: typeof resolveToolApproval;
  onChatEvent: typeof onChatEvent;
};

const defaultDependencies: ChatRuntimeDependencies = {
  startChat,
  cancelChat,
  resetChat,
  updateConfig,
  listSessions,
  loadSession,
  deleteSession,
  resolveToolApproval,
  onChatEvent,
};

export class ChatRuntime {
  private unsubscribe: (() => void) | null = null;
  private readonly activeRuns = new Map<string, ActiveTaskRun>();

  public constructor(private readonly dependencies: ChatRuntimeDependencies = defaultDependencies) {}

  private async startTaskMessage(taskId: string, content: string): Promise<void> {
    const state = useAppStore.getState();
    const task = state.workspaceTasks.find((item) => item.id === taskId);
    if (!task || task.requestId) {
      return;
    }

    const requestId = createId();
    const assistantMessageId = state.beginTaskRun({
      taskId,
      requestId,
      content,
    });
    state.setLastError(null);

    const parser = new ArtifactStreamParser({
      onText: (text) => {
        if (text) {
          useAppStore.getState().appendAssistantText(assistantMessageId, text);
        }
      },
      onArtifactOpen: (payload) => {
        const artifact: ArtifactRecord = {
          ...payload,
          taskId,
          content: '',
          status: 'streaming',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceMessageId: assistantMessageId,
        };

        useAppStore.getState().upsertArtifact(artifact);
      },
      onArtifactDelta: (artifactId, delta) => {
        useAppStore.getState().appendArtifactContent(artifactId, delta);
      },
      onArtifactClose: (artifactId) => {
        useAppStore.getState().finalizeArtifact(artifactId);
      },
    });

    this.activeRuns.set(requestId, {
      taskId,
      assistantMessageId,
      parser,
    });

    await this.dependencies.startChat({
      requestId,
      sessionId: task.sessionId,
      message: content,
      workingDirectory: task.workingDirectory,
      config: state.config,
    });
  }

  public initialize(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.dependencies.onChatEvent((event) => {
      void this.handleEvent(event);
    });

    void this.refreshSessionLibrary();
  }

  public async sendCurrentComposerMessage(): Promise<void> {
    const state = useAppStore.getState();
    const content = state.composerValue.trim();
    const activeTask = state.workspaceTasks.find((task) => task.id === state.activeTaskId);
    if (!content || !activeTask || activeTask.requestId) {
      return;
    }

    state.setComposerValue('');
    await this.startTaskMessage(activeTask.id, content);
  }

  public async cancelActiveRequest(): Promise<void> {
    const state = useAppStore.getState();
    const activeTask = state.workspaceTasks.find((task) => task.id === state.activeTaskId);
    if (!activeTask?.requestId) {
      return;
    }

    await this.dependencies.cancelChat({ requestId: activeTask.requestId });
  }

  public async cancelTask(taskId: string): Promise<void> {
    const task = useAppStore.getState().workspaceTasks.find((item) => item.id === taskId);
    if (!task?.requestId) {
      return;
    }

    await this.dependencies.cancelChat({ requestId: task.requestId });
  }

  public async createTask(title?: string): Promise<void> {
    const nextTitle = title?.trim() || 'New task';
    useAppStore.getState().createTask({ title: nextTitle });
  }

  public async spawnSubtask(input: {
    parentTaskId: string;
    title: string;
    prompt: string;
    scopeSummary: string;
  }): Promise<void> {
    const state = useAppStore.getState();
    const parentTask = state.workspaceTasks.find((task) => task.id === input.parentTaskId);
    if (!parentTask) {
      return;
    }

    const taskId = state.createTask({
      title: input.title,
      parentTaskId: input.parentTaskId,
      scopeSummary: input.scopeSummary,
      workingDirectory: parentTask.workingDirectory,
    });
    state.addSystemMessage(
      input.parentTaskId,
      `Spawned subtask "${input.title}" with scope: ${input.scopeSummary}`,
    );
    state.setActiveTaskId(taskId);
    await this.startTaskMessage(taskId, input.prompt);
  }

  public async resetConversation(): Promise<void> {
    const state = useAppStore.getState();
    await Promise.all(state.workspaceTasks.map((task) => this.dependencies.resetChat({ sessionId: task.sessionId })));
    state.resetConversation();
    this.activeRuns.clear();
  }

  public async persistConfig(): Promise<void> {
    const config = useAppStore.getState().config;
    const next = await this.dependencies.updateConfig(config);
    useAppStore.getState().hydrateConfig(next);
  }

  public async refreshSessionLibrary(): Promise<void> {
    const sessions = await this.dependencies.listSessions();
    useAppStore.getState().setPersistedSessions(sessions);
  }

  public async loadPersistedSession(sessionId: string): Promise<void> {
    const session = await this.dependencies.loadSession(sessionId);
    if (!session) {
      return;
    }

    const hydrated = hydratePersistedSession(session);
    const lastUserMessage = [...hydrated.messages].reverse().find((message) => message.role === 'user');
    const title = lastUserMessage?.content.slice(0, 48) || createTaskTitleFromPrompt(session.prompt);

    useAppStore.getState().loadPersistedConversation({
      sessionId: createId(),
      title,
      messages: hydrated.messages,
      artifacts: hydrated.artifacts,
      toolExecutions: hydrated.toolExecutions,
    });
  }

  public async deletePersistedSession(sessionId: string): Promise<void> {
    await this.dependencies.deleteSession(sessionId);
    await this.refreshSessionLibrary();
  }

  public async approveToolRequest(approvalId: string, scope: 'once' | 'request' | 'always' | 'unsafe-run'): Promise<void> {
    if (scope === 'always') {
      const approval = useAppStore.getState().pendingToolApprovals.find((item) => item.id === approvalId);
      if (approval) {
        const nextConfig = await this.dependencies.updateConfig({
          toolPolicy: {
            ...useAppStore.getState().config.toolPolicy,
            [approval.policyKey]: 'allow',
          },
        });
        useAppStore.getState().hydrateConfig(nextConfig);
      }
    }

    await this.dependencies.resolveToolApproval({
      approvalId,
      decision: 'approve',
      scope,
    });
  }

  public async rejectToolRequest(approvalId: string): Promise<void> {
    await this.dependencies.resolveToolApproval({
      approvalId,
      decision: 'reject',
    });
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.activeRuns.clear();
  }

  private async handleEvent(event: ChatStreamEvent): Promise<void> {
    const state = useAppStore.getState();
    const activeRun = this.activeRuns.get(event.requestId);

    switch (event.type) {
      case 'task.spawn-requested': {
        const parentTaskId = activeRun?.taskId;
        if (!parentTaskId) {
          return;
        }

        await this.spawnSubtask({
          parentTaskId,
          title: event.title,
          prompt: event.prompt,
          scopeSummary: event.scope,
        });
        return;
      }
      case 'approval.requested': {
        if (activeRun) {
          state.addPendingToolApproval({ ...event.approval, taskId: activeRun.taskId }, activeRun.taskId);
        }
        return;
      }
      case 'approval.resolved': {
        state.resolvePendingToolApproval({
          approvalId: event.approvalId,
          decision: event.decision,
          scope: event.scope,
        });
        return;
      }
      default:
        break;
    }

    if (!activeRun) {
      return;
    }

    switch (event.type) {
      case 'chat.started': {
        state.setTaskStatus(activeRun.taskId, 'running', event.requestId);
        return;
      }
      case 'assistant.delta': {
        activeRun.parser.push(event.delta);
        return;
      }
      case 'assistant.completed': {
        activeRun.parser.finish();
        state.completeAssistantMessage(activeRun.assistantMessageId);
        state.setTaskStatus(activeRun.taskId, 'completed', null);
        this.activeRuns.delete(event.requestId);
        return;
      }
      case 'tool.started': {
        state.addToolExecution({ ...event.tool, taskId: activeRun.taskId }, activeRun.taskId);
        return;
      }
      case 'tool.completed':
      case 'tool.failed': {
        state.updateToolExecution({ ...event.tool, taskId: activeRun.taskId }, activeRun.taskId);
        return;
      }
      case 'chat.cancelled': {
        activeRun.parser.finish();
        state.completeAssistantMessage(activeRun.assistantMessageId);
        state.setTaskStatus(activeRun.taskId, 'failed', null);
        this.activeRuns.delete(event.requestId);
        return;
      }
      case 'chat.error': {
        activeRun.parser.finish();
        state.failAssistantMessage(activeRun.assistantMessageId, event.message);
        state.setLastError(event.message);
        state.setTaskStatus(activeRun.taskId, 'failed', null);
        this.activeRuns.delete(event.requestId);
        return;
      }
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }
}

export const chatRuntime = new ChatRuntime();
