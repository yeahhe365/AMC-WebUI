import type { CatalogModelSpec } from './types';

/**
 * OpenAI — verified against https://developers.openai.com/api/docs/models on 2026-11-12.
 * The 4-series and most of the o-series are shut down; `gpt-4o` / `gpt-4o-mini` / `o3` are still
 * callable but deprecated (2027-01-14 and 2026-12-11) and are intentionally no longer listed here.
 * All GPT-6 models: 1,050,000 context / 128,000 output, text + image in, reasoning, tool use.
 */
export const OPENAI_MODELS: Record<string, CatalogModelSpec> = {
  'gpt-6-astra': {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'gpt-6.1-sol': {
    id: 'gpt-6.1-sol',
    name: 'GPT-6.1 Sol',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'gpt-6.1-terra': {
    id: 'gpt-6.1-terra',
    name: 'GPT-6.1 Terra',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
  'gpt-6-luna': {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'openai',
  },
};
