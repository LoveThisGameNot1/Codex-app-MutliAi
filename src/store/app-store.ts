import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AppConfig,
  AutomationRecord,
  AutomationRunRecord,
  ArtifactRecord,
  ArtifactViewMode,
  ChatMessage,
  DesktopAppInfo,
  PersistedSessionSummary,
  ToolExecutionRecord,
} from '../../shared/contracts';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../../shared/contracts';

const nowIso = (): string => new Date().toISOString();
const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createSessionId = (): string => createId();
const MAX_ACKNOWLEDGED_AUTOMATION_RUN_IDS = 200;

export type AppState = {
  appInfo: DesktopAppInfo | null;
  config: AppConfig;
  sessionId: string;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
  activeArtifactId: string | null;
  artifactView: ArtifactViewMode;
  toolExecutions: ToolExecutionRecord[];
  persistedSessions: PersistedSessionSummary[];
  automations: AutomationRecord[];
  automationRuns: AutomationRunRecord[];
  acknowledgedAutomationRunIds: string[];
  composerValue: string;
  isStreaming: boolean;
  activeRequestId: string | null;
  settingsOpen: boolean;
  lastError: string | null;
  setAppInfo: (appInfo: DesktopAppInfo | null) => void;
  hydrateConfig: (config: AppConfig) => void;
  updateConfig: (updater: (current: AppConfig) => AppConfig) => void;
  setComposerValue: (value: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setPersistedSessions: (sessions: PersistedSessionSummary[]) => void;
  setAutomations: (automations: AutomationRecord[]) => void;
  setAutomationRuns: (runs: AutomationRunRecord[]) => void;
  acknowledgeAutomationRun: (runId: string) => void;
  acknowledgeAutomationRuns: (runIds: string[]) => void;
  loadPersistedConversation: (input: {
    sessionId: string;
    messages: ChatMessage[];
    artifacts: ArtifactRecord[];
    toolExecutions: ToolExecutionRecord[];
  }) => void;
  beginStreaming: (requestId: string) => string;
  appendAssistantText: (messageId: string, delta: string) => void;
  completeAssistantMessage: (messageId: string) => void;
  failAssistantMessage: (messageId: string, message: string) => void;
  addUserMessage: (content: string) => void;
  addToolExecution: (tool: ToolExecutionRecord) => void;
  updateToolExecution: (tool: ToolExecutionRecord) => void;
  upsertArtifact: (artifact: ArtifactRecord) => void;
  appendArtifactContent: (artifactId: string, delta: string) => void;
  finalizeArtifact: (artifactId: string) => void;
  setActiveArtifactId: (artifactId: string | null) => void;
  setArtifactView: (view: ArtifactViewMode) => void;
  resetConversation: () => void;
  setStreamingState: (isStreaming: boolean, requestId: string | null) => void;
  setLastError: (error: string | null) => void;
  markRecoveredFromPersistence: () => void;
};

const initialConfig: AppConfig = {
  providerId: DEFAULT_PROVIDER_ID,
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: DEFAULT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const sanitizeRecoveredMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) =>
    message.status === 'streaming'
      ? {
          ...message,
          status: 'error',
          content:
            message.content ||
            'This streamed message was interrupted because the app closed before the response completed.',
        }
      : message,
  );

const sanitizeRecoveredArtifacts = (artifacts: ArtifactRecord[]): ArtifactRecord[] =>
  artifacts.map((artifact) =>
    artifact.status === 'streaming'
      ? {
          ...artifact,
          status: 'error',
        }
      : artifact,
  );

