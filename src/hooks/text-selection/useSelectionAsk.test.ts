import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSelectionAsk } from './useSelectionAsk';

type CapturedStream = {
  signal: AbortSignal;
  onPart: (part: { text?: string }) => void;
  onError: (e: Error) => void;
  onComplete: () => void;
};

const streams = vi.hoisted(
  () =>
    [] as Array<{
      signal: AbortSignal;
      onPart: (part: { text?: string }) => void;
      onError: (e: Error) => void;
      onComplete: () => void;
    }>,
);

vi.mock('@/services/api/chatApi', () => ({
  sendStatelessMessageStreamApi: async (
    _key: unknown,
    _modelId: unknown,
    _history: unknown,
    _parts: unknown,
    _requestConfig: unknown,
    signal: AbortSignal,
    onPart: CapturedStream['onPart'],
    _onThoughtChunk: unknown,
    onError: CapturedStream['onError'],
    onComplete: CapturedStream['onComplete'],
  ) => {
    streams.push({ signal, onPart, onError, onComplete });
  },
}));

vi.mock('@/utils/chatApiRoute', () => ({
  resolveChatApiRoute: () => ({ modelId: 'ask-model', provider: null }),
  isUnavailableThirdPartyRoute: () => false,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: () => ({ key: 'test-key' }),
  formatApiKeyErrorMessage: (e: unknown) => String(e),
}));

vi.mock('@/services/api/generationConfig', () => ({
  buildGenerationConfig: async () => ({}),
}));

describe('useSelectionAsk', () => {
  beforeEach(() => {
    streams.length = 0;
    useSettingsStore.setState({
      appSettings: {
        ...useSettingsStore.getState().appSettings,
        selectionAskModelId: 'ask-model',
      },
    });
  });

  it('ignores stale callbacks from a superseded request', async () => {
    const { result } = renderHookWithProviders(() => useSelectionAsk(), { language: 'en' });

    await act(async () => {
      result.current.ask('selection text', 'q1');
    });
    expect(streams).toHaveLength(1);
    expect(result.current.isLoading).toBe(true);

    // ask #2 顶掉 #1（内部 cancel abort 了 #1）
    await act(async () => {
      result.current.ask('selection text', 'q2');
    });
    expect(streams).toHaveLength(2);
    expect(streams[0].signal.aborted).toBe(true);
    expect(result.current.isLoading).toBe(true);

    // 旧请求的补发回调必须全部失效
    await act(async () => {
      streams[0].onPart({ text: 'STALE' });
      streams[0].onError(new Error('stale error'));
      streams[0].onComplete();
    });
    expect(result.current.answer).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      streams[1].onPart({ text: 'GOOD' });
      streams[1].onComplete();
    });
    expect(result.current.answer).toBe('GOOD');
    expect(result.current.isLoading).toBe(false);
  });

  it('applies callbacks of the current request and resets cleanly', async () => {
    const { result } = renderHookWithProviders(() => useSelectionAsk(), { language: 'en' });

    await act(async () => {
      result.current.ask('selection text', 'q1');
    });
    await act(async () => {
      streams[0].onPart({ text: 'partial ' });
      streams[0].onPart({ text: 'answer' });
    });
    expect(result.current.answer).toBe('partial answer');

    await act(async () => {
      streams[0].onComplete();
    });
    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(result.current.answer).toBe('');
    expect(result.current.error).toBeNull();
  });
});
