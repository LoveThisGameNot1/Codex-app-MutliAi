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

class ChatRuntime {
  private unsubscribe: (() => void) | null = null;
  private readonly activeRuns = new Map<string, ActiveTaskRun>();

  public initialize(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = onChatEvent((event) => {
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

    const requestId = createId();
    const assistantMessageId = state.beginTaskRun({
      taskId: activeTask.id,
      requestId,
      content,
    });
    state.setComposerValue('');
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
          taskId: activeTask.id,
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
      taskId: activeTask.id,
      assistantMessageId,
      parser,
    });

    await startChat({
      requestId,
      sessionId: activeTask.sessionId,
      message: content,
      config: state.config,
    });
  }

  public async cancelActiveRequest(): Promise<void> {
    const state = useAppStore.getState();
    const activeTask = state.workspaceTasks.find((task) => task.id === state.activeTaskId);
    if (!activeTask?.requestId) {
      return;
    }

    await cancelChat({ requestId: activeTask.requestId });
  }

  public async cancelTask(taskId: string): Promise<void> {
    const task = useAppStore.getState().workspaceTasks.find((item) => item.id === taskId);
    if (!task?.requestId) {
      return;
    }

    await cancelChat({ requestId: task.requestId });
  }

  public async createTask(title?: string): Promise<void> {
    const nextTitle = title?.trim() || 'New task';
    useAppStore.getState().createTask(nextTitle);
  }

  public async resetConversation(): Promise<void> {
    const state = useAppStore.getState();
    await Promise.all(state.workspaceTasks.map((task) => resetChat({ sessionId: task.sessionId })));
    state.resetConversation();
    this.activeRuns.clear();
  }

  public async persistConfig(): Promise<void> {
    const config = useAppStore.getState().config;
    const next = await updateConfig(config);
    useAppStore.getState().hydrateConfig(next);
  }

  public async refreshSessionLibrary(): Promise<void> {
    const sessions = await listSessions();
    useAppStore.getState().setPersistedSessions(sessions);
  }

  public async loadPersistedSession(sessionId: string): Promise<void> {
    const session = await loadSession(sessionId);
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
    await deleteSession(sessionId);
    await this.refreshSessionLibrary();
  }

  public async approveToolRequest(approvalId: string, scope: 'once' | 'request' | 'always' | 'unsafe-run'): Promise<void> {
    if (scope === 'always') {
      const approval = useAppStore.getState().pendingToolApprovals.find((item) => item.id === approvalId);
      if (approval) {
        const nextConfig = await updateConfig({
          toolPolicy: {
            ...useAppStore.getState().config.toolPolicy,
            [approval.policyKey]: 'allow',
          },
        });
        useAppStore.getState().hydrateConfig(nextConfig);
      }
    }

    await resolveToolApproval({
      approvalId,
      decision: 'approve',
      scope,
    });
  }

  public async rejectToolRequest(approvalId: string): Promise<void> {
    await resolveToolApproval({
      approvalId,
      decision: 'reject',
    });
  }

  private async handleEvent(event: ChatStreamEvent): Promise<void> {
    const state = useAppStore.getState();
    const activeRun = this.activeRuns.get(event.requestId);

    switch (event.type) {
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
