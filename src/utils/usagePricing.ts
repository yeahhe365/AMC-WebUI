import type { ApiUsageExactPricing, ApiUsageModalityTokenCount, ApiUsageRecord } from '@/services/db/dbService';
import { normalizeModelId } from './model/modelId';

const TOKENS_PER_MILLION = 1_000_000;
/** Gemini 3.1 Pro applies higher per-token rates once combined prompt+cache tokens exceed this threshold. */
const PRO_MODEL_TIER_THRESHOLD_TOKENS = 200_000;

const MODALITY_TEXT_PRICING: Record<
  string,
  {
    prompt: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    cache?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    response: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    tool?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    thresholdTokens?: number;
    promptAboveThreshold?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    cacheAboveThreshold?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    responseAboveThreshold?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
    toolAboveThreshold?: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>>;
  } | null
> = {
  'gemini-3-flash-preview': {
    prompt: { TEXT: 0.5, IMAGE: 0.5, AUDIO: 1 },
    cache: { TEXT: 0.05, IMAGE: 0.05, AUDIO: 0.1 },
    response: { TEXT: 3 },
    tool: { TEXT: 0.5, IMAGE: 0.5, AUDIO: 1 },
  },
  // Official Gemini API pricing (Standard): $1.50 input / $7.50 output / $0.15 cache.
  'gemini-3.6-flash': {
    prompt: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
    cache: { TEXT: 0.15, IMAGE: 0.15, AUDIO: 0.15 },
    response: { TEXT: 7.5 },
    tool: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
  },
  // Mirrors Gemini 3.6 Flash rates until official 3.7 pricing is published.
  'gemini-3.7-flash': {
    prompt: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
    cache: { TEXT: 0.15, IMAGE: 0.15, AUDIO: 0.15 },
    response: { TEXT: 7.5 },
    tool: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
  },
  // Mirrors Gemini 3.7 Flash rates until official 3.8 pricing is published.
  'gemini-3.8-flash': {
    prompt: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
    cache: { TEXT: 0.15, IMAGE: 0.15, AUDIO: 0.15 },
    response: { TEXT: 7.5 },
    tool: { TEXT: 1.5, IMAGE: 1.5, AUDIO: 1.5 },
  },
  // Official Gemini API pricing (Standard): $0.30 input (all modalities) / $2.50 output / $0.03 cache.
  'gemini-3.5-flash-lite': {
    prompt: { TEXT: 0.3, IMAGE: 0.3, AUDIO: 0.3 },
    cache: { TEXT: 0.03, IMAGE: 0.03, AUDIO: 0.03 },
    response: { TEXT: 2.5 },
    tool: { TEXT: 0.3, IMAGE: 0.3, AUDIO: 0.3 },
  },
  // Gemini 3.5 Transcribe pricing ($0.30/M input audio & text tokens / $2.50/M output tokens / $0.03 cache).
  'gemini-3.5-transcribe': {
    prompt: { TEXT: 0.3, AUDIO: 0.3 },
    cache: { TEXT: 0.03, AUDIO: 0.03 },
    response: { TEXT: 2.5 },
    tool: { TEXT: 0.3, AUDIO: 0.3 },
  },
  'gemini-3.1-pro-preview': {
    prompt: { TEXT: 2 },
    cache: { TEXT: 0.2 },
    response: { TEXT: 12 },
    tool: { TEXT: 2 },
    thresholdTokens: PRO_MODEL_TIER_THRESHOLD_TOKENS,
    promptAboveThreshold: { TEXT: 4 },
    cacheAboveThreshold: { TEXT: 0.4 },
    responseAboveThreshold: { TEXT: 18 },
    toolAboveThreshold: { TEXT: 4 },
  },
};

const sumTokensByRate = (
  details: ApiUsageModalityTokenCount[] | undefined,
  rates: Partial<Record<'TEXT' | 'IMAGE' | 'AUDIO', number>> | undefined,
) => {
  if (!details || details.length === 0) {
    return 0;
  }

  if (!rates) {
    return null;
  }

  let total = 0;
  for (const detail of details) {
    const rate = rates[detail.modality];
    if (rate === undefined) {
      return null;
    }
    total += (detail.tokenCount / TOKENS_PER_MILLION) * rate;
  }
  return total;
};

const hasAnyDetails = (details: ApiUsageModalityTokenCount[] | undefined) =>
  Boolean(details && details.some((detail) => detail.tokenCount > 0));

const calculateFromExactPricing = (modelId: string, exactPricing: ApiUsageExactPricing): number | null => {
  const normalizedModelId = normalizeModelId(modelId);

  // Per-image Imagen pricing was removed with Imagen model support. Historical
  // image_generate usage records stay unpriced.
  if (exactPricing.requestKind === 'image_generate') {
    return null;
  }

  // 'tts' requestKind intentionally falls through to the modality table, which has
  // no TTS model entries — TTS pricing was removed and stays unavailable (see tests).
  const modalityPricing = MODALITY_TEXT_PRICING[normalizedModelId];
  if (!modalityPricing) {
    return null;
  }

  if (!hasAnyDetails(exactPricing.promptTokensDetails) || !hasAnyDetails(exactPricing.responseTokensDetails)) {
    return null;
  }

  const useAboveThreshold = ((): boolean => {
    if (modalityPricing.thresholdTokens === undefined) {
      return false;
    }

    const promptTokens =
      (exactPricing.promptTokensDetails?.reduce((sum, detail) => sum + detail.tokenCount, 0) ?? 0) +
      (exactPricing.cacheTokensDetails?.reduce((sum, detail) => sum + detail.tokenCount, 0) ?? 0);

    return promptTokens > modalityPricing.thresholdTokens;
  })();

  const promptRates = useAboveThreshold
    ? (modalityPricing.promptAboveThreshold ?? modalityPricing.prompt)
    : modalityPricing.prompt;
  const cacheRates = useAboveThreshold
    ? (modalityPricing.cacheAboveThreshold ?? modalityPricing.cache)
    : modalityPricing.cache;
  const responseRates = useAboveThreshold
    ? (modalityPricing.responseAboveThreshold ?? modalityPricing.response)
    : modalityPricing.response;
  const toolRates = useAboveThreshold
    ? (modalityPricing.toolAboveThreshold ??
      modalityPricing.tool ??
      modalityPricing.promptAboveThreshold ??
      modalityPricing.prompt)
    : (modalityPricing.tool ?? modalityPricing.prompt);

  const promptCost = sumTokensByRate(exactPricing.promptTokensDetails, promptRates);
  const cacheCost = sumTokensByRate(exactPricing.cacheTokensDetails, cacheRates);
  const responseCost = sumTokensByRate(exactPricing.responseTokensDetails, responseRates);
  const toolCost = sumTokensByRate(exactPricing.toolUsePromptTokensDetails, toolRates);

  if (promptCost === null || cacheCost === null || responseCost === null || toolCost === null) {
    return null;
  }

  return promptCost + cacheCost + responseCost + toolCost;
};

export const calculateApiUsageRecordPriceUsd = (record: ApiUsageRecord): number | null => {
  const exactPricing = record.exactPricing;
  if (!exactPricing) {
    return null;
  }

  return calculateFromExactPricing(record.modelId, exactPricing);
};

export const formatPriceUsd = (amount: number | null): string => {
  if (amount === null) {
    return '—';
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount >= 0.01 ? 2 : 4,
    maximumFractionDigits: amount >= 0.01 ? 2 : 4,
  });

  return formatter.format(amount);
};
