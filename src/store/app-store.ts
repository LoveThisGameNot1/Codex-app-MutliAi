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
  GitInlineReviewComment,
  GitReviewSnapshot,
  McpConnectorRecord,
  MessageStatus,
  MessageRole,
  PersistedSessionSummary,
  PluginRecord,
  TaskIsolationMode,
  TaskCloneResult,
  ToolApprovalDecision,
  ToolApprovalRequestRecord,
  ToolApprovalScope,
  ToolExecutionRecord,
} from '../../shared/contracts';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PROVIDER_ID, DEFAULT_SYSTEM_PROMPT } from '../../shared/contracts';
import { DEFAULT_TOOL_POLICY, normalizeToolPolicy } from '../../shared/tool-policy';
import {
  createTaskTitleFromPrompt,
  createWorkspaceTask,
  deriveStreamingState,
  recoverWorkspaceGraph,
  type WorkspaceTask,
  type WorkspaceTaskStatus,
} from '@/services/workspace-task';

const nowIso = (): string => new Date().toISOString();
const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createSessionId = (): string => createId();
const MAX_ACKNOWLEDGED_AUTOMATION_RUN_IDS = 200;

export type WorkspaceSection = 'chat' | 'search' | 'review' | 'plugins' | 'automations' | 'settings';

const createDefaultTask = (workspaceSessionId: string): WorkspaceTask =>
  createWorkspaceTask({
    id: createId(),
    workspaceSessionId,
    title: 'Main task',
  });

