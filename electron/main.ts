import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppConfigUpdate,
  CreateAutomationInput,
  CancelChatRequest,
  ChatStreamEvent,
  ResolveToolApprovalInput,
  ResetChatRequest,
  StartChatRequest,
  UpdateAutomationInput,
} from '../shared/contracts';
import { AutomationService } from './automation-service';
import { AutomationStore } from './automation-store';
import { ConfigStore } from './config-store';
import { LlmService } from './llm-service';
import { SessionStore, toSessionSummary } from './session-store';
import { TaskWorkspaceService } from './task-workspace-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const workspaceRoot = process.cwd();
const configStore = new ConfigStore();
const sessionStore = new SessionStore(app.getPath('userData'));
const automationStore = new AutomationStore(app.getPath('userData'));
const llmService = new LlmService(workspaceRoot, sessionStore);
const taskWorkspaceService = new TaskWorkspaceService(workspaceRoot, path.join(app.getPath('userData'), 'task-clones'));
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
  ipcMain.handle('sessions:list', async () => {
    const sessions = await sessionStore.loadAll();
    return sessions.map(toSessionSummary);
  });
  ipcMain.handle('sessions:load', async (_event, sessionId: string) => sessionStore.load(sessionId));
  ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
    await llmService.deleteSession(sessionId);
  });
  ipcMain.handle('automations:list', () => automationService.listAutomations());
  ipcMain.handle('automation-runs:list', () => automationService.listRuns());
  ipcMain.handle('automations:create', (_event, input: CreateAutomationInput) => automationService.createAutomation(input));
  ipcMain.handle('automations:update', (_event, input: UpdateAutomationInput) => automationService.updateAutomation(input));
  ipcMain.handle('automations:delete', (_event, automationId: string) => automationService.deleteAutomation(automationId));
  ipcMain.handle('automations:run', (_event, automationId: string) => automationService.runAutomationNow(automationId));
  ipcMain.handle('task-workspaces:create-safe-clone', (_event, input) => taskWorkspaceService.createSafeClone(input));
  ipcMain.handle('task-workspaces:discard-safe-clone', (_event, clonePath: string) =>
    taskWorkspaceService.discardSafeClone(clonePath),
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
