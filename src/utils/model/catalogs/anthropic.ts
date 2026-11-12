import type { CatalogModelSpec } from './types';

/**
 * Anthropic — verified against https://platform.claude.com/docs/en/models/overview on 2026-11-12.
 * Every Claude 3.x model has been retired (last one on 2026-04-20); only the 5.x family is callable.
 * All current models: 1M context, 128K output, text + image in, adaptive thinking, tool use.
 */
export const ANTHROPIC_MODELS: Record<string, CatalogModelSpec> = {
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-sonnet-5-5': {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-haiku-5-5': {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'anthropic',
  },
  'claude-fable-5-2': {
    id: 'claude-fable-5-2',
    name: 'Claude Fable 5.2',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: { vision: true, thinking: true, tools: true },
    ownedBy: 'anthropic',
  },
};
