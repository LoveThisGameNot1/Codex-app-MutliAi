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

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

class ChatRuntime {
  private unsubscribe: (() => void) | null = null;
  private activeRequestId: string | null = null;
  private assistantMessageId: string | null = null;
  private parser: ArtifactStreamParser | null = null;

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
    if (!content || state.isStreaming) {
      return;
    }

    const requestId = createId();
    state.addUserMessage(content);
    const assistantMessageId = useAppStore.getState().beginStreaming(requestId);
    state.setLastError(null);

    this.activeRequestId = requestId;
    this.assistantMessageId = assistantMessageId;
    this.parser = new ArtifactStreamParser({
      onText: (text) => {
        if (this.assistantMessageId && text) {
          useAppStore.getState().appendAssistantText(this.assistantMessageId, text);
        }
      },
      onArtifactOpen: (payload) => {
        const artifact: ArtifactRecord = {
          ...payload,
          content: '',
          status: 'streaming',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceMessageId: this.assistantMessageId ?? createId(),
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

    await startChat({
      requestId,
      sessionId: state.sessionId,
      message: content,
      config: state.config,
    });
  }

  public async cancelActiveRequest(): Promise<void> {
    const requestId = useAppStore.getState().activeRequestId;
    if (!requestId) {
      return;
    }

    await cancelChat({ requestId });
  }

  public async resetConversation(): Promise<void> {
    const state = useAppStore.getState();
    await resetChat({ sessionId: state.sessionId });
    state.resetConversation();
    this.activeRequestId = null;
    this.assistantMessageId = null;
    this.parser = null;
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
    useAppStore.getState().loadPersistedConversation({
      sessionId: session.id,
      messages: hydrated.messages,
      artifacts: hydrated.artifacts,
      toolExecutions: hydrated.toolExecutions,
    });
  }

  public async deletePersistedSession(sessionId: string): Promise<void> {
    await deleteSession(sessionId);
    const state = useAppStore.getState();
    if (state.sessionId === sessionId) {
      state.resetConversation();
    }
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

    switch (event.type) {
      case 'approval.requested': {
        state.addPendingToolApproval(event.approval);
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

    if (event.requestId !== this.activeRequestId) {
      return;
    }

    switch (event.type) {
      case 'chat.started': {
        state.setStreamingState(true, event.requestId);
        return;
      }
      case 'assistant.delta': {
        this.parser?.push(event.delta);
        return;
      }
      case 'assistant.completed': {
        this.parser?.finish();
        if (this.assistantMessageId) {
          state.completeAssistantMessage(this.assistantMessageId);
        }
        state.setStreamingState(false, null);
        this.activeRequestId = null;
        this.assistantMessageId = null;
        this.parser = null;
        return;
      }
      case 'tool.started': {
        state.addToolExecution(event.tool);
        return;
      }
      case 'tool.completed':
      case 'tool.failed': {
        state.updateToolExecution(event.tool);
        return;
      }
      case 'chat.cancelled': {
        this.parser?.finish();
        if (this.assistantMessageId) {
          state.completeAssistantMessage(this.assistantMessageId);
        }
        state.setStreamingState(false, null);
        this.activeRequestId = null;
        this.assistantMessageId = null;
        this.parser = null;
        return;
      }
      case 'chat.error': {
        this.parser?.finish();
        if (this.assistantMessageId) {
          state.failAssistantMessage(this.assistantMessageId, event.message);
        }
        state.setLastError(event.message);
        state.setStreamingState(false, null);
        this.activeRequestId = null;
        this.assistantMessageId = null;
        this.parser = null;
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