const sanitizeRecoveredTools = (tools: ToolExecutionRecord[]): ToolExecutionRecord[] =>
  tools.map((tool) =>
    tool.status === 'running'
      ? {
          ...tool,
          status: 'failed',
          finishedAt: nowIso(),
          output: tool.output || 'Tool execution was interrupted because the app closed before completion.',
        }
      : tool,
  );

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      appInfo: null,
      config: initialConfig,
      sessionId: createSessionId(),
      messages: [],
      artifacts: [],
      activeArtifactId: null,
      artifactView: 'code',
      toolExecutions: [],
      persistedSessions: [],
      automations: [],
      automationRuns: [],
      acknowledgedAutomationRunIds: [],
      composerValue: '',
      isStreaming: false,
      activeRequestId: null,
      settingsOpen: false,
      lastError: null,
      setAppInfo: (appInfo) => set({ appInfo }),
      hydrateConfig: (config) => set({ config }),
      updateConfig: (updater) => set((state) => ({ config: updater(state.config) })),
      setComposerValue: (composerValue) => set({ composerValue }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setPersistedSessions: (persistedSessions) => set({ persistedSessions }),
      setAutomations: (automations) => set({ automations }),
      setAutomationRuns: (automationRuns) =>
        set((state) => {
          const knownRunIds = new Set(automationRuns.map((run) => run.id));
          return {
            automationRuns,
            acknowledgedAutomationRunIds: state.acknowledgedAutomationRunIds.filter((id) => knownRunIds.has(id)),
          };
        }),
      acknowledgeAutomationRun: (runId) =>
        set((state) => ({
          acknowledgedAutomationRunIds: [runId, ...state.acknowledgedAutomationRunIds.filter((id) => id !== runId)].slice(
            0,
            MAX_ACKNOWLEDGED_AUTOMATION_RUN_IDS,
          ),
        })),
      acknowledgeAutomationRuns: (runIds) =>
        set((state) => ({
          acknowledgedAutomationRunIds: [...runIds, ...state.acknowledgedAutomationRunIds.filter((id) => !runIds.includes(id))]
            .filter((id, index, values) => values.indexOf(id) === index)
            .slice(0, MAX_ACKNOWLEDGED_AUTOMATION_RUN_IDS),
        })),
      loadPersistedConversation: ({ sessionId, messages, artifacts, toolExecutions }) =>
        set((state) => ({
          sessionId,
          messages,
          artifacts,
          toolExecutions,
          activeArtifactId: artifacts[0]?.id ?? null,
          artifactView: artifacts.length > 0 ? state.artifactView : 'code',
          composerValue: '',
          isStreaming: false,
          activeRequestId: null,
          lastError: null,
        })),
      beginStreaming: (requestId) => {
        const assistantMessageId = createId();
        set((state) => ({
          isStreaming: true,
          activeRequestId: requestId,
          lastError: null,
          messages: [
            ...state.messages,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: '',
              createdAt: nowIso(),
              status: 'streaming',
            },
          ],
        }));

        return assistantMessageId;
      },
      appendAssistantText: (messageId, delta) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, content: message.content + delta } : message,
          ),
        })),
      completeAssistantMessage: (messageId) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, status: 'complete' } : message,
          ),
        })),
      failAssistantMessage: (messageId, message) =>
        set((state) => ({
          messages: state.messages.map((item) =>
            item.id === messageId
              ? { ...item, content: item.content || message, status: 'error' }
              : item,
          ),
        })),
      addUserMessage: (content) =>
        set((state) => ({
          composerValue: '',
          messages: [
            ...state.messages,
            {
              id: createId(),
              role: 'user',
              content,
              createdAt: nowIso(),
              status: 'complete',
            },
          ],
        })),
      addToolExecution: (tool) =>
        set((state) => ({
          toolExecutions: [tool, ...state.toolExecutions],
          messages: [
            ...state.messages,
            {
              id: `${tool.id}:message`,
              role: 'tool',
              content: `Running ${tool.name}`,
              createdAt: tool.startedAt,
              status: 'streaming',
              toolExecutionId: tool.id,
            },
          ],
        })),
      updateToolExecution: (tool) =>
        set((state) => ({
          toolExecutions: state.toolExecutions.map((item) => (item.id === tool.id ? tool : item)),
          messages: state.messages.map((message) =>
            message.toolExecutionId === tool.id
              ? {
                  ...message,
                  content:
                    tool.status === 'failed'
                      ? `${tool.name} failed\n\n${tool.output || ''}`
                      : `${tool.name} completed\n\n${tool.output || ''}`,
                  status: tool.status === 'failed' ? 'error' : 'complete',
                }
              : message,
          ),
        })),
      upsertArtifact: (artifact) =>
        set((state) => {
          const existing = state.artifacts.find((item) => item.id === artifact.id);
          return {
            artifacts: existing
              ? state.artifacts.map((item) => (item.id === artifact.id ? artifact : item))
              : [artifact, ...state.artifacts],
            activeArtifactId: artifact.id,
          };
        }),
      appendArtifactContent: (artifactId, delta) =>
        set((state) => ({
          artifacts: state.artifacts.map((artifact) =>
            artifact.id === artifactId
              ? {
                  ...artifact,
                  content: artifact.content + delta,
                  updatedAt: nowIso(),
                }
              : artifact,
          ),
        })),
      finalizeArtifact: (artifactId) =>
        set((state) => ({
          artifacts: state.artifacts.map((artifact) =>
            artifact.id === artifactId
              ? { ...artifact, status: 'complete', updatedAt: nowIso() }
              : artifact,
          ),
        })),
      setActiveArtifactId: (activeArtifactId) => set({ activeArtifactId }),
      setArtifactView: (artifactView) => set({ artifactView }),
      resetConversation: () =>
        set((state) => ({
          sessionId: createSessionId(),
          messages: [],
          artifacts: [],
          activeArtifactId: null,
          toolExecutions: [],
          composerValue: '',
          isStreaming: false,
          activeRequestId: null,
          lastError: null,
          artifactView: state.artifactView,
        })),
      setStreamingState: (isStreaming, activeRequestId) => set({ isStreaming, activeRequestId }),
      setLastError: (lastError) => set({ lastError }),
      markRecoveredFromPersistence: () =>
        set((state) => ({
          isStreaming: false,
          activeRequestId: null,
          messages: sanitizeRecoveredMessages(state.messages),
          artifacts: sanitizeRecoveredArtifacts(state.artifacts),
          toolExecutions: sanitizeRecoveredTools(state.toolExecutions),
        })),
    }),
    {
      name: 'codexapp-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages,
        artifacts: state.artifacts,
        activeArtifactId: state.activeArtifactId,
        artifactView: state.artifactView,
        toolExecutions: state.toolExecutions,
        persistedSessions: state.persistedSessions,
        automations: state.automations,
        automationRuns: state.automationRuns,
        acknowledgedAutomationRunIds: state.acknowledgedAutomationRunIds,
        composerValue: state.composerValue,
        settingsOpen: state.settingsOpen,
        lastError: state.lastError,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markRecoveredFromPersistence();
      },
    },
  ),
);
