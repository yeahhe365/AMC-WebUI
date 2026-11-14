import { describe, expect, it } from 'vitest';
import { calculateApiUsageRecordPriceUsd, estimateMessageCostUsd, formatCostUsd } from './usagePricing';
import type { ApiUsageRecord } from '@/services/db/dbService';

describe('calculateApiUsageRecordPriceUsd', () => {
  it('prices Hydrogen input, cached input and output at official rates', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-4-hydrogen',
      promptTokens: 100_000,
      cachedPromptTokens: 50_000,
      completionTokens: 20_000,
      totalTokens: 120_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 50_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 20_000 }],
      },
    };
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(0.30375, 6);
  });

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
      timestamp: Date.UTC(2026, 10, 15),
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

    // Intro rate: 1.0 * 0.75 + 0.5 * 0.075 + 0.1 * 3.75 = 0.75 + 0.0375 + 0.375 = 1.1625
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(1.1625, 6);
  });

  it('prices Gemini 3.7 Flash exactly when modality evidence exists (mirrors 3.6 Flash)', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.UTC(2026, 10, 15),
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

    // Intro rate, same card as 3.6 Flash.
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(1.1625, 6);
  });

  it('prices Gemini 3.8 Flash exactly when modality evidence exists (mirrors 3.7 Flash)', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.UTC(2026, 10, 15),
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

    // Intro rate, same card as 3.6 / 3.7 Flash.
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(1.1625, 6);
  });

  it('raises Flash rates on 2027-01-01 instead of charging the future rate early', () => {
    const build = (timestamp: number): ApiUsageRecord => ({
      timestamp,
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
    });

    // Last day of the introductory card.
    expect(calculateApiUsageRecordPriceUsd(build(Date.UTC(2026, 11, 31, 23, 59)))).toBeCloseTo(1.1625, 6);
    // 1.0 * 1.5 + 0.5 * 0.15 + 0.1 * 7.5 = 1.5 + 0.075 + 0.75 = 2.325
    expect(calculateApiUsageRecordPriceUsd(build(Date.UTC(2027, 0, 1)))).toBeCloseTo(2.325, 6);
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

  it('prices Gemini 4 Argon at the introductory standard rate through November 2026', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.UTC(2026, 10, 15),
      modelId: 'gemini-4-argon',
      promptTokens: 100_000,
      cachedPromptTokens: 50_000,
      completionTokens: 20_000,
      totalTokens: 120_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 50_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 20_000 }],
      },
    };

    // 0.1 * 2.0 + 0.05 * 0.1 + 0.02 * 10.0 = 0.2 + 0.005 + 0.2 = 0.405
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(0.405, 6);
  });

  it('prices Gemini 4 Carbon with the intro rate, then the December standard rate', () => {
    const buildRecord = (timestamp: number): ApiUsageRecord => ({
      timestamp,
      modelId: 'gemini-4-carbon',
      promptTokens: 100_000,
      cachedPromptTokens: 50_000,
      completionTokens: 20_000,
      totalTokens: 120_000,
      exactPricing: {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 50_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 20_000 }],
      },
    });

    // Intro: 0.1 * 2.0 + 0.05 * 0.1 + 0.02 * 10.0 = 0.405
    expect(calculateApiUsageRecordPriceUsd(buildRecord(Date.UTC(2026, 10, 15)))).toBeCloseTo(0.405, 6);
    // From 2026-12-01: 0.1 * 4.0 + 0.05 * 0.2 + 0.02 * 20.0 = 0.4 + 0.01 + 0.4 = 0.81
    expect(calculateApiUsageRecordPriceUsd(buildRecord(Date.UTC(2026, 11, 2)))).toBeCloseTo(0.81, 6);
  });

  it('prices Gemini 3.5 Transcribe on its own card, not Flash-Lite copy-paste rates', () => {
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.5-transcribe',
      promptTokens: 1_000_000,
      cachedPromptTokens: 0,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'transcription',
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 1_000_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    // $2.00 input + 0.1 * $12.00 output = 2.0 + 1.2 = 3.2
    // The old card ($0.30 / $2.50) produced 0.55 for this same record.
    expect(calculateApiUsageRecordPriceUsd(record)).toBeCloseTo(3.2, 6);
  });

  it('leaves a Transcribe record with cached tokens unpriced rather than borrowing a rate', () => {
    // Google publishes no context-caching row for Transcribe, so there is no
    // defensible number to use. Staying unpriced is the honest outcome.
    const record: ApiUsageRecord = {
      timestamp: Date.now(),
      modelId: 'gemini-3.5-transcribe',
      promptTokens: 1_000_000,
      cachedPromptTokens: 200_000,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      exactPricing: {
        version: 1,
        requestKind: 'transcription',
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 800_000 }],
        cacheTokensDetails: [{ modality: 'AUDIO', tokenCount: 200_000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100_000 }],
      },
    };

    expect(calculateApiUsageRecordPriceUsd(record)).toBeNull();
  });
});

