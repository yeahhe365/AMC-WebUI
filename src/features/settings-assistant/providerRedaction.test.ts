import { describe, expect, it } from 'vitest';
import { createThirdPartyConnection } from '@/test/data/factories';
import {
  MODEL_IDS_PER_CONNECTION_LIMIT,
  listTemplateSummaries,
  toConnectionSummary,
  toTemplateSummary,
} from './providerRedaction';

describe('toConnectionSummary', () => {
  it('masks the API key and keeps extra header values redacted', () => {
    const summary = toConnectionSummary(
      createThirdPartyConnection({
        id: 'c1',
        apiKey: 'sk-secret-value',
        extraHeaders: { 'X-Token': 'header-secret-value' },
      }),
    );

    expect(summary.hasApiKey).toBe(true);
    expect(summary.maskedApiKey).toBe('sk-****lue');
    expect(summary.headerNames).toEqual(['X-Token']);

    const serialized = JSON.stringify(summary);
    // The whole point: the model can tell a key exists without ever seeing it.
    expect(serialized).not.toContain('sk-secret-value');
    expect(serialized).not.toContain('header-secret-value');
  });

  it('never leaks a short key verbatim through the mask', () => {
    const summary = toConnectionSummary(createThirdPartyConnection({ apiKey: 'abc123' }));
    expect(summary.hasApiKey).toBe(true);
    expect(summary.maskedApiKey).toBe('***');
    expect(JSON.stringify(summary)).not.toContain('abc123');
  });

  it('reports hasApiKey false and no mask for a blank key', () => {
    const summary = toConnectionSummary(createThirdPartyConnection({ apiKey: '   ' }));
    expect(summary.hasApiKey).toBe(false);
    expect(summary.maskedApiKey).toBeNull();
  });

  it('truncates the model id list but keeps the true count', () => {
    const models = Array.from({ length: MODEL_IDS_PER_CONNECTION_LIMIT + 5 }, (_, index) => ({
      id: `model-${index}`,
      name: `Model ${index}`,
    }));
    const summary = toConnectionSummary(createThirdPartyConnection({ models }));

    expect(summary.modelCount).toBe(MODEL_IDS_PER_CONNECTION_LIMIT + 5);
    expect(summary.modelIds).toHaveLength(MODEL_IDS_PER_CONNECTION_LIMIT);
  });
});

describe('templates', () => {
  it('summarizes a template with its defaults and no secrets', () => {
    const summary = toTemplateSummary('deepseek');
    expect(summary.name).toBe('DeepSeek');
    expect(summary.baseUrl).toBe('https://api.deepseek.com');
    expect(summary.protocol).toBe('openai-compatible');
  });

  it('marks local engines as auth optional', () => {
    expect(toTemplateSummary('ollama').authOptional).toBe(true);
  });

  it('lists every template id exactly once', () => {
    const summaries = listTemplateSummaries();
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(summaries.length);
    expect(summaries.length).toBeGreaterThanOrEqual(24);
  });
});
