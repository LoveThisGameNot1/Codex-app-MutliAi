import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutomationPanel } from '@/components/AutomationPanel';
import { useAppStore } from '@/store/app-store';
import { chatRuntime } from '@/services/chat-runtime';
import { listAvailableModels } from '@/services/electron-api';
import type { ModelCatalogResult } from '../../shared/contracts';
import { inferConfiguredModelCapabilities } from '../../shared/model-capabilities';
import {
  getProviderPreset,
  isApiKeyOptionalForProvider,
  LLM_PROVIDER_PRESETS,
  resolveBaseUrl,
} from '../../shared/provider-presets';

const capabilityToneByLevel = {
  supported: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  likely: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  limited: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  unknown: 'border-white/10 bg-white/5 text-slate-300',
} as const;

const transportTone = {
  native: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  compatible: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  'gateway-unknown': 'border-amber-300/30 bg-amber-300/10 text-amber-100',
} as const;

const recommendationTone = (recommended: boolean): string =>
  recommended
    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
    : 'border-amber-300/30 bg-amber-300/10 text-amber-100';

const modelChipTone = (
  active: boolean,
  recommendedForAgent?: boolean,
): string => {
  if (active) {
    return recommendedForAgent
      ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100 shadow-[0_0_0_1px_rgba(110,231,183,0.12)]'
      : 'border-amber-300/40 bg-amber-300/15 text-amber-100 shadow-[0_0_0_1px_rgba(253,230,138,0.1)]';
  }

  if (recommendedForAgent === true) {
    return 'border-emerald-400/20 bg-emerald-400/5 text-slate-200 hover:bg-emerald-400/10';
  }

  if (recommendedForAgent === false) {
    return 'border-amber-400/20 bg-amber-400/5 text-slate-200 hover:bg-amber-400/10';
  }

  return 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10';
};

