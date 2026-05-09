export const DEFAULT_MODEL = 'gpt-5.4';
export { DEFAULT_BASE_URL, DEFAULT_PROVIDER_ID, LLM_PROVIDER_PRESETS } from './provider-presets';
export type { LlmProviderId, LlmProviderPreset } from './provider-presets';

export const DEFAULT_SYSTEM_PROMPT = `You are a senior autonomous software engineer operating inside a desktop workspace.

When the user asks for code, apps, UI, or documents, you may optionally create artifacts by emitting XML tags in the exact form:
<artifact type="code|html|react" title="Readable title" language="ts|tsx|js|html|css|json|md">...content...</artifact>

Artifact rules:
- Never wrap artifact tags in markdown fences.
- Keep artifact content self-contained and production-oriented.
- Use type="react" with language="tsx" for React previews.
- Use type="html" for standalone HTML/CSS/JS previews.
- Use type="code" for non-preview code or configs.
- You may still answer with normal markdown outside artifact tags.

Tool rules:
- Use read_file before modifying existing files when needed.
- Use write_file to create or update files.
- Use execute_terminal for shell commands, diagnostics, installs, builds, tests, and git inspection.
- Use spawn_subtask when part of the work should continue in parallel with a narrow, explicit scope.
- Explain risky operations before taking them.
- When tool results contain errors, reason about them and recover.

Response style:
- Be concise, practical, and direct.
- Prefer complete working solutions over partial sketches.
- If you create an artifact, also explain briefly what it is and how to use it.

Automation rules:
- You can manage recurring automations with list_automations, create_automation, update_automation, delete_automation, and run_automation.
- Use automations for repeated checks, follow-up work, scheduled maintenance, or recurring code generation tasks.
- Keep automation prompts durable and self-contained because they may run later without extra context.`;

export type ArtifactKind = 'code' | 'html' | 'react';
export type ArtifactStatus = 'streaming' | 'complete' | 'error';
export type ArtifactViewMode = 'code' | 'preview';
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';
export type MessageStatus = 'idle' | 'streaming' | 'complete' | 'error';
export type ToolExecutionStatus = 'running' | 'completed' | 'failed';
export type HookExecutionStatus = 'completed' | 'failed';
export type HookStage = 'prompt.beforeSend' | 'tool.beforeExecute' | 'tool.afterExecute' | 'run.afterComplete';
export type ToolAccessMode = 'allow' | 'ask' | 'block';
export type ToolApprovalScope = 'once' | 'request' | 'always' | 'unsafe-run';
export type ToolApprovalDecision = 'approve' | 'reject';
export type AutomationStatus = 'active' | 'paused';
export type AutomationRunStatus = 'running' | 'completed' | 'failed';
export type AutomationWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TaskIsolationMode = 'workspace' | 'safe-clone';
export type PluginStatus = 'enabled' | 'disabled' | 'invalid';
export type PluginCapabilityKind = 'tool' | 'mcp' | 'skill' | 'automation' | 'workflow';
export type McpConnectorTransport = 'stdio' | 'http' | 'sse';
export type McpConnectorStatus = 'ready' | 'disabled' | 'invalid';
export type McpConnectorCheckStatus = 'connected' | 'failed' | 'skipped';
export type PluginPermissionKey =
  | 'readWorkspace'
  | 'writeWorkspace'
  | 'executeCommands'
  | 'networkAccess'
  | 'storeSecrets';
export type GitChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'
  | 'type-changed'
  | 'unknown';

export type DesktopAppInfo = {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  workspaceRoot: string;
};

export type AppConfig = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  toolPolicy: ToolPolicyConfig;
};

export type AppConfigUpdate = Partial<AppConfig>;

export type ToolPolicyConfig = {
  readFile: ToolAccessMode;
  outsideWorkspaceReads: ToolAccessMode;
  writeFile: ToolAccessMode;
  outsideWorkspaceWrites: ToolAccessMode;
  executeTerminal: ToolAccessMode;
  outsideWorkspaceTerminal: ToolAccessMode;
  riskyTerminal: ToolAccessMode;
};

export type ToolExecutionRecord = {
  id: string;
  taskId?: string;
  name: string;
  argumentsText: string;
  output?: string;
  status: ToolExecutionStatus;
  startedAt: string;
  finishedAt?: string;
};

export type HookExecutionRecord = {
  id: string;
  requestId: string;
  hookId: string;
  hookName: string;
  stage: HookStage;
  status: HookExecutionStatus;
  detail: string;
  startedAt: string;
  finishedAt: string;
};

