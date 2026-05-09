import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  AppConfigUpdate,
  AutomationEvent,
  AutomationRecord,
  AutomationRunRecord,
  CancelChatRequest,
  ArtifactPreviewScreenshotResult,
  CaptureArtifactPreviewInput,
  CheckMcpConnectorInput,
  ChatStreamEvent,
  ContinuityExportResult,
  ContinuityImportInput,
  ContinuityImportResult,
  CreateProjectMemoryInput,
  CreateSafeTaskCloneInput,
  CreateAutomationInput,
  DesktopApi,
  GitBranchResult,
  GitCodeReviewResult,
  GitCommitDraft,
  GitCommitResult,
  GitCreateBranchInput,
  GitCreateCommitInput,
  GitDiffRequest,
  GitDiffResult,
  GitPullRequestPrep,
  GitReviewSnapshot,
  McpConnectorCheckResult,
  McpConnectorRecord,
  PersistedSessionPayload,
  PersistedSessionSummary,
  PluginRecord,
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
  ResetChatRequest,
  ResolveToolApprovalInput,
  StartChatRequest,
  TaskCloneResult,
  UpdateAutomationInput,
  UpdateProjectMemoryInput,
  UpdateWorkspaceInstructionsInput,
  UpdatePluginStateInput,
  WorkspaceInstructionsRecord,
} from '../shared/contracts';

const desktopApi: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  updateConfig: (update: AppConfigUpdate): Promise<AppConfig> => ipcRenderer.invoke('config:update', update),
  listAvailableModels: (config: AppConfig) => ipcRenderer.invoke('models:list', config),
  getProjectMemorySnapshot: (): Promise<ProjectMemorySnapshot> => ipcRenderer.invoke('project-memory:get-snapshot'),
  createProjectMemory: (input: CreateProjectMemoryInput): Promise<ProjectMemoryRecord> =>
    ipcRenderer.invoke('project-memory:create', input),
  updateProjectMemory: (input: UpdateProjectMemoryInput): Promise<ProjectMemoryRecord> =>
    ipcRenderer.invoke('project-memory:update', input),
  deleteProjectMemory: (memoryId: string): Promise<void> => ipcRenderer.invoke('project-memory:delete', memoryId),
  updateWorkspaceInstructions: (input: UpdateWorkspaceInstructionsInput): Promise<WorkspaceInstructionsRecord> =>
    ipcRenderer.invoke('workspace-instructions:update', input),
  getGitReview: (): Promise<GitReviewSnapshot> => ipcRenderer.invoke('git:review'),
  getGitDiff: (request: GitDiffRequest): Promise<GitDiffResult> => ipcRenderer.invoke('git:diff', request),
  draftGitCommit: (): Promise<GitCommitDraft> => ipcRenderer.invoke('git:draft-commit'),
  createGitBranch: (input: GitCreateBranchInput): Promise<GitBranchResult> => ipcRenderer.invoke('git:create-branch', input),
  createGitCommit: (input: GitCreateCommitInput): Promise<GitCommitResult> => ipcRenderer.invoke('git:create-commit', input),
  prepareGitPullRequest: (): Promise<GitPullRequestPrep> => ipcRenderer.invoke('git:prepare-pr'),
  reviewGitChanges: (): Promise<GitCodeReviewResult> => ipcRenderer.invoke('git:review-changes'),
  listSessions: (): Promise<PersistedSessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  loadSession: (sessionId: string): Promise<PersistedSessionPayload | null> =>
    ipcRenderer.invoke('sessions:load', sessionId),
  deleteSession: (sessionId: string): Promise<void> => ipcRenderer.invoke('sessions:delete', sessionId),
  exportContinuityData: (): Promise<ContinuityExportResult | null> => ipcRenderer.invoke('continuity:export'),
  importContinuityData: (input: ContinuityImportInput): Promise<ContinuityImportResult | null> =>
    ipcRenderer.invoke('continuity:import', input),
  listAutomations: (): Promise<AutomationRecord[]> => ipcRenderer.invoke('automations:list'),
  listAutomationRuns: (): Promise<AutomationRunRecord[]> => ipcRenderer.invoke('automation-runs:list'),
  createAutomation: (input: CreateAutomationInput): Promise<AutomationRecord> =>
    ipcRenderer.invoke('automations:create', input),
  updateAutomation: (input: UpdateAutomationInput): Promise<AutomationRecord> =>
    ipcRenderer.invoke('automations:update', input),
  deleteAutomation: (automationId: string): Promise<void> => ipcRenderer.invoke('automations:delete', automationId),
  runAutomation: (automationId: string): Promise<AutomationRunRecord> => ipcRenderer.invoke('automations:run', automationId),
  listPlugins: (): Promise<PluginRecord[]> => ipcRenderer.invoke('plugins:list'),
  updatePluginState: (input: UpdatePluginStateInput): Promise<PluginRecord> =>
    ipcRenderer.invoke('plugins:update-state', input),
  listMcpConnectors: (): Promise<McpConnectorRecord[]> => ipcRenderer.invoke('mcp-connectors:list'),
  checkMcpConnector: (input: CheckMcpConnectorInput): Promise<McpConnectorCheckResult> =>
    ipcRenderer.invoke('mcp-connectors:check', input),
  createSafeTaskClone: (input: CreateSafeTaskCloneInput): Promise<TaskCloneResult> =>
    ipcRenderer.invoke('task-workspaces:create-safe-clone', input),
  discardSafeTaskClone: (clonePath: string): Promise<void> =>
    ipcRenderer.invoke('task-workspaces:discard-safe-clone', clonePath),
  captureArtifactPreview: (input: CaptureArtifactPreviewInput): Promise<ArtifactPreviewScreenshotResult> =>
    ipcRenderer.invoke('artifact-preview:capture', input),
  startChat: (request: StartChatRequest): Promise<void> => ipcRenderer.invoke('chat:start', request),
  cancelChat: (request: CancelChatRequest): Promise<void> => ipcRenderer.invoke('chat:cancel', request),
  resetChat: (request: ResetChatRequest): Promise<void> => ipcRenderer.invoke('chat:reset', request),
  resolveToolApproval: (input: ResolveToolApprovalInput): Promise<void> => ipcRenderer.invoke('chat:resolve-approval', input),
  onChatEvent: (listener: (event: ChatStreamEvent) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: ChatStreamEvent) => {
      listener(payload);
    };

    ipcRenderer.on('chat:event', wrappedListener);

    return () => {
      ipcRenderer.removeListener('chat:event', wrappedListener);
    };
  },
  onAutomationEvent: (listener: (event: AutomationEvent) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: AutomationEvent) => {
      listener(payload);
    };

    ipcRenderer.on('automation:event', wrappedListener);

    return () => {
      ipcRenderer.removeListener('automation:event', wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
