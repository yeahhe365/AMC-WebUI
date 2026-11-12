import type { CatalogModelSpec } from './types';

/**
 * DeepSeek — verified against https://api-docs.deepseek.com/quick_start/pricing on 2026-11-12.
 * The legacy slugs `deepseek-chat` / `deepseek-reasoner` were retired on 2026-07-24 15:59 UTC and
 * now fail instead of redirecting; `deepseek-v3` / `deepseek-r1` were never API model IDs.
 * Both live models: 1M context, 384K (393,216) max output, thinking on by default, tool calls.
 */
export const DEEPSEEK_MODELS: Record<string, CatalogModelSpec> = {
  'deepseek-flash': {
    id: 'deepseek-flash',
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 393_216,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'deepseek',
  },
  'deepseek-v4-pro': {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    contextWindow: 1_000_000,
    maxOutputTokens: 393_216,
    capabilities: { vision: false, thinking: true, tools: true },
    ownedBy: 'deepseek',
  },
};