export const SettingsPanel = () => {
  const config = useAppStore((state) => state.config);
  const updateConfig = useAppStore((state) => state.updateConfig);
  const isOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const appInfo = useAppStore((state) => state.appInfo);
  const persistedSessions = useAppStore((state) => state.persistedSessions);
  const activeSessionId = useAppStore((state) => state.sessionId);
  const isStreaming = useAppStore((state) => state.isStreaming);

  const workspaceLabel = useMemo(() => appInfo?.workspaceRoot || 'Unavailable', [appInfo]);
  const providerPreset = useMemo(() => getProviderPreset(config.providerId), [config.providerId]);
  const apiKeyOptional = useMemo(
    () => isApiKeyOptionalForProvider(config.providerId, config.baseUrl),
    [config.baseUrl, config.providerId],
  );
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResult | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const selectedModelCapabilities = useMemo(() => {
    const discoveredModel = modelCatalog?.models.find((model) => model.id === config.model);
    return discoveredModel?.capabilities ?? inferConfiguredModelCapabilities(config);
  }, [config, modelCatalog]);
  const latestModelRequestId = useRef(0);
  const autoRefreshKey = useMemo(
    () => `${config.providerId}::${config.baseUrl.trim()}::${config.apiKey}`,
    [config.apiKey, config.baseUrl, config.providerId],
  );

  useEffect(() => {
    setModelCatalog(null);
    setModelsError(null);
    setModelsLoading(false);
  }, [config.providerId, config.baseUrl, config.apiKey]);

  const loadProviderModels = useCallback(async () => {
    const requestId = ++latestModelRequestId.current;
    setModelsLoading(true);
    setModelsError(null);

    try {
      const catalog = await listAvailableModels(config);
      if (latestModelRequestId.current !== requestId) {
        return;
      }
      setModelCatalog(catalog);
    } catch (error) {
      if (latestModelRequestId.current !== requestId) {
        return;
      }
      setModelsError(error instanceof Error ? error.message : 'Unable to load models for this provider right now.');
    } finally {
      if (latestModelRequestId.current === requestId) {
        setModelsLoading(false);
      }
    }
  }, [config]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void loadProviderModels();
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoRefreshKey, isOpen, loadProviderModels]);

  if (!isOpen) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Runtime Settings</h3>
          <p className="mt-1 text-sm text-slate-400">
            API credentials stay in the Electron main process and are persisted in the app user data folder. The app now
            supports multiple OpenAI-compatible providers, not just OpenAI.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Provider
          <select
            value={config.providerId}
            onChange={(event) => {
              const nextPreset = getProviderPreset(event.target.value);
              updateConfig((current) => ({
                ...current,
                providerId: nextPreset.id,
                baseUrl: resolveBaseUrl(nextPreset.id, nextPreset.baseUrl),
              }));
            }}
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          >
            {LLM_PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          API Key
          <input
            type="password"
            value={config.apiKey}
            onChange={(event) =>
              updateConfig((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            placeholder={
              apiKeyOptional
                ? `Optional for ${providerPreset.label}`
                : providerPreset.apiKeyEnvVar
                  ? `Use ${providerPreset.apiKeyEnvVar} or paste key here`
                  : 'Paste provider API key'
            }
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Base URL
          <input
            type="text"
            value={config.baseUrl}
            onChange={(event) =>
              updateConfig((current) => ({
                ...current,
                baseUrl: event.target.value,
              }))
            }
            placeholder={providerPreset.baseUrl}
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Model
          <input
            type="text"
            value={config.model}
            onChange={(event) =>
              updateConfig((current) => ({
                ...current,
                model: event.target.value,
              }))
            }
            placeholder={providerPreset.suggestedModel}
            className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400/40"
          />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium text-slate-100">Selected Model Health</p>
            <p className="mt-1 text-xs text-slate-500">{selectedModelCapabilities.summary}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs ${recommendationTone(selectedModelCapabilities.recommendedForAgent)}`}>
            {selectedModelCapabilities.recommendedForAgent ? 'Recommended for agent runs' : 'Use with caution'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 ${capabilityToneByLevel[selectedModelCapabilities.streaming]}`}>
            Streaming: {selectedModelCapabilities.streaming}
          </span>
          <span className={`rounded-full border px-3 py-1 ${capabilityToneByLevel[selectedModelCapabilities.toolCalling]}`}>
            Tool calling: {selectedModelCapabilities.toolCalling}
          </span>
          <span className={`rounded-full border px-3 py-1 ${transportTone[selectedModelCapabilities.transport]}`}>
            Transport: {selectedModelCapabilities.transport}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1 text-emerald-100">supported</span>
          <span className="rounded-full border border-sky-300/20 bg-sky-300/5 px-3 py-1 text-sky-100">likely</span>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-amber-100">limited</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">unknown</span>
        </div>
        {selectedModelCapabilities.notes.length > 0 ? (
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            {selectedModelCapabilities.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/5 px-4 py-4 text-sm text-slate-300">
        <p className="font-medium text-sky-100">{providerPreset.label}</p>
        <p className="mt-1 text-slate-400">{providerPreset.description}</p>
        <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
          <span>Base URL: {providerPreset.baseUrl}</span>
          <span>Suggested model: {providerPreset.suggestedModel}</span>
          <span>
            API key: {apiKeyOptional ? 'optional for local/self-hosted usage' : providerPreset.apiKeyEnvVar || 'required'}
          </span>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Quick model picks</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {providerPreset.popularModels.map((modelId) => {
              const active = config.model === modelId;
              return (
                <button
                  key={modelId}
                  type="button"
                  onClick={() =>
                    updateConfig((current) => ({
                      ...current,
                      model: modelId,
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border-sky-300/50 bg-sky-300/15 text-sky-100'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {modelId}
                </button>
              );
            })}
          </div>
        </div>
        {providerPreset.notes ? <p className="mt-3 text-xs text-amber-200/80">{providerPreset.notes}</p> : null}
        {config.providerId === 'anthropic' || config.providerId === 'gemini' ? (
          <p className="mt-3 text-xs text-sky-200/80">
            Native {providerPreset.label} streaming and tool-calling are used when the base URL stays on the official
            preset endpoint. If you override the endpoint, the app falls back to the OpenAI-compatible transport so
            custom gateways still keep working.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          Presets cover OpenAI, Anthropic, Gemini, OpenRouter, Cerebras, SambaNova, DeepInfra, Groq, Together,
          Fireworks, DeepSeek, xAI, Ollama, plus a custom OpenAI-compatible endpoint.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium text-slate-100">Live Model Catalog</p>
            <p className="mt-1 text-xs text-slate-500">
              Load provider models from the current endpoint when supported. Preset suggestions are merged in as a
              fallback so you always have something selectable. The catalog also refreshes automatically when the
              provider, endpoint, or API key changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadProviderModels()}
            disabled={modelsLoading}
            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
          >
            {modelsLoading ? 'Loading Models...' : 'Load Models'}
          </button>
        </div>

        {modelsError ? <p className="mt-3 text-xs text-rose-300">{modelsError}</p> : null}
        {modelCatalog?.warning ? <p className="mt-3 text-xs text-amber-200/80">{modelCatalog.warning}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Source: {modelCatalog?.source === 'live' ? 'live provider lookup' : 'preset suggestions'}</span>
          {modelCatalog ? <span>Fetched: {new Date(modelCatalog.fetchedAt).toLocaleString()}</span> : null}
          {modelCatalog ? <span>Models: {modelCatalog.models.length}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1 text-emerald-100">
            strong agent fit
          </span>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-amber-100">
            caution
          </span>
          <span className="rounded-full border border-sky-300/20 bg-sky-300/5 px-3 py-1 text-sky-100">
            metadata-backed
          </span>
        </div>

        <div className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3">
          {!modelCatalog ? (
            <p className="text-sm text-slate-500">Load the catalog to browse models for the selected provider.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {modelCatalog.models.map((model) => {
                const active = config.model === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() =>
                      updateConfig((current) => ({
                        ...current,
                        model: model.id,
                      }))
                    }
                    title={
                      model.capabilities
                        ? `${model.id}\nStreaming: ${model.capabilities.streaming}\nTool calling: ${model.capabilities.toolCalling}\nTransport: ${model.capabilities.transport}`
                        : model.ownedBy
                          ? `Owned by ${model.ownedBy}`
                          : model.id
                    }
                    className={`rounded-2xl border px-3 py-2 text-left text-xs transition ${modelChipTone(active, model.capabilities?.recommendedForAgent)}`}
                  >
                    <span className="block font-medium">{model.id}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {model.capabilities ? (
                        <>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${capabilityToneByLevel[model.capabilities.streaming]}`}>
                            stream {model.capabilities.streaming}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${capabilityToneByLevel[model.capabilities.toolCalling]}`}>
                            tools {model.capabilities.toolCalling}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                          no metadata
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <label className="mt-4 flex flex-col gap-2 text-sm text-slate-300">
        System Prompt
        <textarea
          value={config.systemPrompt}
          onChange={(event) =>
            updateConfig((current) => ({
              ...current,
              systemPrompt: event.target.value,
            }))
          }
          rows={10}
          className="min-h-[220px] rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
          Workspace root: <span className="text-slate-200">{workspaceLabel}</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void chatRuntime.refreshSessionLibrary()}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Refresh Sessions
          </button>
          <button
            type="button"
            onClick={() => void chatRuntime.persistConfig()}
            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Save Settings
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Saved Sessions</h4>
            <p className="mt-1 text-sm text-slate-500">
              Resume a persisted backend conversation, including reconstructed artifacts.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {persistedSessions.length} stored
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Stop the current response before switching or deleting the active session.
        </p>

        <div className="mt-4 space-y-3">
          {persistedSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 text-sm text-slate-500">
              No persisted sessions yet.
            </div>
          ) : null}

          {persistedSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const loadDisabled = isStreaming || isActive;
            const deleteDisabled = isStreaming && isActive;
            return (
              <div
                key={session.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{session.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{session.preview}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(session.updatedAt).toLocaleString()} | {session.messageCount} messages
                  </p>
                </div>
                <div className="flex gap-2 self-start md:self-center">
                  <button
                    type="button"
                    disabled={loadDisabled}
                    onClick={() => void chatRuntime.loadPersistedSession(session.id)}
                    className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    {isActive ? 'Current Session' : 'Load Session'}
                  </button>
                  <button
                    type="button"
                    disabled={deleteDisabled}
                    onClick={() => {
                      const confirmed = window.confirm(
                        isActive
                          ? 'Delete the current session and start a fresh conversation?'
                          : 'Delete this saved session permanently?',
                      );
                      if (!confirmed) {
                        return;
                      }

                      void chatRuntime.deletePersistedSession(session.id);
                    }}
                    className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AutomationPanel />
    </section>
  );
};
