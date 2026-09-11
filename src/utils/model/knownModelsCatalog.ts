import type { ModelCapabilities, ModelOption } from '@/types';

export interface CatalogModelSpec {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  ownedBy: string;
}

/**
 * Format token count into human-friendly representation (e.g. 128000 -> 128K, 1048576 -> 1M)
 */
export const formatContextWindow = (tokens?: number | null): string => {
  if (!tokens || tokens <= 0) return '';
  if (tokens >= 1_000_000) {
    const millions = Math.round((tokens / 1_000_000) * 10) / 10;
    return `${millions}M`;
  }
  if (tokens >= 1_000) {
    const thousands = Math.round(tokens / 1_000);
    return `${thousands}K`;
  }
  return `${tokens}`;
};

/**
 * Normalize model ID by stripping vendor/host prefixes and release-date / variant suffixes.
 * Inspired by Cherry Studio's normalizeModelId pipeline.
 */
export const normalizeModelId = (rawId: string): string => {
  if (!rawId) return '';
  let id = rawId.trim().toLowerCase();

  // 1. Strip org / provider prefix (e.g. "openai/gpt-4o", "anthropic/claude-3-5-sonnet")
  if (id.includes('/')) {
    const parts = id.split('/');
    id = parts[parts.length - 1];
  }

  // 2. Strip aws/bedrock prefix (e.g. "us.anthropic.claude-3-5-sonnet-20241022-v2:0")
  id = id.replace(/^(us|eu|apac)\.anthropic\./, '').replace(/^anthropic\./, '');

  // 3. Strip bedrock/openrouter tag suffixes like ":free", ":nitro", ":extended"
  id = id.replace(/:(free|nitro|extended|default)$/, '');

  // 4. Strip bedrock version tag like -v1:0, -v2:0
  id = id.replace(/[-_]v\d+:\d+$/, '');

  // 5. Strip date suffixes like -20241022, -20250219, -2024-07-18, -20240806
  id = id.replace(/[-_](202\d{5}|202\d{1}-\d{2}-\d{2})$/, '');

  return id;
};

/**
 * Curated catalog of major AI models and their canonical limits & capabilities.
 */