export type ToolApprovalRequestRecord = {
  id: string;
  requestId: string;
  taskId?: string;
  source: 'chat' | 'automation';
  toolName: string;
  policyKey: keyof ToolPolicyConfig;
  argumentsText: string;
  reason: string;
  requestedAt: string;
  scopeOptions: ToolApprovalScope[];
};

export type ResolveToolApprovalInput = {
  approvalId: string;
  decision: ToolApprovalDecision;
  scope?: ToolApprovalScope;
};

export type CreateSafeTaskCloneInput = {
  taskId: string;
  sourcePath?: string | null;
};

export type TaskCloneResult = {
  clonePath: string;
  sourcePath: string;
  createdAt: string;
};

export type PluginCapability = {
  kind: PluginCapabilityKind;
  name: string;
  description: string;
};

export type McpConnectorManifest = {
  id: string;
  name: string;
  description: string;
  transport: McpConnectorTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  capabilities: PluginCapability[];
  permissions: PluginPermissionKey[];
  mcpConnectors: McpConnectorManifest[];
  entrypoint?: string;
};

export type PluginRecord = PluginManifest & {
  sourcePath: string;
  enabled: boolean;
  status: PluginStatus;
  statusDetail: string;
};

export type McpConnectorRecord = McpConnectorManifest & {
  pluginId: string;
  pluginName: string;
  pluginSourcePath: string;
  pluginEnabled: boolean;
  pluginPermissions: PluginPermissionKey[];
  status: McpConnectorStatus;
  statusDetail: string;
};

export type UpdatePluginStateInput = {
  id: string;
  enabled: boolean;
};

export type CheckMcpConnectorInput = {
  pluginId: string;
  connectorId: string;
};

export type McpConnectorCheckResult = {
  pluginId: string;
  connectorId: string;
  connectorName: string;
  transport: McpConnectorTransport;
  status: McpConnectorCheckStatus;
  ok: boolean;
  detail: string;
  checkedAt: string;
  responseSummary?: string;
};

export type GitChangedFile = {
  path: string;
  previousPath?: string;
  stagedKind?: GitChangeKind;
  unstagedKind?: GitChangeKind;
  staged: boolean;
  unstaged: boolean;
  conflicted: boolean;
};

export type GitReviewSnapshot = {
  available: boolean;
  branch: string | null;
  upstream: string | null;
  latestCommitSummary: string | null;
  ahead: number;
  behind: number;
  stagedCount: number;
  unstagedCount: number;
  conflictedCount: number;
  summary: string;
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  generatedAt: string;
};

export type GitDiffRequest = {
  path: string;
  staged: boolean;
};

export type GitDiffResult = {
  path: string;
  staged: boolean;
  diff: string;
  truncated: boolean;
  generatedAt: string;
};

export type GitCommitDraft = {
  message: string;
  summary: string;
  generatedAt: string;
};

export type GitCreateBranchInput = {
  name: string;
  fromRef?: string | null;
};

export type GitBranchResult = {
  branch: string;
  previousBranch: string | null;
  created: boolean;
  switchedAt: string;
};

export type GitCreateCommitInput = {
  message: string;
};

export type GitCommitResult = {
  branch: string | null;
  hash: string;
  summary: string;
  createdAt: string;
};

export type GitPullRequestPrep = {
  branch: string | null;
  upstream: string | null;
  suggestedTitle: string;
  suggestedBranchName: string;
  summary: string[];
  testingChecklist: string[];
  commitSummaries: string[];
  diffStat: string;
  body: string;
  generatedAt: string;
  warning?: string;
};

export type GitReviewFindingSeverity = 'high' | 'medium' | 'low';
export type GitReviewFindingCategory = 'risk' | 'regression' | 'tests';

export type GitReviewFinding = {
  id: string;
  title: string;
  summary: string;
  severity: GitReviewFindingSeverity;
  category: GitReviewFindingCategory;
  filePath?: string;
  startLine?: number;
  endLine?: number;
};

export type GitCodeReviewResult = {
  summary: string;
  findings: GitReviewFinding[];
  strengths: string[];
  testingGaps: string[];
  reviewedFiles: string[];
  generatedAt: string;
};

export type GitInlineReviewCommentStatus = 'open' | 'resolved';

export type GitInlineReviewComment = {
  id: string;
  filePath: string;
  lineNumber: number;
  body: string;
  status: GitInlineReviewCommentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  taskId?: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: MessageStatus;
  toolExecutionId?: string;
  toolApprovalId?: string;
};

export type ArtifactRecord = {
  id: string;
  taskId?: string;
  type: ArtifactKind;
  title: string;
  language: string;
  content: string;
  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  sourceMessageId: string;
};

export type CaptureArtifactPreviewInput = {
  artifactId: string;
  title: string;
};

