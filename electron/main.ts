import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppConfigUpdate,
  CaptureArtifactPreviewInput,
  CreateProjectMemoryInput,
  CreateAutomationInput,
  CancelChatRequest,
  CheckMcpConnectorInput,
  ChatStreamEvent,
  ContinuityExportPayload,
  ContinuityImportInput,
  GitCreateBranchInput,
  GitCreateCommitInput,
  ResolveToolApprovalInput,
  ResetChatRequest,
  StartChatRequest,
  PersistedSessionPayload,
  UpdateAutomationInput,
  UpdateProjectMemoryInput,
  UpdateWorkspaceInstructionsInput,
  UpdatePluginStateInput,
} from '../shared/contracts';
import { AutomationService } from './automation-service';
import { AutomationStore } from './automation-store';
import { ConfigStore } from './config-store';
import { GitService } from './git-service';
import { LlmService } from './llm-service';
import { McpConnectorService } from './mcp-connector-service';
import { PluginService } from './plugin-service';
import { PreviewCaptureService } from './preview-capture-service';
import { ProjectMemoryService } from './project-memory-service';
import { SessionStore, toSessionSummary } from './session-store';
import { TaskWorkspaceService } from './task-workspace-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const workspaceRoot = process.cwd();
const configStore = new ConfigStore();
const sessionStore = new SessionStore(app.getPath('userData'));
const automationStore = new AutomationStore(app.getPath('userData'));
const projectMemoryService = new ProjectMemoryService(app.getPath('userData'), workspaceRoot);
const llmService = new LlmService(workspaceRoot, sessionStore, () => projectMemoryService.getPromptContext());
const gitService = new GitService(workspaceRoot);
const pluginService = new PluginService(workspaceRoot, app.getPath('userData'));
const mcpConnectorService = new McpConnectorService(pluginService);
const taskWorkspaceService = new TaskWorkspaceService(workspaceRoot, path.join(app.getPath('userData'), 'task-clones'));
const previewCaptureService = new PreviewCaptureService(
  path.join(app.getPath('userData'), 'artifact-preview-screenshots'),
  () => mainWindow,
);
const emitChatEvent = (event: ChatStreamEvent): void => {
  mainWindow?.webContents.send('chat:event', event);
};
const emitAutomationEvent = () => {
  mainWindow?.webContents.send('automation:event', { type: 'automation.changed' });
};
const automationService = new AutomationService(
  automationStore,
  sessionStore,
  llmService,
  () => configStore.get(),
  emitAutomationEvent,
  emitChatEvent,
);
llmService.setAutomationTooling({
  listAutomations: () => automationService.listAutomations(),
  createAutomation: (input: CreateAutomationInput) => automationService.createAutomation(input),
  updateAutomation: (input: UpdateAutomationInput) => automationService.updateAutomation(input),
  deleteAutomation: (automationId) => automationService.deleteAutomation(automationId),
  runAutomation: (automationId) => automationService.runAutomationNow(automationId),
});
let mainWindow: BrowserWindow | null = null;

const nowIso = (): string => new Date().toISOString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContinuityExportPayload = (value: unknown): value is ContinuityExportPayload =>
  isRecord(value) &&
  value.format === 'codexapp-continuity-export' &&
  value.version === 1 &&
  Array.isArray(value.sessions) &&
  isRecord(value.memory);

