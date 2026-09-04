import { describe, expect, it } from 'vitest';
import { calculateApiUsageRecordPriceUsd } from './usagePricing';
import type { ApiUsageRecord } from '@/services/db/dbService';

describe('calculateApiUsageRecordPriceUsd', () => {
  it('keeps legacy Gemini 3.1 Pro records unavailable when exact evidence is missing', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.1-pro-preview',
      promptTokens: 1000,
      cachedPromptTokens: 0,
      completionTokens: 500,
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });

  it('prices Gemini 3 Flash exactly when modality token details are present', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3-flash-preview',
      promptTokens: 1_500_000,
      cachedPromptTokens: 500_000,
      completionTokens: 100_000,
      totalTokens: 1_600_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 1_000_000 },
          { modality: 'AUDIO', tokenCount: 500_000 },
        ],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(1.325, 6);
  });

  it('keeps legacy Gemini 3 Flash records unavailable when exact modality data is missing', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3-flash-preview',
      promptTokens: 1000,
      completionTokens: 500,
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });

  it('keeps removed Gemini 2.5 TTS pricing unavailable even when exact evidence is stored', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-2.5-flash-preview-tts',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      exactPricing: {
        version: 1,
        requestKind: 'tts',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }],
        responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 1_000_000 }],
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });

  it('keeps removed Gemini 2.5 native audio pricing unavailable even when exact evidence is stored', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-2.5-flash-native-audio-preview-12-2025',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 500_000 },
          { modality: 'AUDIO', tokenCount: 500_000 },
        ],
        responseTokensDetails: [
          { modality: 'TEXT', tokenCount: 500_000 },
          { modality: 'AUDIO', tokenCount: 500_000 },
        ],
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });

  it('leaves legacy image_generate usage records unpriced after Imagen removal', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'legacy-image-generate',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      exactPricing: {
        version: 1,
        requestKind: 'image_generate',
        generatedImageCount: 2,
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });

  it('prices Gemini 3.1 Pro exactly when modality evidence exists', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.1-pro-preview',
      promptTokens: 1_000_000,
      cachedPromptTokens: 500_000,
      completionTokens: 10_000,
      totalTokens: 1_010_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 10_000 }],
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(2.38, 6);
  });

  it('prices Gemini 3.6 Flash exactly when modality evidence exists', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.6-flash',
      promptTokens: 1_000_000,
      cachedPromptTokens: 500_000,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    // 1.0 * 1.5 + 0.5 * 0.15 + 0.1 * 7.5 = 1.5 + 0.075 + 0.75 = 2.325
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(2.325, 6);
  });

  it('prices Gemini 3.7 Flash exactly when modality evidence exists (mirrors 3.6 Flash)', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.7-flash',
      promptTokens: 1_000_000,
      cachedPromptTokens: 500_000,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    // 1.0 * 1.5 + 0.5 * 0.15 + 0.1 * 7.5 = 1.5 + 0.075 + 0.75 = 2.325
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(2.325, 6);
  });

  it('prices Gemini 3.8 Flash exactly when modality evidence exists (mirrors 3.7 Flash)', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.8-flash',
      promptTokens: 1_000_000,
      cachedPromptTokens: 500_000,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    // 1.0 * 1.5 + 0.5 * 0.15 + 0.1 * 7.5 = 1.5 + 0.075 + 0.75 = 2.325
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(2.325, 6);
  });

  it('prices Gemini 3.5 Flash-Lite exactly when modality evidence exists', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.5-flash-lite',
      promptTokens: 1_000_000,
      cachedPromptTokens: 0,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    // 1.0 * 0.3 + 0.1 * 2.5 = 0.3 + 0.25 = 0.55
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(0.55, 6);
  });
});
