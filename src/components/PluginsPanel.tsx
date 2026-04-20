import { useMemo } from 'react';
import { LLM_PROVIDER_PRESETS, getProviderPreset } from '../../shared/provider-presets';
import { inferConfiguredModelCapabilities } from '../../shared/model-capabilities';
import { summarizeAutomationToolPolicy } from '../../shared/tool-policy';
import { useAppStore } from '@/store/app-store';

const capabilityTone = (supported: boolean): string =>
  supported
    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
    : 'border-amber-300/30 bg-amber-300/10 text-amber-100';

export const PluginsPanel = () => {
  const config = useAppStore((state) => state.config);
  const automations = useAppStore((state) => state.automations);
  const providerPreset = useMemo(() => getProviderPreset(config.providerId), [config.providerId]);
  const capabilities = useMemo(() => inferConfiguredModelCapabilities(config), [config]);
  const automationPolicySummary = useMemo(() => summarizeAutomationToolPolicy(config.toolPolicy), [config.toolPolicy]);

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
      title: 'Artifacts',
      value: 'Code + Preview',
      description: 'Artifacts stream into Monaco-backed code view or a sandboxed preview surface for HTML and React output.',
    },
    {
      title: 'Automations',
      value: `${automations.length} configured`,
      description: `${automationPolicySummary.headline} ${automationPolicySummary.detail}`,
    },
  ];

  return (
    <section className="flex min-h-[680px] flex-col rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-panel backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-violet-200/80">Plugins</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Integrations and runtime surfaces</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          This view gives us a clearer picture of what is already wired into the app today: providers, system tools,
          artifacts, and automation capabilities.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {integrationCards.map((card) => (
          <article key={card.title} className="rounded-[26px] border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.title}</p>
            <p className="mt-3 text-lg font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-[26px] border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Current provider profile</p>
            <p className="mt-1 text-sm text-slate-400">
              {providerPreset.label} via {config.baseUrl}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${capabilityTone(capabilities.recommendedForAgent)}`}
          >
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

        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">What this panel means today</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            <li>Built-in integrations are already real product surfaces, not placeholders.</li>
            <li>External marketplace-style plugins are still on the roadmap, so this screen stays honest about that.</li>
            <li>The current provider and tool policy decide how agent-like the app can behave in practice.</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-[26px] border border-white/10 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-white">Available provider presets</p>
        <p className="mt-1 text-sm text-slate-400">
          Quick overview of the built-in model endpoints already bundled into the runtime.
        </p>
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
    </section>
  );
};
