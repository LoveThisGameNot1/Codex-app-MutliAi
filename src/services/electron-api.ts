import type {
  AppConfig,
  AppConfigUpdate,
  ModelCatalogResult,
  AutomationEvent,
  AutomationRecord,
  AutomationRunRecord,
  CancelChatRequest,
  ChatStreamEvent,
  CreateAutomationInput,
  DesktopAppInfo,
  PersistedSessionPayload,
  PersistedSessionSummary,
  ResetChatRequest,
  ResolveToolApprovalInput,
  StartChatRequest,
  UpdateAutomationInput,
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
export const listSessions = (): Promise<PersistedSessionSummary[]> => requireDesktopApi().listSessions();
export const loadSession = (sessionId: string): Promise<PersistedSessionPayload | null> =>
  requireDesktopApi().loadSession(sessionId);
export const deleteSession = (sessionId: string): Promise<void> => requireDesktopApi().deleteSession(sessionId);
export const listAutomations = (): Promise<AutomationRecord[]> => requireDesktopApi().listAutomations();
export const listAutomationRuns = (): Promise<AutomationRunRecord[]> => requireDesktopApi().listAutomationRuns();
export const createAutomation = (input: CreateAutomationInput): Promise<AutomationRecord> =>
  requireDesktopApi().createAutomation(input);
export const updateAutomation = (input: UpdateAutomationInput): Promise<AutomationRecord> =>
  requireDesktopApi().updateAutomation(input);
export const deleteAutomation = (automationId: string): Promise<void> => requireDesktopApi().deleteAutomation(automationId);
export const runAutomation = (automationId: string): Promise<AutomationRunRecord> =>
  requireDesktopApi().runAutomation(automationId);
export const startChat = (request: StartChatRequest): Promise<void> => requireDesktopApi().startChat(request);
export const cancelChat = (request: CancelChatRequest): Promise<void> => requireDesktopApi().cancelChat(request);
export const resetChat = (request: ResetChatRequest): Promise<void> => requireDesktopApi().resetChat(request);
export const resolveToolApproval = (input: ResolveToolApprovalInput): Promise<void> =>
  requireDesktopApi().resolveToolApproval(input);
export const onChatEvent = (listener: (event: ChatStreamEvent) => void): (() => void) =>
  requireDesktopApi().onChatEvent(listener);
export const onAutomationEvent = (listener: (event: AutomationEvent) => void): (() => void) =>
  requireDesktopApi().onAutomationEvent(listener);
