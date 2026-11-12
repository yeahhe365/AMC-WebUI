import type { CatalogModelSpec } from './types';

/**
 * Open-weight vendors — verified on 2026-11-12 against the Amazon Bedrock model cards
 * (https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html) and Mistral docs
 * (https://docs.mistral.ai/models). Notes:
 * - Meta's own API no longer serves any Llama model, so the Bedrock/self-host figures are the
 *   reference numbers. Llama 3.1 405B and the two 3.2 vision models hit EOL on 2026-07-07.
 * - `pixtral-large-latest` was retired on 2026-05-31; Mistral Large 3 (256K, deprecated
 *   2026-10-31) is superseded by Mistral Large 4.
 * - xAI publishes only a context window, so Grok entries omit maxOutputTokens.
 * Hugging Face style IDs (`meta-llama/Llama-4-Scout-17B-16E-Instruct`) resolve to these keys
 * because normalization keeps only the segment after the last `/`.
 */
const LLAMA_4_SCOUT: CatalogModelSpec = {
  id: 'llama-4-scout-17b-16e-instruct',
  name: 'Llama 4 Scout',
  contextWindow: 10_485_760,
  maxOutputTokens: 8_192,
  capabilities: { vision: true, thinking: false, tools: true },
  ownedBy: 'meta',
};

const LLAMA_4_MAVERICK: CatalogModelSpec = {
  id: 'llama-4-maverick-17b-128e-instruct',
  name: 'Llama 4 Maverick',
  contextWindow: 1_048_576,
  maxOutputTokens: 8_192,
  capabilities: { vision: true, thinking: false, tools: true },
  ownedBy: 'meta',
};

const MISTRAL_LARGE_4: CatalogModelSpec = {
  id: 'mistral-large-4',
  name: 'Mistral Large 4',
  contextWindow: 1_000_000,
  capabilities: { vision: true, thinking: true, tools: true },
  ownedBy: 'mistral',
};

const CODESTRAL: CatalogModelSpec = {
  id: 'codestral-2508',
  name: 'Codestral 2508',
  contextWindow: 131_072,
  capabilities: { vision: false, thinking: false, tools: true },
  ownedBy: 'mistral',
};

export const OPENSOURCE_MODELS: Record<string, CatalogModelSpec> = {
  // Meta Llama
  'llama-4-scout-17b-16e-instruct': LLAMA_4_SCOUT,
  'llama-4-scout': LLAMA_4_SCOUT,
  'llama-4-maverick-17b-128e-instruct': LLAMA_4_MAVERICK,
  'llama-4-maverick': LLAMA_4_MAVERICK,
  'llama-3.3-70b-instruct': {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    capabilities: { vision: false, thinking: false, tools: true },
    ownedBy: 'meta',
  },

  // Mistral
  'mistral-large-4': MISTRAL_LARGE_4,
  'codestral-latest': CODESTRAL,
  'codestral-2508': CODESTRAL,

  // xAI Grok
  'grok-4.7': {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    contextWindow: 500_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'xai',
  },
  'grok-4.6': {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    contextWindow: 500_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'xai',
  },
  'grok-4.3': {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    contextWindow: 1_000_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'xai',
  },
  'grok-build-0.1': {
    id: 'grok-build-0.1',
    name: 'Grok Build 0.1',
    contextWindow: 256_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'xai',
  },
};
