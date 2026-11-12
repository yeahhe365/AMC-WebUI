import type { CatalogModelSpec } from './types';

/**
 * Chinese vendors — verified on 2026-11-12 against:
 * - Qwen: https://help.aliyun.com/zh/model-studio/text-generation-model (+ per-model pages)
 * - Moonshot: https://platform.kimi.ai/docs/pricing/chat
 * - Zhipu: https://docs.bigmodel.cn/cn/guide/start/model-overview
 * The Qwen 2.5 generation, `qwq-32b`, `moonshot-v1-*` and `kimi-k1.5` are no longer callable.
 * Moonshot does not publish a per-model output cap, so those entries omit maxOutputTokens.
 */
export const DOMESTIC_MODELS: Record<string, CatalogModelSpec> = {
  // Qwen (Alibaba)
  'qwen3.8-max': {
    id: 'qwen3.8-max',
    name: 'Qwen3.8 Max',
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'qwen',
  },
  'qwen-plus': {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    capabilities: { vision: false, thinking: true, tools: true },
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

  // Moonshot Kimi
  'kimi-k3.1-pro': {
    id: 'kimi-k3.1-pro',
    name: 'Kimi K3.1 Pro',
    contextWindow: 1_048_576,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'moonshot',
  },
  'kimi-k3': {
    id: 'kimi-k3',
    name: 'Kimi K3',
    contextWindow: 1_048_576,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'moonshot',
  },

  // Zhipu GLM
  'glm-5.3': {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    capabilities: { vision: false, thinking: true, tools: true },
    ownedBy: 'zhipu',
  },
  'glm-5.3-flash': {
    id: 'glm-5.3-flash',
    name: 'GLM-5.3 Flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'zhipu',
  },
  'glm-4.6v': {
    id: 'glm-4.6v',
    name: 'GLM-4.6V',
    contextWindow: 131_072,
    maxOutputTokens: 32_768,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'zhipu',
  },
};
