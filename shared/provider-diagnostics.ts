import type {
  AppConfig,
  ModelCapabilityAssessment,
  ModelCatalogResult,
  ProviderDiagnosticCheck,
  ProviderDiagnosticStatus,
  ProviderDiagnosticsResult,
} from './contracts';
import {
  getProviderPreset,
  isApiKeyOptionalForProvider,
  resolveBaseUrl,
} from './provider-presets';

const normalizeBaseUrl = (input: string): string => input.trim().replace(/\/+$/, '').toLowerCase();

const worstStatus = (checks: ProviderDiagnosticCheck[]): ProviderDiagnosticStatus => {
  if (checks.some((check) => check.status === 'blocked')) {
    return 'blocked';
  }

  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }

  return 'ready';
};

const capabilityStatus = (capability: ModelCapabilityAssessment['streaming']): ProviderDiagnosticStatus => {
  if (capability === 'supported' || capability === 'likely') {
    return 'ready';
  }

  if (capability === 'limited') {
    return 'warning';
  }

  return 'warning';
};

const capabilityDetail = (label: string, capability: ModelCapabilityAssessment['streaming']): string => {
  if (capability === 'supported') {
    return `${label} is explicitly supported for this model/provider pairing.`;
  }

  if (capability === 'likely') {
    return `${label} should work, but depends on the provider compatibility layer.`;
  }

  if (capability === 'limited') {
    return `${label} looks limited for this model, so autonomous agent runs may degrade.`;
  }

  return `${label} is unknown for this model. Load provider models or pick a profiled model.`;
};

const createSummary = (status: ProviderDiagnosticStatus): string => {
  if (status === 'ready') {
    return 'Provider looks ready for agent runs.';
  }

  if (status === 'blocked') {
    return 'Provider has a blocking setup issue before agent runs can work reliably.';
  }

  return 'Provider can be used, but one or more capabilities need attention.';
};

export const buildProviderDiagnostics = (
  config: AppConfig,
  selectedModelCapabilities: ModelCapabilityAssessment,
  modelCatalog: ModelCatalogResult | null,
): ProviderDiagnosticsResult => {
  const provider = getProviderPreset(config.providerId);
  const baseUrl = resolveBaseUrl(provider.id, config.baseUrl);
  const apiKey = config.apiKey.trim();
  const apiKeyOptional = isApiKeyOptionalForProvider(provider.id, baseUrl);
  const officialEndpoint = normalizeBaseUrl(baseUrl) === normalizeBaseUrl(provider.baseUrl);
  const selectedModel = modelCatalog?.models.find((model) => model.id === config.model);
  const checks: ProviderDiagnosticCheck[] = [];

  checks.push({
    id: 'auth',
    label: 'Authentication',
    status: apiKey || apiKeyOptional ? 'ready' : 'blocked',
    detail: apiKey
      ? `${provider.label} API key is configured locally.`
      : apiKeyOptional
        ? `${provider.label} can run without an API key for this local or self-hosted endpoint.`
        : `${provider.label} needs an API key before live model calls can work.`,
  });

  checks.push({
    id: 'endpoint',
    label: 'Endpoint',
    status: officialEndpoint || provider.id === 'custom' || apiKeyOptional ? 'ready' : 'warning',
    detail: officialEndpoint
      ? `Using the official ${provider.label} endpoint.`
      : `Using a custom endpoint: ${baseUrl}. Native provider features may depend on gateway compatibility.`,
  });

  checks.push({
    id: 'model-discovery',
    label: 'Model discovery',
    status: modelCatalog?.source === 'live' ? 'ready' : modelCatalog ? 'warning' : 'warning',
    detail: modelCatalog
      ? modelCatalog.source === 'live'
        ? `Live model discovery succeeded with ${modelCatalog.models.length} models.`
        : modelCatalog.warning ?? 'Using preset fallback models because live discovery is unavailable.'
      : 'Model catalog has not been loaded yet, so diagnostics rely on preset heuristics.',
  });

  checks.push({
    id: 'selected-model',
    label: 'Selected model',
    status: selectedModel || !modelCatalog ? 'ready' : 'warning',
    detail: selectedModel
      ? `Selected model was found in the current model catalog.`
      : modelCatalog
        ? `Selected model was not found in the loaded catalog; it may still work through a gateway or alias.`
        : `Selected model is evaluated heuristically until the catalog is loaded.`,
  });

  checks.push({
    id: 'streaming',
    label: 'Streaming',
    status: capabilityStatus(selectedModelCapabilities.streaming),
    detail: capabilityDetail('Streaming', selectedModelCapabilities.streaming),
  });

  checks.push({
    id: 'tool-calling',
    label: 'Tool calling',
    status: capabilityStatus(selectedModelCapabilities.toolCalling),
    detail: capabilityDetail('Tool calling', selectedModelCapabilities.toolCalling),
  });

  checks.push({
    id: 'agent-fit',
    label: 'Agent fit',
    status: selectedModelCapabilities.recommendedForAgent ? 'ready' : 'warning',
    detail: selectedModelCapabilities.recommendedForAgent
      ? 'This model is recommended for multi-step agent runs with tools.'
      : 'This model is not a strong fit for autonomous tool-heavy workflows.',
  });

  if (provider.id === 'openai' || provider.id === 'anthropic') {
    checks.push({
      id: 'consumer-plan',
      label: 'Subscription vs API',
      status: apiKey ? 'ready' : 'warning',
      detail:
        provider.id === 'openai'
          ? 'ChatGPT Plus/Pro is separate from OpenAI API billing; this app needs an API key for OpenAI calls.'
          : 'Claude Pro/Max is separate from Anthropic API billing; this app needs an Anthropic API key for Claude calls.',
    });
  }

  const overallStatus = worstStatus(checks);
  return {
    providerId: provider.id,
    providerLabel: provider.label,
    baseUrl,
    model: config.model,
    generatedAt: new Date().toISOString(),
    overallStatus,
    summary: createSummary(overallStatus),
    checks,
  };
};
