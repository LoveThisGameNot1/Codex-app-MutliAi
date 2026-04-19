import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  AppConfigUpdate,
  AutomationEvent,
  AutomationRecord,
  AutomationRunRecord,
  CancelChatRequest,
  ChatStreamEvent,
  CreateAutomationInput,
  DesktopApi,
  PersistedSessionPayload,
  PersistedSessionSummary,
  ResetChatRequest,
  StartChatRequest,
  UpdateAutomationInput,
} from '../shared/contracts';

const desktopApi: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  updateConfig: (update: AppConfigUpdate): Promise<AppConfig> => ipcRenderer.invoke('config:update', update),
  listAvailableModels: (config: AppConfig) => ipcRenderer.invoke('models:list', config),
  listSessions: (): Promise<PersistedSessionSummary[]> => ipcRenderer.invoke('sessions:list'),
  loadSession: (sessionId: string): Promise<PersistedSessionPayload | null> =>
    ipcRenderer.invoke('sessions:load', sessionId),
  deleteSession: (sessionId: string): Promise<void> => ipcRenderer.invoke('sessions:delete', sessionId),
  listAutomations: (): Promise<AutomationRecord[]> => ipcRenderer.invoke('automations:list'),
  listAutomationRuns: (): Promise<AutomationRunRecord[]> => ipcRenderer.invoke('automation-runs:list'),
  createAutomation: (input: CreateAutomationInput): Promise<AutomationRecord> =>
    ipcRenderer.invoke('automations:create', input),
  updateAutomation: (input: UpdateAutomationInput): Promise<AutomationRecord> =>
    ipcRenderer.invoke('automations:update', input),
  deleteAutomation: (automationId: string): Promise<void> => ipcRenderer.invoke('automations:delete', automationId),
  runAutomation: (automationId: string): Promise<AutomationRunRecord> => ipcRenderer.invoke('automations:run', automationId),
  startChat: (request: StartChatRequest): Promise<void> => ipcRenderer.invoke('chat:start', request),
  cancelChat: (request: CancelChatRequest): Promise<void> => ipcRenderer.invoke('chat:cancel', request),
  resetChat: (request: ResetChatRequest): Promise<void> => ipcRenderer.invoke('chat:reset', request),
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
