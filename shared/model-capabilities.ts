import type { AppConfig, ModelCapabilityAssessment, ModelCapabilityLevel } from './contracts';
import { getProviderPreset, resolveBaseUrl, type LlmProviderId } from './provider-presets';

export type DiscoveredModelCapabilityMetadata = {
  supportedGenerationMethods?: string[];
  supportedParameters?: string[];
  outputModalities?: string[];
  anthropicCapabilities?: {
    structuredOutputs?: boolean;
    codeExecution?: boolean;
    contextManagement?: boolean;
    thinking?: boolean;
  };
  sourceLabel?: string;
};

const normalizeBaseUrl = (input: string): string => input.trim().replace(/\/+$/, '').toLowerCase();
const normalizeModelId = (input: string): string => input.trim().toLowerCase();

const CHATLIKE_MODEL_PATTERNS = [
  'gpt',
  'claude',
  'gemini',
  'grok',
  'deepseek',
  'qwen',
  'llama',
  'mixtral',
  'mistral',
  'command',
  'sonnet',
  'opus',
  'haiku',
  'instruct',
  'chat',
  'coder',
];

const NON_AGENT_MODEL_PATTERNS = [
  'embedding',
  'embed',
  'rerank',
  'moderation',
  'tts',
  'transcrib',
  'speech',
  'whisper',
  'image',
  'vision-preview',
  'audio',
  'sdxl',
  'stable-diffusion',
];

