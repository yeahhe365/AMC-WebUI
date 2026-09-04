import { describe, expect, it } from 'vitest';
import type { UsageMetadata } from '@google/genai';
import { mergeUsageMetadata, mergeUrlContextMetadata } from './messageStreamMetadata';

describe('mergeUsageMetadata', () => {
  it('keeps current-name fields when both sides use responseTokenCount', () => {
    const merged = mergeUsageMetadata(
      { promptTokenCount: 10, responseTokenCount: 5, totalTokenCount: 15 },
      { promptTokenCount: 20, responseTokenCount: 8, totalTokenCount: 28 },
    );

    expect(merged).toMatchObject({
      promptTokenCount: 30,
      responseTokenCount: 13,
      totalTokenCount: 43,
    });
  });

  it('falls back to the legacy candidatesTokenCount when responseTokenCount is absent', () => {
    const legacy = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } as UsageMetadata;
    const current = { promptTokenCount: 20, responseTokenCount: 8, totalTokenCount: 28 };

    const merged = mergeUsageMetadata(legacy, current);

    expect(merged).toMatchObject({
      promptTokenCount: 30,
      responseTokenCount: 13,
      totalTokenCount: 43,
    });
  });

  it('merges legacy candidatesTokensDetails into the response-side details', () => {
    const legacy = {
      candidatesTokensDetails: [{ modality: 'TEXT' as const, tokenCount: 5 }],
    } as UsageMetadata;
    const current = {
      responseTokensDetails: [{ modality: 'TEXT' as const, tokenCount: 7 }],
    } as UsageMetadata;

    const merged = mergeUsageMetadata(legacy, current);

    expect(merged?.responseTokensDetails).toEqual([{ modality: 'TEXT', tokenCount: 12 }]);
  });

  it('normalizes a legacy-only side to the current field names instead of dropping the values', () => {
    const legacyOnly = { promptTokenCount: 10, candidatesTokenCount: 5 } as UsageMetadata;
    const currentOnly = { promptTokenCount: 20, responseTokenCount: 8 } as UsageMetadata;

    const merged = mergeUsageMetadata(legacyOnly, undefined);

    expect(merged).toBe(legacyOnly);

    const mergedCross = mergeUsageMetadata(legacyOnly, currentOnly);
    expect(mergedCross?.responseTokenCount).toBe(13);
  });
});

describe('mergeUrlContextMetadata', () => {
  it('dedupes retrieved urls across snake_case and camelCase payloads', () => {
    const merged = mergeUrlContextMetadata(
      { url_metadata: [{ retrievedUrl: 'https://a.example' }] },
      { urlMetadata: [{ retrievedUrl: 'https://a.example' }, { retrieved_url: 'https://b.example' }] },
    );

    const items = (merged as { urlMetadata?: unknown[] }).urlMetadata ?? [];
    expect(items).toHaveLength(2);
  });
});
