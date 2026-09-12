import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGeminiKeyForRequest, mockGenerateContentTurnApi, mockLoadPrompt } = vi.hoisted(() => ({
  mockGetGeminiKeyForRequest: vi.fn(),
  mockGenerateContentTurnApi: vi.fn(),
  mockLoadPrompt: vi.fn(async () => 'system prompt'),
}));

vi.mock('@/utils/apiKeySelection', () => ({ getGeminiKeyForRequest: mockGetGeminiKeyForRequest }));
vi.mock('@/services/api/chatApi', () => ({ generateContentTurnApi: mockGenerateContentTurnApi }));
vi.mock('@/features/prompts/promptRegistry', () => ({
  loadSettingsAssistantSystemPrompt: mockLoadPrompt,
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { SERVER_MANAGED_API_KEY } from '../../../shared/serverManagedApiKey';
import { createAssistantRunTurn, resolveAssistantChannel } from './assistantChannel';

describe('resolveAssistantChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is unavailable when no Gemini key can be resolved', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    expect(resolveAssistantChannel(DEFAULT_APP_SETTINGS)).toEqual({ ok: false, reason: 'no-gemini-key' });
  });

  it('accepts the server-managed key sentinel', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ key: SERVER_MANAGED_API_KEY, isNewKey: false });
    expect(resolveAssistantChannel(DEFAULT_APP_SETTINGS)).toEqual({
      ok: true,
      key: SERVER_MANAGED_API_KEY,
      modelId: expect.any(String),
    });
  });
});

describe('createAssistantRunTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs a turn with tool declarations and no built-in tools', async () => {
    mockGenerateContentTurnApi.mockResolvedValue({
      modelContent: { role: 'model', parts: [] },
      parts: [],
      functionCalls: [],
    });
    const channel = { ok: true as const, key: 'k', modelId: 'gemini-3.8-flash' };
    const controller = new AbortController();

    await createAssistantRunTurn({ channel, abortSignal: controller.signal })([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);

    const [key, modelId, , config, abortSignal] = mockGenerateContentTurnApi.mock.calls[0];
    expect(key).toBe('k');
    expect(modelId).toBe('gemini-3.8-flash');
    expect(abortSignal).toBe(controller.signal);
    expect(config.systemInstruction).toBe('system prompt');
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toContain('create_connection');
    expect(config.tools[0].googleSearch).toBeUndefined();
  });
});
