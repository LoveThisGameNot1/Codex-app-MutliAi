import { useMemo, useState } from 'react';
import { LLM_PROVIDER_PRESETS, getProviderPreset } from '../../shared/provider-presets';
import { inferConfiguredModelCapabilities } from '../../shared/model-capabilities';
import { summarizeAutomationToolPolicy } from '../../shared/tool-policy';
import { pluginRuntime } from '@/services/plugin-runtime';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/utils/cn';

const capabilityTone = (supported: boolean): string =>
  supported
    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
    : 'border-amber-300/30 bg-amber-300/10 text-amber-100';

const pluginStatusTone = (status: string): string => {
  switch (status) {
    case 'enabled':
      return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
    case 'invalid':
      return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
    default:
      return 'border-slate-300/20 bg-slate-300/10 text-slate-200';
  }
};

const sectionStyle = 'rounded-[26px] border border-white/10 bg-slate-950/60 p-4';

export const PluginsPanel = () => {
  const config = useAppStore((state) => state.config);
  const automations = useAppStore((state) => state.automations);
  const plugins = useAppStore((state) => state.plugins);
  const providerPreset = useMemo(() => getProviderPreset(config.providerId), [config.providerId]);
  const capabilities = useMemo(() => inferConfiguredModelCapabilities(config), [config]);
  const automationPolicySummary = useMemo(() => summarizeAutomationToolPolicy(config.toolPolicy), [config.toolPolicy]);
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const integrationCards = [
    {
      title: 'Model providers',
      value: `${LLM_PROVIDER_PRESETS.length} presets`,
      description: `Current provider: ${providerPreset.label}. Native adapters are active where available, with compatible fallback transport when needed.`,
    },
    {
      title: 'System tools',
      value: '3 built-ins',
      description: 'read_file, write_file, and execute_terminal run through the Electron main process with policy checks and approval flows.',
    },
    {
      title: 'Plugin registry',
      value: `${plugins.length} discovered`,
      description: 'Workspace plugins are loaded from manifest files under the local plugins directory and gated by explicit permissions.',
    },
    {
      title: 'Automations',
      value: `${automations.length} configured`,
      description: `${automationPolicySummary.headline} ${automationPolicySummary.detail}`,
    },
  ];

  const enabledPlugins = plugins.filter((plugin) => plugin.enabled).length;
  const invalidPlugins = plugins.filter((plugin) => plugin.status === 'invalid').length;

  const refreshPlugins = async () => {
    setError(null);
    setNotice(null);
    await pluginRuntime.refreshPlugins();
    setNotice('Plugin registry refreshed.');
  };

  const togglePlugin = async (id: string, enabled: boolean) => {
    setBusyPluginId(id);
    setError(null);
    setNotice(null);

    try {
      const plugin = await pluginRuntime.updatePluginState({ id, enabled });
      setNotice(`${plugin.name} is now ${plugin.enabled ? 'enabled' : 'disabled'}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update plugin state.');
    } finally {
      setBusyPluginId(null);
    }
  };

  return (
    <section className="flex min-h-[680px] flex-col rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-violet-200/80">Plugins</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Integrations and runtime surfaces</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Manage local plugin manifests, requested permissions, and the integration surfaces already wired into the app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshPlugins()}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
        >
          Refresh registry
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {integrationCards.map((card) => (
          <article key={card.title} className={sectionStyle}>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.title}</p>
            <p className="mt-3 text-lg font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
          </article>
        ))}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,0.6fr)_minmax(280px,0.4fr)]">
        <div className={sectionStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Plugin manager</p>
              <p className="mt-1 text-sm text-slate-400">
                {enabledPlugins} enabled, {invalidPlugins} invalid, {plugins.length} total.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {plugins.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-500">
                No local plugins found. Add a plugin manifest under plugins/&lt;plugin-id&gt;/plugin.json.
              </div>
            ) : (
              plugins.map((plugin) => (
                <article key={plugin.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{plugin.name}</p>
                        <span className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]', pluginStatusTone(plugin.status))}>
                          {plugin.status}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                          v{plugin.version}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{plugin.description}</p>
                      <p className="mt-2 truncate text-xs text-slate-500">{plugin.sourcePath}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void togglePlugin(plugin.id, !plugin.enabled)}
                      disabled={busyPluginId === plugin.id || plugin.status === 'invalid'}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyPluginId === plugin.id ? 'Updating...' : plugin.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Capabilities</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {plugin.capabilities.length === 0 ? (
                          <span className="text-xs text-slate-500">No capabilities declared.</span>
                        ) : (
                          plugin.capabilities.map((capability) => (
                            <span key={`${capability.kind}:${capability.name}`} className="rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                              {capability.kind}: {capability.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Permissions</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {plugin.permissions.length === 0 ? (
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                            No special permissions
                          </span>
                        ) : (
                          plugin.permissions.map((permission) => (
                            <span key={permission} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                              {permission}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">{plugin.statusDetail}</p>
                </article>
              ))
            )}
          </div>
        </div>

        <div className={sectionStyle}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Current provider profile</p>
              <p className="mt-1 text-sm text-slate-400">
                {providerPreset.label} via {config.baseUrl}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs ${capabilityTone(capabilities.recommendedForAgent)}`}>
              {capabilities.recommendedForAgent ? 'Agent-ready profile' : 'Use with caution'}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.streaming !== 'limited')}`}>
              Streaming {capabilities.streaming}
            </span>
            <span className={`rounded-full border px-3 py-1 ${capabilityTone(capabilities.toolCalling !== 'limited')}`}>
              Tool calling {capabilities.toolCalling}
            </span>
            <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-sky-100">
              Transport {capabilities.transport}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Available provider presets</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {LLM_PROVIDER_PRESETS.map((preset) => (
                <span
                  key={preset.id}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    preset.id === config.providerId
                      ? 'border-sky-300/30 bg-sky-300/10 text-sky-100'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {preset.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
