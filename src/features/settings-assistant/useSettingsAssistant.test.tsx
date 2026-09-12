import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';

const { mockRunStandardToolLoop, mockGetGeminiKeyForRequest } = vi.hoisted(() => ({
  mockRunStandardToolLoop: vi.fn(),
  mockGetGeminiKeyForRequest: vi.fn(),
}));

vi.mock('@/features/standard-chat/standardToolLoop', () => ({
  runStandardToolLoop: mockRunStandardToolLoop,
  DEFAULT_TOOL_LOOP_ROUNDS: 50,
}));
vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mockGetGeminiKeyForRequest,
  parseApiKeys: vi.fn(() => []),
  getKeyForRequest: vi.fn(),
  resolveChatApiRoute: vi.fn(),
}));
vi.mock('@/services/api/chatApi', () => ({ generateContentTurnApi: vi.fn() }));
vi.mock('@/features/prompts/promptRegistry', () => ({
  loadSettingsAssistantSystemPrompt: vi.fn(async () => 'system'),
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsAssistant } from './useSettingsAssistant';

describe('useSettingsAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
    useSettingsStore.setState({ appSettings: DEFAULT_APP_SETTINGS, isSettingsLoaded: true });
    mockGetGeminiKeyForRequest.mockReturnValue({ key: 'gemini-key', isNewKey: false });
  });

  it('reports canSend false and does not call the model without a Gemini channel', async () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    const { result } = renderHookWithProviders(() => useSettingsAssistant());

    expect(result.current.canSend).toBe(false);
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });
    expect(mockRunStandardToolLoop).not.toHaveBeenCalled();
    expect(useSettingsAssistantStore.getState().items).toEqual([]);
  });

  it('appends the user message, runs the loop and records the final answer', async () => {
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: '已添加 DeepSeek' }] },
      toolMessages: [],
      generatedFiles: [],
    });

    const { result } = renderHookWithProviders(() => useSettingsAssistant());
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    const items = useSettingsAssistantStore.getState().items;
    expect(items[0]).toMatchObject({ kind: 'user', text: '加一个 DeepSeek' });
    expect(items.at(-1)).toMatchObject({ kind: 'assistant', text: '已添加 DeepSeek' });
    expect(useSettingsAssistantStore.getState().status).toBe('idle');
  });

  it('records a tool item per function call and settles it with the response', async () => {
    mockRunStandardToolLoop.mockImplementation(
      async (options: {
        onToolCallsStarted?: (message: unknown) => void;
        onToolResponsesSettled?: (parts: unknown[]) => void;
      }) => {
        options.onToolCallsStarted?.({
          role: 'model',
          parts: [{ functionCall: { id: 'call-1', name: 'create_connection', args: { templateId: 'deepseek' } } }],
        });
        options.onToolResponsesSettled?.([
          { functionResponse: { id: 'call-1', name: 'create_connection', response: { status: 'key-configured' } } },
        ]);
        return {
          finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: 'done' }] },
          toolMessages: [],
          generatedFiles: [],
        };
      },
    );

    const { result } = renderHookWithProviders(() => useSettingsAssistant());
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    const toolItem = useSettingsAssistantStore.getState().items.find((item) => item.kind === 'tool');
    expect(toolItem).toMatchObject({ name: 'create_connection', status: 'done', detail: 'key-configured' });
  });

  it('surfaces a loop failure as an error item', async () => {
    mockRunStandardToolLoop.mockRejectedValue(new Error('boom'));
    const { result } = renderHookWithProviders(() => useSettingsAssistant());

    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    expect(useSettingsAssistantStore.getState().items.at(-1)).toMatchObject({ kind: 'error', message: 'boom' });
    expect(useSettingsAssistantStore.getState().status).toBe('error');
  });
});