export type AppState = {
  appInfo: DesktopAppInfo | null;
  config: AppConfig;
  sessionId: string;
  workspaceTasks: WorkspaceTask[];
  activeTaskId: string | null;
  messages: ChatMessage[];
  artifacts: ArtifactRecord[];
  activeArtifactId: string | null;
  artifactView: ArtifactViewMode;
  toolExecutions: ToolExecutionRecord[];
  pendingToolApprovals: ToolApprovalRequestRecord[];
  persistedSessions: PersistedSessionSummary[];
  automations: AutomationRecord[];
  automationRuns: AutomationRunRecord[];
  plugins: PluginRecord[];
  mcpConnectors: McpConnectorRecord[];
  gitReview: GitReviewSnapshot | null;
  gitReviewComments: GitInlineReviewComment[];
  acknowledgedAutomationRunIds: string[];
  composerValue: string;
  isStreaming: boolean;
  activeRequestId: string | null;
  settingsOpen: boolean;
  workspaceSection: WorkspaceSection;
  lastError: string | null;
  setAppInfo: (appInfo: DesktopAppInfo | null) => void;
  hydrateConfig: (config: AppConfig) => void;
  updateConfig: (updater: (current: AppConfig) => AppConfig) => void;
  setComposerValue: (value: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setWorkspaceSection: (section: WorkspaceSection) => void;
  createTask: (input?: {
    title?: string;
    parentTaskId?: string | null;
    scopeSummary?: string | null;
    isolationMode?: TaskIsolationMode;
    workingDirectory?: string | null;
    liveWorkingDirectory?: string | null;
    safeClonePath?: string | null;
  }) => string;
  setActiveTaskId: (taskId: string) => void;
  updateTaskWorkingDirectory: (taskId: string, workingDirectory: string | null) => void;
  activateTaskSafeClone: (taskId: string, clone: TaskCloneResult) => void;
  deactivateTaskSafeClone: (taskId: string) => void;
  setPersistedSessions: (sessions: PersistedSessionSummary[]) => void;
  setAutomations: (automations: AutomationRecord[]) => void;
  setAutomationRuns: (runs: AutomationRunRecord[]) => void;
  setPlugins: (plugins: PluginRecord[]) => void;
  setMcpConnectors: (connectors: McpConnectorRecord[]) => void;
  setGitReview: (review: GitReviewSnapshot | null) => void;
  addGitReviewComment: (input: { filePath: string; lineNumber: number; body: string }) => string;
  resolveGitReviewComment: (commentId: string) => void;
  deleteGitReviewComment: (commentId: string) => void;
  acknowledgeAutomationRun: (runId: string) => void;
  acknowledgeAutomationRuns: (runIds: string[]) => void;
  loadPersistedConversation: (input: {
    sessionId: string;
    messages: ChatMessage[];
    artifacts: ArtifactRecord[];
    toolExecutions: ToolExecutionRecord[];
    title?: string;
  }) => void;
  beginTaskRun: (input: { taskId: string; requestId: string; content: string }) => string;
  addSystemMessage: (taskId: string, content: string, status?: MessageStatus) => void;
  appendAssistantText: (messageId: string, delta: string) => void;
  completeAssistantMessage: (messageId: string) => void;
  failAssistantMessage: (messageId: string, message: string) => void;
  addToolExecution: (tool: ToolExecutionRecord, taskId: string) => void;
  updateToolExecution: (tool: ToolExecutionRecord, taskId: string) => void;
  addPendingToolApproval: (approval: ToolApprovalRequestRecord, taskId: string) => void;
  resolvePendingToolApproval: (input: {
    approvalId: string;
    decision: ToolApprovalDecision;
    scope?: ToolApprovalScope;
  }) => void;
  upsertArtifact: (artifact: ArtifactRecord) => void;
  appendArtifactContent: (artifactId: string, delta: string) => void;
  finalizeArtifact: (artifactId: string) => void;
  setActiveArtifactId: (artifactId: string | null) => void;
  setArtifactView: (view: ArtifactViewMode) => void;
  setTaskStatus: (taskId: string, status: WorkspaceTaskStatus, requestId?: string | null) => void;
  resetConversation: () => void;
  setLastError: (error: string | null) => void;
  markRecoveredFromPersistence: () => void;
};

const initialConfig: AppConfig = {
  providerId: DEFAULT_PROVIDER_ID,
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: DEFAULT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  toolPolicy: DEFAULT_TOOL_POLICY,
};

const normalizeConfig = (config: AppConfig): AppConfig => ({
  ...config,
  toolPolicy: normalizeToolPolicy(config.toolPolicy),
});

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

const attachTaskId = <T extends { taskId?: string }>(items: T[], taskId: string): T[] =>
  items.map((item) => ({
    ...item,
    taskId: item.taskId ?? taskId,
  }));

const updateTaskCollection = (
  tasks: WorkspaceTask[],
  taskId: string,
  updater: (task: WorkspaceTask) => WorkspaceTask,
): WorkspaceTask[] => tasks.map((task) => (task.id === taskId ? updater(task) : task));

export const useAppStore = create<AppState>()(
  persist(
    (set) => {
      const workspaceSessionId = createSessionId();
      const initialTask = createDefaultTask(workspaceSessionId);

      return {
        appInfo: null,
        config: initialConfig,
        sessionId: workspaceSessionId,
        workspaceTasks: [initialTask],
        activeTaskId: initialTask.id,
        messages: [],
        artifacts: [],
        activeArtifactId: null,
        artifactView: 'code',
        toolExecutions: [],
        pendingToolApprovals: [],
        persistedSessions: [],
        automations: [],
        automationRuns: [],
        plugins: [],
        mcpConnectors: [],
        gitReview: null,
        gitReviewComments: [],
        acknowledgedAutomationRunIds: [],
        composerValue: '',
        isStreaming: false,
        activeRequestId: null,
        settingsOpen: false,
        workspaceSection: 'chat',
        lastError: null,
        setAppInfo: (appInfo) => set({ appInfo }),
        hydrateConfig: (config) => set({ config: normalizeConfig(config) }),
        updateConfig: (updater) =>
          set((state) => ({
            config: normalizeConfig(updater(normalizeConfig(state.config))),
          })),
        setComposerValue: (composerValue) => set({ composerValue }),
        setSettingsOpen: (settingsOpen) =>
          set((state) => ({
            settingsOpen,
            workspaceSection:
              settingsOpen ? 'settings' : state.workspaceSection === 'settings' ? 'chat' : state.workspaceSection,
          })),
        setWorkspaceSection: (workspaceSection) =>
          set({
            workspaceSection,
            settingsOpen: workspaceSection === 'settings',
          }),
        createTask: (input) => {
          const taskId = createId();
          set((state) => {
            const task = createWorkspaceTask({
              id: taskId,
              workspaceSessionId: state.sessionId,
              title: input?.title,
              parentTaskId: input?.parentTaskId,
              scopeSummary: input?.scopeSummary,
              isolationMode: input?.isolationMode,
              workingDirectory: input?.workingDirectory,
              liveWorkingDirectory: input?.liveWorkingDirectory,
              safeClonePath: input?.safeClonePath,
            });
            const workspaceTasks = [task, ...state.workspaceTasks];
            return {
              workspaceTasks,
              activeTaskId: task.id,
              activeArtifactId: null,
              ...deriveStreamingState(workspaceTasks, task.id),
            };
          });
          return taskId;
        },
        setActiveTaskId: (activeTaskId) =>
          set((state) => ({
            activeTaskId,
            activeArtifactId: state.artifacts.find((artifact) => artifact.taskId === activeTaskId)?.id ?? null,
            activeRequestId: state.workspaceTasks.find((task) => task.id === activeTaskId)?.requestId ?? null,
          })),
        updateTaskWorkingDirectory: (taskId, workingDirectory) =>
          set((state) => ({
            workspaceTasks: updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              workingDirectory:
                task.isolationMode === 'safe-clone'
                  ? task.workingDirectory
                  : workingDirectory?.trim() || null,
              liveWorkingDirectory: workingDirectory?.trim() || null,
              updatedAt: nowIso(),
            })),
          })),
        activateTaskSafeClone: (taskId, clone) =>
          set((state) => ({
            workspaceTasks: updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              isolationMode: 'safe-clone',
              safeClonePath: clone.clonePath,
              liveWorkingDirectory: clone.sourcePath,
              workingDirectory: clone.clonePath,
              updatedAt: nowIso(),
            })),
          })),
        deactivateTaskSafeClone: (taskId) =>
          set((state) => ({
            workspaceTasks: updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              isolationMode: 'workspace',
              safeClonePath: null,
              workingDirectory: task.liveWorkingDirectory,
              updatedAt: nowIso(),
            })),
          })),
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
      setPlugins: (plugins) => set({ plugins }),
      setMcpConnectors: (mcpConnectors) => set({ mcpConnectors }),
      setGitReview: (gitReview) => set({ gitReview }),
      addGitReviewComment: ({ filePath, lineNumber, body }) => {
        const commentId = createId();
        set((state) => {
          const createdAt = nowIso();
          const comment: GitInlineReviewComment = {
            id: commentId,
            filePath,
            lineNumber,
            body,
            status: 'open',
            createdAt,
            updatedAt: createdAt,
          };
          return {
            gitReviewComments: [comment, ...state.gitReviewComments],
          };
        });
        return commentId;
      },
      resolveGitReviewComment: (commentId) =>
        set((state) => ({
          gitReviewComments: state.gitReviewComments.map((comment) =>
            comment.id === commentId
              ? {
                  ...comment,
                  status: 'resolved',
                  updatedAt: nowIso(),
                }
              : comment,
          ),
        })),
      deleteGitReviewComment: (commentId) =>
        set((state) => ({
          gitReviewComments: state.gitReviewComments.filter((comment) => comment.id !== commentId),
        })),
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
        loadPersistedConversation: ({ sessionId, messages, artifacts, toolExecutions, title }) =>
          set((state) => {
            const task = createWorkspaceTask({
              id: createId(),
              workspaceSessionId: sessionId,
              title: title || 'Loaded task',
            });
            const normalizedMessages = attachTaskId(messages, task.id);
            const normalizedArtifacts = attachTaskId(artifacts, task.id);
            const normalizedTools = attachTaskId(toolExecutions, task.id);
            return {
              sessionId,
              workspaceTasks: [
                {
                  ...task,
                  title: title || task.title,
                  lastMessagePreview:
                    normalizedMessages
                      .filter((message) => message.role === 'user')
                      .at(-1)
                      ?.content.slice(0, 120) ?? '',
                },
              ],
              activeTaskId: task.id,
              messages: normalizedMessages,
              artifacts: normalizedArtifacts,
              toolExecutions: normalizedTools,
              pendingToolApprovals: [],
              activeArtifactId: normalizedArtifacts[0]?.id ?? null,
              artifactView: normalizedArtifacts.length > 0 ? state.artifactView : 'code',
              composerValue: '',
              isStreaming: false,
              activeRequestId: null,
              lastError: null,
              workspaceSection: 'chat',
            };
          }),
        beginTaskRun: ({ taskId, requestId, content }) => {
          const assistantMessageId = createId();
          set((state) => {
            const createdAt = nowIso();
            const userMessage: ChatMessage = {
              id: createId(),
              taskId,
              role: 'user' as MessageRole,
              content,
              createdAt,
              status: 'complete' as MessageStatus,
            };
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              taskId,
              role: 'assistant' as MessageRole,
              content: '',
              createdAt,
              status: 'streaming' as MessageStatus,
            };
            const nextMessages = [
              ...state.messages,
              userMessage,
              assistantMessage,
            ];
            const workspaceTasks = updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              title: task.title === 'New task' || task.title === 'Main task' ? createTaskTitleFromPrompt(content) : task.title,
              status: 'queued',
              updatedAt: createdAt,
              lastMessagePreview: content,
              requestId,
            }));

            return {
              messages: nextMessages,
              workspaceTasks,
              activeTaskId: taskId,
              activeArtifactId: state.artifacts.find((artifact) => artifact.taskId === taskId)?.id ?? null,
              lastError: null,
              ...deriveStreamingState(workspaceTasks, taskId),
            };
          });

          return assistantMessageId;
        },
      addSystemMessage: (taskId, content, status = 'complete') =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: createId(),
              taskId,
              role: 'system',
              content,
              createdAt: nowIso(),
              status,
            },
          ],
        })),
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
        addToolExecution: (tool, taskId) =>
          set((state) => {
            const nextTool = { ...tool, taskId };
            const workspaceTasks = updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              status: 'running',
              updatedAt: nowIso(),
            }));
            return {
              toolExecutions: [nextTool, ...state.toolExecutions],
              messages: [
                ...state.messages,
                {
                  id: `${tool.id}:message`,
                  taskId,
                  role: 'tool',
                  content: `Running ${tool.name}`,
                  createdAt: tool.startedAt,
                  status: 'streaming',
                  toolExecutionId: tool.id,
                },
              ],
              workspaceTasks,
              ...deriveStreamingState(workspaceTasks, state.activeTaskId),
            };
          }),
        updateToolExecution: (tool, taskId) =>
          set((state) => ({
            toolExecutions: state.toolExecutions.map((item) => (item.id === tool.id ? { ...tool, taskId } : item)),
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
        addPendingToolApproval: (approval, taskId) =>
          set((state) => {
            const nextApproval = { ...approval, taskId };
            const workspaceTasks = updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              status: 'blocked',
              updatedAt: nowIso(),
            }));
            return {
              pendingToolApprovals: [nextApproval, ...state.pendingToolApprovals.filter((item) => item.id !== approval.id)],
              messages:
                approval.source === 'chat'
                  ? [
                      ...state.messages,
                      {
                        id: `${approval.id}:approval`,
                        taskId,
                        role: 'system',
                        content: `Approval needed for ${approval.toolName}\n\n${approval.reason}`,
                        createdAt: approval.requestedAt,
                        status: 'complete',
                        toolApprovalId: approval.id,
                      },
                    ]
                  : state.messages,
              workspaceTasks,
              ...deriveStreamingState(workspaceTasks, state.activeTaskId),
            };
          }),
      resolvePendingToolApproval: ({ approvalId, decision, scope }) =>
        set((state) => {
          const resolvedApproval = state.pendingToolApprovals.find((approval) => approval.id === approvalId);
          const workspaceTasks =
            resolvedApproval?.taskId
              ? updateTaskCollection(state.workspaceTasks, resolvedApproval.taskId, (task) => ({
                  ...task,
                  status: decision === 'approve' ? 'running' : 'failed',
                  updatedAt: nowIso(),
                }))
              : state.workspaceTasks;
          return {
            pendingToolApprovals: state.pendingToolApprovals.filter((approval) => approval.id !== approvalId),
            messages:
              resolvedApproval?.source === 'chat'
                ? [
                    ...state.messages,
                    {
                      id: `${approvalId}:resolved:${decision}:${Date.now()}`,
                      taskId: resolvedApproval.taskId,
                      role: 'system',
                      content:
                        decision === 'approve'
                          ? `Approval granted${
                              scope === 'request'
                                ? ' for the rest of this run'
                                : scope === 'unsafe-run'
                                  ? ' and matching ask-first tools will now auto-approve for the rest of this run'
                                : scope === 'always'
                                  ? ' and this rule is now permanently allowed'
                                  : ' once'
                            }.\n\nThe agent can continue.`
                          : 'Approval rejected.\n\nThe pending tool action was denied.',
                      createdAt: nowIso(),
                      status: decision === 'approve' ? 'complete' : 'error',
                      toolApprovalId: approvalId,
                    },
                  ]
                : state.messages,
            workspaceTasks,
            ...deriveStreamingState(workspaceTasks, state.activeTaskId),
          };
        }),
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
        setTaskStatus: (taskId, status, requestId = null) =>
          set((state) => {
            const workspaceTasks = updateTaskCollection(state.workspaceTasks, taskId, (task) => ({
              ...task,
              status,
              updatedAt: nowIso(),
              requestId,
            }));
            return {
              workspaceTasks,
              ...deriveStreamingState(workspaceTasks, state.activeTaskId),
            };
          }),
        resetConversation: () =>
          set((state) => {
            const nextSessionId = createSessionId();
            const nextTask = createDefaultTask(nextSessionId);
            return {
              sessionId: nextSessionId,
              workspaceTasks: [nextTask],
              activeTaskId: nextTask.id,
              messages: [],
              artifacts: [],
              activeArtifactId: null,
              toolExecutions: [],
              pendingToolApprovals: [],
              composerValue: '',
              isStreaming: false,
              activeRequestId: null,
              lastError: null,
              artifactView: state.artifactView,
            };
          }),
        setLastError: (lastError) => set({ lastError }),
        markRecoveredFromPersistence: () =>
          set((state) => {
            const workspaceTasks =
              state.workspaceTasks.length > 0
                ? state.workspaceTasks
                : [createDefaultTask(state.sessionId)];
            const fallbackTaskId = state.activeTaskId ?? workspaceTasks[0]?.id ?? null;
            const normalizedMessages = fallbackTaskId ? attachTaskId(sanitizeRecoveredMessages(state.messages), fallbackTaskId) : state.messages;
            const normalizedArtifacts = fallbackTaskId ? attachTaskId(sanitizeRecoveredArtifacts(state.artifacts), fallbackTaskId) : state.artifacts;
            const normalizedTools = fallbackTaskId ? attachTaskId(sanitizeRecoveredTools(state.toolExecutions), fallbackTaskId) : state.toolExecutions;
            const recoveredWorkspace = recoverWorkspaceGraph({
              workspaceSessionId: state.sessionId,
              workspaceTasks,
              activeTaskId: state.activeTaskId,
              messages: normalizedMessages,
              artifacts: normalizedArtifacts,
              toolExecutions: normalizedTools,
            });

            return {
              workspaceTasks: recoveredWorkspace.workspaceTasks,
              activeTaskId: recoveredWorkspace.activeTaskId,
              isStreaming: false,
              activeRequestId:
                recoveredWorkspace.workspaceTasks.find((task) => task.id === recoveredWorkspace.activeTaskId)?.requestId ?? null,
              pendingToolApprovals: [],
              messages: normalizedMessages,
              artifacts: normalizedArtifacts,
              toolExecutions: normalizedTools,
              activeArtifactId:
                normalizedArtifacts.find((artifact) => artifact.taskId === recoveredWorkspace.activeTaskId)?.id ??
                state.activeArtifactId,
            };
          }),
      };
    },
    {
      name: 'codexapp-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        workspaceTasks: state.workspaceTasks,
        activeTaskId: state.activeTaskId,
        messages: state.messages,
        artifacts: state.artifacts,
        activeArtifactId: state.activeArtifactId,
        artifactView: state.artifactView,
        toolExecutions: state.toolExecutions,
        persistedSessions: state.persistedSessions,
        automations: state.automations,
        automationRuns: state.automationRuns,
        plugins: state.plugins,
        gitReview: state.gitReview,
        gitReviewComments: state.gitReviewComments,
        acknowledgedAutomationRunIds: state.acknowledgedAutomationRunIds,
        composerValue: state.composerValue,
        settingsOpen: state.settingsOpen,
        workspaceSection: state.workspaceSection,
        lastError: state.lastError,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markRecoveredFromPersistence();
      },
    },
  ),
);