const GEMINI_FUNCTION_CALLING_SUPPORTED_PREFIXES = [
  'gemini-3.1-pro',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

const isOfficialPresetEndpoint = (providerId: string, baseUrl: string): boolean => {
  const provider = getProviderPreset(providerId);
  return normalizeBaseUrl(resolveBaseUrl(providerId, baseUrl)) === normalizeBaseUrl(provider.baseUrl);
};

const isChatlikeModel = (modelId: string): boolean => {
  const normalized = normalizeModelId(modelId);
  return CHATLIKE_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const isClearlyNonAgentModel = (modelId: string): boolean => {
  const normalized = normalizeModelId(modelId);
  return NON_AGENT_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const buildSummary = (
  streaming: ModelCapabilityLevel,
  toolCalling: ModelCapabilityLevel,
  recommendedForAgent: boolean,
): string => {
  if (!recommendedForAgent) {
    return 'This model looks weak for the app agent workflow.';
  }

  if (streaming === 'supported' && toolCalling === 'supported') {
    return 'Strong fit for the agent workflow with streaming and tool-calling.';
  }

  if (streaming === 'supported' || streaming === 'likely' || toolCalling === 'supported' || toolCalling === 'likely') {
    return 'Usable for the agent workflow, but some capabilities depend on provider compatibility.';
  }

  return 'The app can try this model, but runtime behavior may vary.';
};

const createAssessment = (
  streaming: ModelCapabilityLevel,
  toolCalling: ModelCapabilityLevel,
  notes: string[],
  transport: ModelCapabilityAssessment['transport'],
): ModelCapabilityAssessment => {
  const recommendedForAgent =
    (streaming === 'supported' || streaming === 'likely') && (toolCalling === 'supported' || toolCalling === 'likely');

  return {
    streaming,
    toolCalling,
    recommendedForAgent,
    summary: buildSummary(streaming, toolCalling, recommendedForAgent),
    notes,
    transport,
  };
};

const inferCompatibleProviderAssessment = (
  providerId: LlmProviderId,
  modelId: string,
  transport: ModelCapabilityAssessment['transport'],
): ModelCapabilityAssessment => {
  const notes: string[] = [];

  if (!isChatlikeModel(modelId)) {
    notes.push('The model id does not look like a standard chat/instruct model.');
    return createAssessment('limited', 'limited', notes, transport);
  }

  if (providerId === 'ollama') {
    notes.push('Local Ollama models vary a lot in function-calling quality, so tool use is treated conservatively.');
    return createAssessment('likely', 'limited', notes, transport);
  }

  if (providerId === 'custom' || providerId === 'openrouter') {
    notes.push('Capability quality depends on the upstream model and gateway translation layer.');
    return createAssessment('likely', 'likely', notes, 'gateway-unknown');
  }

  notes.push('This provider uses an OpenAI-compatible transport, so tool-calling quality depends on endpoint fidelity.');
  return createAssessment('likely', 'likely', notes, transport);
};

export const inferModelCapabilities = (
  providerId: string,
  modelId: string,
  baseUrl: string,
): ModelCapabilityAssessment => {
  const normalizedModelId = normalizeModelId(modelId);
  const officialEndpoint = isOfficialPresetEndpoint(providerId, baseUrl);
  const transport: ModelCapabilityAssessment['transport'] =
    providerId === 'custom' || providerId === 'openrouter'
      ? 'gateway-unknown'
      : officialEndpoint
        ? providerId === 'anthropic' || providerId === 'gemini'
          ? 'native'
          : 'compatible'
        : 'gateway-unknown';

  if (!normalizedModelId) {
    return createAssessment('unknown', 'unknown', ['Enter a model id to evaluate this provider/model pairing.'], transport);
  }

  if (isClearlyNonAgentModel(normalizedModelId)) {
    return createAssessment(
      'limited',
      'limited',
      ['This looks like a non-chat model family, so the agent workflow is not a good fit.'],
      transport,
    );
  }

  switch (providerId as LlmProviderId) {
    case 'openai': {
      if (/^gpt-(5|4\.1|4o)/.test(normalizedModelId)) {
        return createAssessment('supported', 'supported', ['OpenAI GPT chat models are the strongest fit for this app.'], transport);
      }

      if (/^(o3|o4)/.test(normalizedModelId) || normalizedModelId.includes('gpt')) {
        return createAssessment('likely', 'likely', ['The model should work, but the app has the highest confidence in GPT chat families.'], transport);
      }

      return createAssessment('unknown', 'unknown', ['This OpenAI model family is not explicitly profiled yet.'], transport);
    }
    case 'anthropic': {
      if (normalizedModelId.includes('claude')) {
        return officialEndpoint
          ? createAssessment(
              'supported',
              'supported',
              ['The official Anthropic endpoint uses the native SDK path in this app.'],
              'native',
            )
          : createAssessment(
              'likely',
              'likely',
              ['A custom Anthropic gateway falls back to the OpenAI-compatible transport in this app.'],
              'gateway-unknown',
            );
      }

      return createAssessment('limited', 'limited', ['This does not look like a Claude chat model.'], transport);
    }
    case 'gemini': {
      if (normalizedModelId.startsWith('gemini-2.5') || normalizedModelId.startsWith('gemini-2.0')) {
        return officialEndpoint
          ? createAssessment(
              'supported',
              'supported',
              ['The official Gemini endpoint uses the native SDK path in this app.'],
              'native',
            )
          : createAssessment(
              'likely',
              'likely',
              ['A custom Gemini gateway falls back to the OpenAI-compatible transport in this app.'],
              'gateway-unknown',
            );
      }

      if (normalizedModelId.includes('gemini')) {
        return createAssessment('likely', 'likely', ['Gemini chat models should work, but this exact family is not profiled as strongly.'], transport);
      }

      return createAssessment('limited', 'limited', ['This does not look like a Gemini chat model.'], transport);
    }
    case 'custom':
    case 'openrouter':
    case 'cerebras':
    case 'sambanova':
    case 'deepinfra':
    case 'groq':
    case 'together':
    case 'fireworks':
    case 'deepseek':
    case 'xai':
    case 'ollama': {
      return inferCompatibleProviderAssessment(providerId as LlmProviderId, normalizedModelId, transport);
    }
    default: {
      return createAssessment('unknown', 'unknown', ['This provider is not profiled yet.'], transport);
    }
  }
};

export const inferDiscoveredModelCapabilities = (
  providerId: string,
  modelId: string,
  baseUrl: string,
  metadata: DiscoveredModelCapabilityMetadata,
): ModelCapabilityAssessment => {
  const fallback = inferModelCapabilities(providerId, modelId, baseUrl);
  const notes = [...fallback.notes];

  if (metadata.sourceLabel) {
    notes.unshift(`Provider metadata source: ${metadata.sourceLabel}.`);
  }

  if (providerId === 'gemini') {
    const supportedActions = new Set((metadata.supportedGenerationMethods ?? []).map((entry) => entry.trim()));
    const canGenerateContent = supportedActions.has('generateContent');
    const normalizedModelId = normalizeModelId(modelId);
    const functionCallingSupported = GEMINI_FUNCTION_CALLING_SUPPORTED_PREFIXES.some((prefix) =>
      normalizedModelId.startsWith(prefix),
    );

    if (!canGenerateContent) {
      notes.push('Gemini model metadata does not list generateContent support, so chat streaming is not a safe assumption.');
      return createAssessment('limited', 'limited', notes, fallback.transport);
    }

    if (functionCallingSupported) {
      notes.push('The Gemini models.list metadata confirms generateContent support, and this model family is documented for function calling.');
      return createAssessment('supported', 'supported', notes, fallback.transport);
    }

    notes.push('Gemini metadata confirms text generation, but this model family is not listed in the documented function-calling support matrix.');
    return createAssessment('supported', 'limited', notes, fallback.transport);
  }

  if (providerId === 'openrouter') {
    const supportedParameters = new Set((metadata.supportedParameters ?? []).map((entry) => entry.trim()));
    const outputModalities = new Set((metadata.outputModalities ?? []).map((entry) => entry.trim()));
    const supportsText = outputModalities.size === 0 || outputModalities.has('text');
    const supportsTools = supportedParameters.has('tools');

    if (!supportsText) {
      notes.push('OpenRouter metadata says this model does not expose text output, so the app agent workflow is not a fit.');
      return createAssessment('limited', 'limited', notes, 'gateway-unknown');
    }

    if (supportsTools) {
      notes.push('OpenRouter metadata confirms support for the tools parameter on this model.');
      return createAssessment('likely', 'supported', notes, 'gateway-unknown');
    }

    notes.push('OpenRouter metadata did not advertise tool parameters for this model, so tool calling is treated as limited.');
    return createAssessment('likely', 'limited', notes, 'gateway-unknown');
  }

  if (providerId === 'anthropic') {
    const normalizedModelId = normalizeModelId(modelId);
    if (!normalizedModelId.includes('claude')) {
      notes.push('Anthropic metadata was returned, but this does not look like a Claude chat model.');
      return createAssessment('limited', 'limited', notes, fallback.transport);
    }

    const capabilities = metadata.anthropicCapabilities;
    if (capabilities?.structuredOutputs) {
      notes.push('Anthropic model metadata advertises structured output support.');
    }

    if (capabilities?.codeExecution) {
      notes.push('Anthropic model metadata advertises server-side code execution support.');
    }

    if (capabilities?.contextManagement) {
      notes.push('Anthropic model metadata advertises context-management support.');
    }

    if (capabilities?.thinking) {
      notes.push('Anthropic model metadata advertises thinking support.');
    }

    notes.push('Anthropic models.list confirms this model is available on the official API account.');
    return createAssessment('supported', 'supported', notes, 'native');
  }

  return fallback;
};

export const inferConfiguredModelCapabilities = (config: AppConfig): ModelCapabilityAssessment =>
  inferModelCapabilities(config.providerId, config.model, resolveBaseUrl(config.providerId, config.baseUrl));