export const KNOWN_MODELS_CATALOG: Record<string, CatalogModelSpec> = {
  // OpenAI
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'openai',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'openai',
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'openai',
  },
  'gpt-4.5-preview': {
    id: 'gpt-4.5-preview',
    name: 'GPT-4.5 Preview',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'openai',
  },
  o1: {
    id: 'o1',
    name: 'o1',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'o1-preview': {
    id: 'o1-preview',
    name: 'o1 Preview',
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    capabilities: { vision: false, thinking: true, tools: false },
    ownedBy: 'openai',
  },
  'o1-mini': {
    id: 'o1-mini',
    name: 'o1 Mini',
    contextWindow: 128_000,
    maxOutputTokens: 65_536,
    capabilities: { vision: false, thinking: true, tools: false },
    ownedBy: 'openai',
  },
  o3: {
    id: 'o3',
    name: 'o3',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'o3-mini': {
    id: 'o3-mini',
    name: 'o3 Mini',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: { vision: false, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'chatgpt-4o-latest': {
    id: 'chatgpt-4o-latest',
    name: 'ChatGPT-4o Latest',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'openai',
  },

  // Anthropic Claude
  'claude-3-7-sonnet': {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-3-opus': {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-3-haiku': {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'anthropic',
  },

  // DeepSeek
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'deepseek',
  },
  'deepseek-v3': {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'deepseek',
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: true, tools: false },
    ownedBy: 'deepseek',
  },
  'deepseek-r1': {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: true, tools: false },
    ownedBy: 'deepseek',
  },

  // Qwen
  'qwen-2.5-72b-instruct': {
    id: 'qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-2.5-32b-instruct': {
    id: 'qwen-2.5-32b-instruct',
    name: 'Qwen 2.5 32B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-2.5-coder-32b-instruct': {
    id: 'qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-2.5-vl-72b-instruct': {
    id: 'qwen-2.5-vl-72b-instruct',
    name: 'Qwen 2.5 VL 72B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-max': {
    id: 'qwen-max',
    name: 'Qwen Max',
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-plus': {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-turbo': {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'qwen',
  },
  'qwq-32b': {
    id: 'qwq-32b',
    name: 'QwQ 32B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: true, tools: true },
    ownedBy: 'qwen',
  },

  // Meta Llama
  'llama-3.3-70b-instruct': {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'meta',
  },
  'llama-3.1-405b-instruct': {
    id: 'llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'meta',
  },
  'llama-3.1-70b-instruct': {
    id: 'llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'meta',
  },
  'llama-3.1-8b-instruct': {
    id: 'llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'meta',
  },
  'llama-3.2-11b-vision-instruct': {
    id: 'llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'meta',
  },
  'llama-3.2-90b-vision-instruct': {
    id: 'llama-3.2-90b-vision-instruct',
    name: 'Llama 3.2 90B Vision',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'meta',
  },

  // Mistral
  'mistral-large-latest': {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'mistral',
  },
  'pixtral-large-latest': {
    id: 'pixtral-large-latest',
    name: 'Pixtral Large',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'mistral',
  },
  'codestral-latest': {
    id: 'codestral-latest',
    name: 'Codestral',
    contextWindow: 256_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'mistral',
  },

  // Google Gemini (via OpenAI compatibility)
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'google',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'google',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'google',
  },

  // xAI Grok
  'grok-2': {
    id: 'grok-2',
    name: 'Grok 2',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'xai',
  },
  'grok-3': {
    id: 'grok-3',
    name: 'Grok 3',
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'xai',
  },

  // Moonshot Kimi
  'moonshot-v1-8k': {
    id: 'moonshot-v1-8k',
    name: 'Kimi 8K',
    contextWindow: 8_192,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'moonshot',
  },
  'moonshot-v1-32k': {
    id: 'moonshot-v1-32k',
    name: 'Kimi 32K',
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'moonshot',
  },
  'moonshot-v1-128k': {
    id: 'moonshot-v1-128k',
    name: 'Kimi 128K',
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'moonshot',
  },
  'kimi-k1.5': {
    id: 'kimi-k1.5',
    name: 'Kimi K1.5',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'moonshot',
  },

  // Zhipu GLM
  'glm-4-plus': {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'zhipu',
  },
  'glm-4v-plus': {
    id: 'glm-4v-plus',
    name: 'GLM-4V Plus',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { vision: true, thinking: false, tools: true },
    ownedBy: 'zhipu',
  },
  'glm-zero-preview': {
    id: 'glm-zero-preview',
    name: 'GLM Zero',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: { vision: false, thinking: true, tools: true },
    ownedBy: 'zhipu',
  },
};

/**
 * Heuristically infer capabilities and context window when model is not in KNOWN_MODELS_CATALOG.
 */
export const inferModelCapabilities = (
  rawId: string,
): {
  capabilities: ModelCapabilities;
  contextWindow?: number;
  ownedBy?: string;
} => {
  const lower = rawId.toLowerCase();

  const thinking = /r1|o1|o3|claude-3-7|thinking|reasoner|reasoning|qwq|zero/i.test(lower);
  const vision = /vision|vl|-v-|4v|4o|pixtral|claude-3|gemini|multimodal/i.test(lower);
  const tools = !/embed|rerank|moderation|tts|whisper|dall-e/i.test(lower);

  // Guess context window if present in string (e.g. 128k, 32k, 1m)
  let contextWindow: number | undefined;
  if (/(\d+)m/i.test(lower)) {
    const match = lower.match(/(\d+)m/i);
    if (match) {
      contextWindow = parseInt(match[1], 10) * 1_000_000;
    }
  } else if (/(\d+)k/i.test(lower)) {
    const match = lower.match(/(\d+)k/i);
    if (match) {
      contextWindow = parseInt(match[1], 10) * 1_000;
    }
  }

  // Guess owner
  let ownedBy: string | undefined;
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) ownedBy = 'openai';
  else if (lower.includes('claude')) ownedBy = 'anthropic';
  else if (lower.includes('deepseek')) ownedBy = 'deepseek';
  else if (lower.includes('qwen') || lower.includes('qwq')) ownedBy = 'qwen';
  else if (lower.includes('llama')) ownedBy = 'meta';
  else if (lower.includes('mistral') || lower.includes('pixtral') || lower.includes('codestral')) ownedBy = 'mistral';
  else if (lower.includes('gemini') || lower.includes('gemma')) ownedBy = 'google';
  else if (lower.includes('grok')) ownedBy = 'xai';
  else if (lower.includes('moonshot') || lower.includes('kimi')) ownedBy = 'moonshot';
  else if (lower.includes('glm')) ownedBy = 'zhipu';

  return {
    capabilities: { vision, thinking, tools },
    contextWindow,
    ownedBy,
  };
};

/**
 * Match a raw remote model to the known catalog or heuristically enrich its metadata.
 */
export const enrichModelMetadata = (remote: { id: string; name?: string; owned_by?: string }): ModelOption => {
  const normalizedId = normalizeModelId(remote.id);
  const catalogEntry = KNOWN_MODELS_CATALOG[normalizedId] || KNOWN_MODELS_CATALOG[remote.id.toLowerCase()];

  if (catalogEntry) {
    return {
      id: remote.id,
      name: remote.name && remote.name !== remote.id ? remote.name : catalogEntry.name,
      contextWindow: catalogEntry.contextWindow,
      maxOutputTokens: catalogEntry.maxOutputTokens,
      capabilities: { ...catalogEntry.capabilities },
      ownedBy: catalogEntry.ownedBy,
      enableThinking: catalogEntry.capabilities.thinking ?? false,
      enableTools: catalogEntry.capabilities.tools ?? true,
      visibleInSelector: true,
    };
  }

  // Fallback to heuristics
  const inferred = inferModelCapabilities(remote.id);
  return {
    id: remote.id,
    name: remote.name || remote.id,
    contextWindow: inferred.contextWindow,
    capabilities: inferred.capabilities,
    ownedBy: inferred.ownedBy || remote.owned_by,
    enableThinking: inferred.capabilities.thinking ?? false,
    enableTools: inferred.capabilities.tools ?? true,
    visibleInSelector: true,
  };
};
