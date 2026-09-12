import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';

const { mockGetGeminiKeyForRequest, mockRunStandardToolLoop } = vi.hoisted(() => ({
  mockGetGeminiKeyForRequest: vi.fn(),
  mockRunStandardToolLoop: vi.fn(),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mockGetGeminiKeyForRequest,
  parseApiKeys: vi.fn(() => []),
  getKeyForRequest: vi.fn(),
  resolveChatApiRoute: vi.fn(),
}));
vi.mock('@/features/standard-chat/standardToolLoop', () => ({
  runStandardToolLoop: mockRunStandardToolLoop,
  DEFAULT_TOOL_LOOP_ROUNDS: 50,
}));
vi.mock('@/services/api/chatApi', () => ({ generateContentTurnApi: vi.fn() }));
vi.mock('@/features/prompts/promptRegistry', () => ({
  loadSettingsAssistantSystemPrompt: vi.fn(async () => 'system'),
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ProviderAssistantPanel } from './ProviderAssistantPanel';

describe('ProviderAssistantPanel', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
    useSettingsStore.setState({ appSettings: DEFAULT_APP_SETTINGS, isSettingsLoaded: true });
  });

  it('disables the channel message when no Gemini key is configured', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    act(() => {
      renderer.root.render(<ProviderAssistantPanel />);
    });

    expect(renderer.container.querySelector('[data-testid="assistant-channel-disabled"]')).not.toBeNull();
    expect(renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="assistant-input"]')?.disabled).toBe(
      true,
    );
  });

  it('sends the typed text through the assistant hook', async () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ key: 'gemini-key', isNewKey: false });
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: 'ok' }] },
      toolMessages: [],
      generatedFiles: [],
    });

    act(() => {
      renderer.root.render(<ProviderAssistantPanel />);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="assistant-input"]')!;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '加一个 DeepSeek' } });
    });

    const form = renderer.container.querySelector<HTMLFormElement>('[data-testid="assistant-form"]')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    const items = useSettingsAssistantStore.getState().items;
    expect(items.some((item) => item.kind === 'user' && item.text === '加一个 DeepSeek')).toBe(true);
    expect(items.some((item) => item.kind === 'assistant' && item.text === 'ok')).toBe(true);
  });
});
