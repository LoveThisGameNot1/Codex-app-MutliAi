export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'cerebras'
  | 'sambanova'
  | 'deepinfra'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'deepseek'
  | 'xai'
  | 'ollama'
  | 'custom';

export type LlmProviderPreset = {
  id: LlmProviderId;
  label: string;
  description: string;
  baseUrl: string;
  apiKeyEnvVar?: string;
  apiKeyOptional?: boolean;
  suggestedModel: string;
  popularModels: string[];
  notes?: string;
  supportsModelDiscovery?: boolean;
};

export const DEFAULT_PROVIDER_ID: LlmProviderId = 'openai';
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const LLM_PROVIDER_PRESETS: readonly LlmProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Native OpenAI API endpoint for GPT models.',
    baseUrl: DEFAULT_BASE_URL,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    suggestedModel: 'gpt-5.4',
    popularModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4o-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Official Anthropic OpenAI SDK compatibility endpoint for Claude models.',
    baseUrl: 'https://api.anthropic.com/v1/',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    suggestedModel: 'claude-opus-4-1-20250805',
    popularModels: ['claude-opus-4-1-20250805', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219'],
    notes: 'Anthropic recommends its native API for production-only features like prompt caching, citations, and PDFs.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Official Gemini OpenAI compatibility endpoint for Gemini chat models.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    suggestedModel: 'gemini-2.5-flash',
    popularModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    notes: 'Gemini OpenAI compatibility is still in beta; direct Gemini APIs unlock the full native feature set.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'One API for many upstream providers through an OpenAI-compatible schema.',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    suggestedModel: 'openai/gpt-4o-mini',
    popularModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro-preview'],
    supportsModelDiscovery: true,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    description: 'OpenAI-compatible ultra-fast inference for hosted open and reasoning models.',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
    suggestedModel: 'gpt-oss-120b',
    popularModels: ['gpt-oss-120b', 'llama3.1-8b', 'qwen-3-235b-a22b-instruct-2507'],
    supportsModelDiscovery: true,
  },
  {
    id: 'sambanova',
    label: 'SambaNova',
    description: 'OpenAI-compatible SambaCloud inference for fast open models and coding workflows.',
    baseUrl: 'https://api.sambanova.ai/v1',
    apiKeyEnvVar: 'SAMBANOVA_API_KEY',
    suggestedModel: 'DeepSeek-V3-0324',
    popularModels: ['DeepSeek-V3-0324', 'Meta-Llama-3.1-8B-Instruct', 'Llama-4-Maverick-17B-128E-Instruct'],
    supportsModelDiscovery: true,
  },
  {
    id: 'deepinfra',
    label: 'DeepInfra',
    description: 'OpenAI-compatible hosted access to a broad catalog of open-source and multimodal models.',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    apiKeyEnvVar: 'DEEPINFRA_TOKEN',
    suggestedModel: 'deepseek-ai/DeepSeek-V3',
    popularModels: ['deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', 'openai/gpt-oss-120b'],
    supportsModelDiscovery: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Fast OpenAI-compatible inference for open models and coding models.',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    suggestedModel: 'openai/gpt-oss-20b',
    popularModels: ['openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'],
    supportsModelDiscovery: true,
  },
  {
    id: 'together',
    label: 'Together AI',
    description: 'OpenAI-compatible access to many open-source frontier models.',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    suggestedModel: 'Qwen/Qwen3.5-72B-Instruct-Turbo',
    popularModels: ['Qwen/Qwen3.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    supportsModelDiscovery: true,
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    description: 'OpenAI-compatible inference and router access for many hosted models.',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
    suggestedModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    popularModels: [
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
      'accounts/fireworks/models/deepseek-r1',
      'accounts/fireworks/models/qwen3-235b-a22b',
    ],
    supportsModelDiscovery: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'Direct DeepSeek API with OpenAI-compatible chat endpoints.',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    suggestedModel: 'deepseek-chat',
    popularModels: ['deepseek-chat', 'deepseek-reasoner'],
    supportsModelDiscovery: true,
  },
  {
    id: 'xai',
    label: 'xAI',
    description: "Grok models through xAI's OpenAI-compatible base URL.",
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnvVar: 'XAI_API_KEY',
    suggestedModel: 'grok-4.20-reasoning',
    popularModels: ['grok-4.20-reasoning', 'grok-4', 'grok-3-mini'],
    supportsModelDiscovery: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local OpenAI-compatible endpoint for running models on your own machine.',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: 'OLLAMA_API_KEY',
    apiKeyOptional: true,
    suggestedModel: 'gpt-oss:20b',
    popularModels: ['gpt-oss:20b', 'qwen2.5-coder:14b', 'llama3.2:3b'],
    supportsModelDiscovery: true,
  },
  {
    id: 'custom',
    label: 'Custom Compatible',
    description: 'Any OpenAI-compatible provider or self-hosted gateway.',
    baseUrl: DEFAULT_BASE_URL,
    suggestedModel: 'your-model-id',
    popularModels: ['your-model-id'],
    supportsModelDiscovery: true,
  },
] as const;

export const getProviderPreset = (providerId: string): LlmProviderPreset =>
  LLM_PROVIDER_PRESETS.find((preset) => preset.id === providerId) ?? LLM_PROVIDER_PRESETS[0];

export const resolveBaseUrl = (providerId: string, baseUrl?: string): string => {
  const trimmed = baseUrl?.trim();
  if (trimmed) {
    return trimmed;
  }

  return getProviderPreset(providerId).baseUrl;
};

export const isLocalhostBaseUrl = (baseUrl: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl);

export const isApiKeyOptionalForProvider = (providerId: string, baseUrl?: string): boolean => {
  const preset = getProviderPreset(providerId);
  return Boolean(preset.apiKeyOptional || (baseUrl && isLocalhostBaseUrl(baseUrl)));
};

export const getEnvApiKeyForProvider = (providerId: string): string => {
  const envVar = getProviderPreset(providerId).apiKeyEnvVar;
  return envVar ? process.env[envVar]?.trim() || '' : '';
};