export type ArtifactPreviewScreenshotResult = {
  path: string;
  width: number;
  height: number;
  bytes: number;
  capturedAt: string;
};

export type ProjectMemoryRecord = {
  id: string;
  workspaceRoot: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceInstructionsRecord = {
  workspaceRoot: string;
  content: string;
  updatedAt: string;
};

export type ProjectMemorySnapshot = {
  workspaceRoot: string;
  instructions: WorkspaceInstructionsRecord;
  memories: ProjectMemoryRecord[];
};

export type CreateProjectMemoryInput = {
  title: string;
  content: string;
  tags?: string[];
};

export type UpdateProjectMemoryInput = {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
};

export type UpdateWorkspaceInstructionsInput = {
  content: string;
};

export type StartChatRequest = {
  requestId: string;
  sessionId: string;
  message: string;
  workingDirectory?: string | null;
  config: AppConfig;
};

export type CancelChatRequest = {
  requestId: string;
};

export type ResetChatRequest = {
  sessionId: string;
};

export type IntervalAutomationSchedule = {
  kind: 'interval';
  intervalMinutes: number;
};

export type DailyAutomationSchedule = {
  kind: 'daily';
  hour: number;
  minute: number;
};

export type WeeklyAutomationSchedule = {
  kind: 'weekly';
  weekdays: AutomationWeekday[];
  hour: number;
  minute: number;
};

export type AutomationSchedule =
  | IntervalAutomationSchedule
  | DailyAutomationSchedule
  | WeeklyAutomationSchedule;

export type AutomationRecord = {
  id: string;
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  status: AutomationStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string | null;
  lastRunStatus?: AutomationRunStatus;
  lastResultSummary?: string;
  lastChangeSummary?: string;
};

export type AutomationRunRecord = {
  id: string;
  automationId: string;
  automationName: string;
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt?: string;
  summary: string;
  output?: string;
  outputCharacters?: number;
  outputTruncated?: boolean;
  changeSummary?: string;
};

export type CreateAutomationInput = {
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
};

export type UpdateAutomationInput = {
  id: string;
  name?: string;
  prompt?: string;
  schedule?: AutomationSchedule;
  status?: AutomationStatus;
};

export type PersistedSessionSummary = {
  id: string;
  prompt: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
  resumeSummary?: string;
  providerId?: string;
  providerLabel?: string;
  model?: string;
  toolNames: string[];
  artifactTypes: ArtifactKind[];
};

export type PersistedSessionPayload = {
  id: string;
  prompt: string;
  updatedAt: string;
  providerId?: string;
  providerLabel?: string;
  model?: string;
  messages: Array<{
    role: 'developer' | 'system' | 'user' | 'assistant' | 'tool';
    tool_call_id?: string;
    content: string | Array<{ type: 'text'; text: string }>;
  }>;
};

export type ContinuityImportMode = 'merge' | 'replace';

export type ContinuityExportPayload = {
  format: 'codexapp-continuity-export';
  version: 1;
  exportedAt: string;
  workspaceRoot: string;
  app: {
    name: string;
    version: string;
  };
  sessions: PersistedSessionPayload[];
  memory: ProjectMemorySnapshot;
};

export type ContinuityExportResult = {
  path: string;
  exportedAt: string;
  sessionCount: number;
  memoryCount: number;
  instructionsIncluded: boolean;
};

export type ContinuityImportInput = {
  mode: ContinuityImportMode;
};

export type ContinuityImportResult = {
  path: string;
  mode: ContinuityImportMode;
  importedAt: string;
  importedSessions: number;
  skippedSessions: number;
  totalSessions: number;
  importedMemories: number;
  skippedMemories: number;
  totalMemories: number;
  instructionsUpdated: boolean;
};

export type AvailableModelRecord = {
  id: string;
  ownedBy?: string;
  capabilities?: ModelCapabilityAssessment;
};

export type ModelCapabilityLevel = 'supported' | 'likely' | 'limited' | 'unknown';

export type ModelCapabilityAssessment = {
  streaming: ModelCapabilityLevel;
  toolCalling: ModelCapabilityLevel;
  recommendedForAgent: boolean;
  summary: string;
  notes: string[];
  transport: 'native' | 'compatible' | 'gateway-unknown';
};

export type ModelCatalogResult = {
  providerId: string;
  providerLabel: string;
  baseUrl: string;
  source: 'live' | 'preset-fallback';
  fetchedAt: string;
  warning?: string;
  models: AvailableModelRecord[];
};

export type ChatStreamEvent =
  | {
      type: 'chat.started';
      requestId: string;
      sessionId: string;
      startedAt: string;
      model: string;
    }
  | {
      type: 'assistant.delta';
      requestId: string;
      delta: string;
    }
  | {
      type: 'assistant.completed';
      requestId: string;
      content: string;
      finishedAt: string;
    }
  | {
      type: 'tool.started';
      requestId: string;
      tool: ToolExecutionRecord;
    }
  | {
      type: 'tool.completed';
      requestId: string;
      tool: ToolExecutionRecord;
    }
  | {
      type: 'tool.failed';
      requestId: string;
      tool: ToolExecutionRecord;
    }
  | {
      type: 'hook.completed';
      requestId: string;
      hook: HookExecutionRecord;
    }
  | {
      type: 'hook.failed';
      requestId: string;
      hook: HookExecutionRecord;
    }
  | {
      type: 'approval.requested';
      requestId: string;
      approval: ToolApprovalRequestRecord;
    }
  | {
      type: 'task.spawn-requested';
      requestId: string;
      title: string;
      prompt: string;
      scope: string;
      requestedAt: string;
    }
  | {
      type: 'approval.resolved';
      requestId: string;
      approvalId: string;
      decision: ToolApprovalDecision;
      scope?: ToolApprovalScope;
      finishedAt: string;
    }
  | {
      type: 'chat.cancelled';
      requestId: string;
      finishedAt: string;
    }
  | {
      type: 'chat.error';
      requestId: string;
      message: string;
      finishedAt: string;
    };

export type AutomationEvent = {
  type: 'automation.changed';
};

export type DesktopApi = {
  getAppInfo: () => Promise<DesktopAppInfo>;
  getConfig: () => Promise<AppConfig>;
  updateConfig: (update: AppConfigUpdate) => Promise<AppConfig>;
  listAvailableModels: (config: AppConfig) => Promise<ModelCatalogResult>;
  getProjectMemorySnapshot: () => Promise<ProjectMemorySnapshot>;
  createProjectMemory: (input: CreateProjectMemoryInput) => Promise<ProjectMemoryRecord>;
  updateProjectMemory: (input: UpdateProjectMemoryInput) => Promise<ProjectMemoryRecord>;
  deleteProjectMemory: (memoryId: string) => Promise<void>;
  updateWorkspaceInstructions: (input: UpdateWorkspaceInstructionsInput) => Promise<WorkspaceInstructionsRecord>;
  listSessions: () => Promise<PersistedSessionSummary[]>;
  loadSession: (sessionId: string) => Promise<PersistedSessionPayload | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportContinuityData: () => Promise<ContinuityExportResult | null>;
  importContinuityData: (input: ContinuityImportInput) => Promise<ContinuityImportResult | null>;
  listAutomations: () => Promise<AutomationRecord[]>;
  listAutomationRuns: () => Promise<AutomationRunRecord[]>;
  createAutomation: (input: CreateAutomationInput) => Promise<AutomationRecord>;
  updateAutomation: (input: UpdateAutomationInput) => Promise<AutomationRecord>;
  deleteAutomation: (automationId: string) => Promise<void>;
  runAutomation: (automationId: string) => Promise<AutomationRunRecord>;
  listPlugins: () => Promise<PluginRecord[]>;
  updatePluginState: (input: UpdatePluginStateInput) => Promise<PluginRecord>;
  listMcpConnectors: () => Promise<McpConnectorRecord[]>;
  checkMcpConnector: (input: CheckMcpConnectorInput) => Promise<McpConnectorCheckResult>;
  getGitReview: () => Promise<GitReviewSnapshot>;
  getGitDiff: (request: GitDiffRequest) => Promise<GitDiffResult>;
  draftGitCommit: () => Promise<GitCommitDraft>;
  createGitBranch: (input: GitCreateBranchInput) => Promise<GitBranchResult>;
  createGitCommit: (input: GitCreateCommitInput) => Promise<GitCommitResult>;
  prepareGitPullRequest: () => Promise<GitPullRequestPrep>;
  reviewGitChanges: () => Promise<GitCodeReviewResult>;
  createSafeTaskClone: (input: CreateSafeTaskCloneInput) => Promise<TaskCloneResult>;
  discardSafeTaskClone: (clonePath: string) => Promise<void>;
  captureArtifactPreview: (input: CaptureArtifactPreviewInput) => Promise<ArtifactPreviewScreenshotResult>;
  startChat: (request: StartChatRequest) => Promise<void>;
  cancelChat: (request: CancelChatRequest) => Promise<void>;
  resetChat: (request: ResetChatRequest) => Promise<void>;
  resolveToolApproval: (input: ResolveToolApprovalInput) => Promise<void>;
  onChatEvent: (listener: (event: ChatStreamEvent) => void) => () => void;
  onAutomationEvent: (listener: (event: AutomationEvent) => void) => () => void;
};