describe('estimateMessageCostUsd and formatCostUsd', () => {
  it('estimates message cost correctly for flash models', () => {
    const cost = estimateMessageCostUsd('gemini-3.6-flash', {
      promptTokens: 1000,
      completionTokens: 500,
    });
    // Intro rate: 1000/1M * 0.75 + 500/1M * 3.75 = 0.00075 + 0.001875 = 0.002625
    expect(cost).toBeCloseTo(0.002625, 5);
  });

  it('still prices an unlisted Flash variant, so the fallback anchor must stay live', () => {
    // Guards the generic "flash" fallback: it once read gemini-3.6-flash directly,
    // which would have turned every unlisted Flash id into an unpriced request the
    // day that model was shut down.
    const cost = estimateMessageCostUsd('gemini-9.9-flash-experimental', {
      promptTokens: 1000,
      completionTokens: 500,
    });

    expect(cost).not.toBeNull();
    // Same anchor as 3.8 Flash: 1000/1M * 0.75 + 500/1M * 3.75 = 0.002625
    expect(cost).toBeCloseTo(0.002625, 5);
  });

  it('prices the still-served Gemini 2.5 family on its own cards', () => {
    // These are deprecated but billed until 2026-12-01. Before they had entries
    // the substring fallback matched newer models: 2.5 Flash was priced as 3.8
    // Flash (5x high) and 2.5 Flash-Lite as 3.5 Flash-Lite (6x high).
    // 2.5 Flash: 1M * 0.30 + 1M * 2.50 = 0.3 + 2.5 = 2.8
    expect(
      estimateMessageCostUsd('gemini-2.5-flash', { promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(2.8, 6);
    // 2.5 Flash-Lite: 1M * 0.10 + 1M * 0.40 = 0.1 + 0.4 = 0.5
    expect(
      estimateMessageCostUsd('gemini-2.5-flash-lite', { promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(0.5, 6);
    // 2.5 Pro keeps its 200k prompt tier: 0.1 * 1.25 + 0.1 * 10 = 1.125 below
    // the threshold, and 1M crosses it -> 1.0 * 2.5 + 1.0 * 15 = 17.5.
    expect(estimateMessageCostUsd('gemini-2.5-pro', { promptTokens: 100_000, completionTokens: 100_000 })).toBeCloseTo(
      1.125,
      6,
    );
    expect(
      estimateMessageCostUsd('gemini-2.5-pro', { promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(17.5, 6);
  });

  it('formats small costs below floor as <$0.0001', () => {
    expect(formatCostUsd(0.00005)).toBe('<$0.0001');
    expect(formatCostUsd(0.0012)).toBe('$0.0012');
    expect(formatCostUsd(1.5)).toBe('$1.50');
    expect(formatCostUsd(null)).toBe('—');
  });
});