const createContinuityExportFilename = (): string =>
  `codexapp-continuity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

const isPersistedMessageRole = (
  role: unknown,
): role is PersistedSessionPayload['messages'][number]['role'] =>
  role === 'developer' || role === 'system' || role === 'user' || role === 'assistant' || role === 'tool';

const toExportContent = (content: unknown): PersistedSessionPayload['messages'][number]['content'] => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content.flatMap((item) => {
    if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
      return [{ type: 'text' as const, text: item.text }];
    }

    return [];
  });
};

const toPersistedSessionPayload = (session: Awaited<ReturnType<typeof sessionStore.loadAll>>[number]): PersistedSessionPayload => ({
  id: session.id,
  prompt: session.prompt,
  updatedAt: session.updatedAt,
  providerId: session.providerId,
  providerLabel: session.providerLabel,
  model: session.model,
  messages: session.messages.flatMap((message) => {
    if (!isPersistedMessageRole(message.role)) {
      return [];
    }

    const toolCallId = (message as { tool_call_id?: unknown }).tool_call_id;
    return [
      {
        role: message.role,
        tool_call_id: typeof toolCallId === 'string' ? toolCallId : undefined,
        content: toExportContent(message.content),
      },
    ];
  }),
});

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1220,
    minHeight: 760,
    backgroundColor: '#020617',
    title: 'CodexApp Multi APIs',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
};

const registerIpcHandlers = (): void => {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    workspaceRoot,
  }));

  ipcMain.handle('config:get', () => configStore.get());
  ipcMain.handle('config:update', (_event, update: AppConfigUpdate) => configStore.update(update));
  ipcMain.handle('models:list', (_event, config) => llmService.listAvailableModels(config));
  ipcMain.handle('project-memory:get-snapshot', () => projectMemoryService.getSnapshot());
  ipcMain.handle('project-memory:create', (_event, input: CreateProjectMemoryInput) =>
    projectMemoryService.createMemory(input),
  );
  ipcMain.handle('project-memory:update', (_event, input: UpdateProjectMemoryInput) =>
    projectMemoryService.updateMemory(input),
  );
  ipcMain.handle('project-memory:delete', (_event, memoryId: string) => projectMemoryService.deleteMemory(memoryId));
  ipcMain.handle('workspace-instructions:update', (_event, input: UpdateWorkspaceInstructionsInput) =>
    projectMemoryService.updateInstructions(input),
  );
  ipcMain.handle('git:review', () => gitService.getReviewSnapshot());
  ipcMain.handle('git:diff', (_event, request) => gitService.getDiff(request));
  ipcMain.handle('git:draft-commit', () => gitService.draftCommitMessage());
  ipcMain.handle('git:create-branch', (_event, input: GitCreateBranchInput) => gitService.createOrSwitchBranch(input));
  ipcMain.handle('git:create-commit', (_event, input: GitCreateCommitInput) => gitService.createCommit(input));
  ipcMain.handle('git:prepare-pr', () => gitService.preparePullRequest());
  ipcMain.handle('git:review-changes', () => gitService.reviewChanges());
  ipcMain.handle('sessions:list', async () => {
    const sessions = await sessionStore.loadAll();
    return sessions.map(toSessionSummary);
  });
  ipcMain.handle('sessions:load', async (_event, sessionId: string) => sessionStore.load(sessionId));
  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
    await llmService.deleteSession(sessionId);
  });
  ipcMain.handle('continuity:export', async () => {
    const sessions = await sessionStore.loadAll();
    const memory = await projectMemoryService.getSnapshot();
    const exportedAt = nowIso();
    const saveOptions: SaveDialogOptions = {
      title: 'Export sessions and memory',
      defaultPath: createContinuityExportFilename(),
      filters: [{ name: 'CodexApp continuity backup', extensions: ['json'] }],
    };
    const saveResult = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions);

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    const payload: ContinuityExportPayload = {
      format: 'codexapp-continuity-export',
      version: 1,
      exportedAt,
      workspaceRoot,
      app: {
        name: app.getName(),
        version: app.getVersion(),
      },
      sessions: sessions.map(toPersistedSessionPayload),
      memory,
    };

    await fs.writeFile(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return {
      path: saveResult.filePath,
      exportedAt,
      sessionCount: sessions.length,
      memoryCount: memory.memories.length,
      instructionsIncluded: Boolean(memory.instructions.content.trim()),
    };
  });
  ipcMain.handle('continuity:import', async (_event, input: ContinuityImportInput) => {
    const mode = input?.mode === 'replace' ? 'replace' : 'merge';
    const openOptions: OpenDialogOptions = {
      title: 'Import sessions and memory',
      properties: ['openFile'],
      filters: [{ name: 'CodexApp continuity backup', extensions: ['json'] }],
    };
    const openResult = mainWindow
      ? await dialog.showOpenDialog(mainWindow, openOptions)
      : await dialog.showOpenDialog(openOptions);

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return null;
    }

    const filePath = openResult.filePaths[0];
    if (!filePath) {
      return null;
    }
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    if (!isContinuityExportPayload(parsed)) {
      throw new Error('Selected file is not a valid CodexApp continuity export.');
    }

    const sessionResult = await sessionStore.importSessions(parsed.sessions, mode);
    const memoryResult = await projectMemoryService.importSnapshot(parsed.memory, mode);
    return {
      path: filePath,
      mode,
      importedAt: nowIso(),
      ...sessionResult,
      ...memoryResult,
    };
  });
  ipcMain.handle('automations:list', () => automationService.listAutomations());
  ipcMain.handle('automation-runs:list', () => automationService.listRuns());
  ipcMain.handle('automations:create', (_event, input: CreateAutomationInput) => automationService.createAutomation(input));
  ipcMain.handle('automations:update', (_event, input: UpdateAutomationInput) => automationService.updateAutomation(input));
  ipcMain.handle('automations:delete', (_event, automationId: string) => automationService.deleteAutomation(automationId));
  ipcMain.handle('automations:run', (_event, automationId: string) => automationService.runAutomationNow(automationId));
  ipcMain.handle('plugins:list', () => pluginService.listPlugins());
  ipcMain.handle('plugins:update-state', (_event, input: UpdatePluginStateInput) => pluginService.updatePluginState(input));
  ipcMain.handle('mcp-connectors:list', () => mcpConnectorService.listConnectors());
  ipcMain.handle('mcp-connectors:check', (_event, input: CheckMcpConnectorInput) =>
    mcpConnectorService.checkConnector(input),
  );
  ipcMain.handle('task-workspaces:create-safe-clone', (_event, input) => taskWorkspaceService.createSafeClone(input));
  ipcMain.handle('task-workspaces:discard-safe-clone', (_event, clonePath: string) =>
    taskWorkspaceService.discardSafeClone(clonePath),
  );
  ipcMain.handle('artifact-preview:capture', (_event, input: CaptureArtifactPreviewInput) =>
    previewCaptureService.capture(input),
  );

  ipcMain.handle('chat:start', async (_event, request: StartChatRequest) => {
    await llmService.startChat(request, emitChatEvent);
  });

  ipcMain.handle('chat:cancel', async (_event, request: CancelChatRequest) => {
    await llmService.cancelChat(request.requestId);
  });

  ipcMain.handle('chat:reset', async (_event, request: ResetChatRequest) => {
    const config = await configStore.get();
    await llmService.resetSession(request.sessionId, config);
  });

  ipcMain.handle('chat:resolve-approval', async (_event, input: ResolveToolApprovalInput) => {
    await llmService.resolveToolApproval(input);
  });
};

app.whenReady().then(async () => {
  app.setAppUserModelId('com.codexapp.multiapis');
  registerIpcHandlers();
  await taskWorkspaceService.pruneStaleClones();
  await automationService.initialize();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
