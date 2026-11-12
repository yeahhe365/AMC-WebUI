import type { ModelCapabilities } from '@/types';

export interface CatalogModelSpec {
  id: string;
  name: string;
  contextWindow: number;
  /**
   * Omitted when the vendor does not publish an output cap (xAI and Mistral only
   * document a context window). Never guess: this number is shown in the model
   * info panel and seeds generation defaults, so a wrong value is worse than none.
   */
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
  ownedBy: string;
}
