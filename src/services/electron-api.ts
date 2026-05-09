import type {
  AppConfig,
  AppConfigUpdate,
  ApplyProviderProfileInput,
  ModelCatalogResult,
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
  DesktopAppInfo,
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
  ProviderProfileRecord,
  ResetChatRequest,
  ResolveToolApprovalInput,
  SaveProviderProfileInput,
  StartChatRequest,
  TaskCloneResult,
  UpdateAutomationInput,
  UpdateProjectMemoryInput,
  UpdateWorkspaceInstructionsInput,
  UpdatePluginStateInput,
  WorkspaceInstructionsRecord,
} from '../../shared/contracts';

const requireDesktopApi = () => {
  if (!window.desktop) {
    throw new Error('Desktop bridge is not available.');
  }

  return window.desktop;
};

export const getDesktopAppInfo = async (): Promise<DesktopAppInfo | null> => {
  if (!window.desktop?.getAppInfo) {
    return null;
  }

  return window.desktop.getAppInfo();
};

export const getConfig = (): Promise<AppConfig> => requireDesktopApi().getConfig();
export const updateConfig = (update: AppConfigUpdate): Promise<AppConfig> =>
  requireDesktopApi().updateConfig(update);
export const listAvailableModels = (config: AppConfig): Promise<ModelCatalogResult> =>
  requireDesktopApi().listAvailableModels(config);
export const listProviderProfiles = (): Promise<ProviderProfileRecord[]> =>
  requireDesktopApi().listProviderProfiles();
export const saveProviderProfile = (input: SaveProviderProfileInput): Promise<ProviderProfileRecord> =>
  requireDesktopApi().saveProviderProfile(input);
export const applyProviderProfile = (input: ApplyProviderProfileInput): Promise<AppConfig> =>
  requireDesktopApi().applyProviderProfile(input);
export const deleteProviderProfile = (profileId: string): Promise<void> =>
  requireDesktopApi().deleteProviderProfile(profileId);
export const getProjectMemorySnapshot = (): Promise<ProjectMemorySnapshot> =>
  requireDesktopApi().getProjectMemorySnapshot();
export const createProjectMemory = (input: CreateProjectMemoryInput): Promise<ProjectMemoryRecord> =>
  requireDesktopApi().createProjectMemory(input);
export const updateProjectMemory = (input: UpdateProjectMemoryInput): Promise<ProjectMemoryRecord> =>
  requireDesktopApi().updateProjectMemory(input);
export const deleteProjectMemory = (memoryId: string): Promise<void> =>
  requireDesktopApi().deleteProjectMemory(memoryId);
export const updateWorkspaceInstructions = (
  input: UpdateWorkspaceInstructionsInput,
): Promise<WorkspaceInstructionsRecord> => requireDesktopApi().updateWorkspaceInstructions(input);
export const getGitReview = (): Promise<GitReviewSnapshot> => requireDesktopApi().getGitReview();
export const getGitDiff = (request: GitDiffRequest): Promise<GitDiffResult> =>
  requireDesktopApi().getGitDiff(request);
export const draftGitCommit = (): Promise<GitCommitDraft> => requireDesktopApi().draftGitCommit();
export const createGitBranch = (input: GitCreateBranchInput): Promise<GitBranchResult> =>
  requireDesktopApi().createGitBranch(input);
export const createGitCommit = (input: GitCreateCommitInput): Promise<GitCommitResult> =>
  requireDesktopApi().createGitCommit(input);
export const prepareGitPullRequest = (): Promise<GitPullRequestPrep> => requireDesktopApi().prepareGitPullRequest();
export const reviewGitChanges = (): Promise<GitCodeReviewResult> => requireDesktopApi().reviewGitChanges();
export const listSessions = (): Promise<PersistedSessionSummary[]> => requireDesktopApi().listSessions();
export const loadSession = (sessionId: string): Promise<PersistedSessionPayload | null> =>
  requireDesktopApi().loadSession(sessionId);
export const deleteSession = (sessionId: string): Promise<void> => requireDesktopApi().deleteSession(sessionId);
export const exportContinuityData = (): Promise<ContinuityExportResult | null> =>
  requireDesktopApi().exportContinuityData();
export const importContinuityData = (input: ContinuityImportInput): Promise<ContinuityImportResult | null> =>
  requireDesktopApi().importContinuityData(input);
export const listAutomations = (): Promise<AutomationRecord[]> => requireDesktopApi().listAutomations();
export const listAutomationRuns = (): Promise<AutomationRunRecord[]> => requireDesktopApi().listAutomationRuns();
export const createAutomation = (input: CreateAutomationInput): Promise<AutomationRecord> =>
  requireDesktopApi().createAutomation(input);
export const updateAutomation = (input: UpdateAutomationInput): Promise<AutomationRecord> =>
  requireDesktopApi().updateAutomation(input);
export const deleteAutomation = (automationId: string): Promise<void> => requireDesktopApi().deleteAutomation(automationId);
export const runAutomation = (automationId: string): Promise<AutomationRunRecord> =>
  requireDesktopApi().runAutomation(automationId);
export const listPlugins = (): Promise<PluginRecord[]> => requireDesktopApi().listPlugins();
export const updatePluginState = (input: UpdatePluginStateInput): Promise<PluginRecord> =>
  requireDesktopApi().updatePluginState(input);
export const listMcpConnectors = (): Promise<McpConnectorRecord[]> => requireDesktopApi().listMcpConnectors();
export const checkMcpConnector = (input: CheckMcpConnectorInput): Promise<McpConnectorCheckResult> =>
  requireDesktopApi().checkMcpConnector(input);
export const createSafeTaskClone = (input: CreateSafeTaskCloneInput): Promise<TaskCloneResult> =>
  requireDesktopApi().createSafeTaskClone(input);
export const discardSafeTaskClone = (clonePath: string): Promise<void> =>
  requireDesktopApi().discardSafeTaskClone(clonePath);
export const captureArtifactPreview = (
  input: CaptureArtifactPreviewInput,
): Promise<ArtifactPreviewScreenshotResult> => requireDesktopApi().captureArtifactPreview(input);
export const startChat = (request: StartChatRequest): Promise<void> => requireDesktopApi().startChat(request);
export const cancelChat = (request: CancelChatRequest): Promise<void> => requireDesktopApi().cancelChat(request);
export const resetChat = (request: ResetChatRequest): Promise<void> => requireDesktopApi().resetChat(request);
export const resolveToolApproval = (input: ResolveToolApprovalInput): Promise<void> =>
  requireDesktopApi().resolveToolApproval(input);
export const onChatEvent = (listener: (event: ChatStreamEvent) => void): (() => void) =>
  requireDesktopApi().onChatEvent(listener);
export const onAutomationEvent = (listener: (event: AutomationEvent) => void): (() => void) =>
  requireDesktopApi().onAutomationEvent(listener);
