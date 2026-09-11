import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { createAppSettings, createChatSettings, createSavedChatSession } from '@/test/data/factories';
import { useChatStore } from '@/stores/chatStore';
import { useChatState } from './useChatState';

describe('useChatState', () => {
  beforeEach(() => {
    useChatStore.setState({
      savedSessions: [],
      activeSessionId: null,
      activeMessages: [],
      pendingLockedApiKey: null,
      pendingChatSettings: null,
    });
  });

  it('exposes a pending locked API key before the first session exists', () => {
    useChatStore.setState({ pendingLockedApiKey: 'pending-key' });

    const { result, unmount } = renderHook(() => useChatState(createAppSettings({ lockedApiKey: null })));

    expect(result.current.currentChatSettings.lockedApiKey).toBe('pending-key');
    unmount();
  });

  it('merges pendingChatSettings before the first session exists', () => {
    useChatStore.setState({
      pendingChatSettings: {
        systemInstruction: 'pending-system-prompt',
        modelId: 'custom-model-id',
      },
    });

    const { result, unmount } = renderHook(() => useChatState(createAppSettings()));

    expect(result.current.currentChatSettings.systemInstruction).toBe('pending-system-prompt');
    expect(result.current.currentChatSettings.modelId).toBe('custom-model-id');
    unmount();
  });

  it('uses the active session lock instead of a pending key', () => {
    const session = createSavedChatSession({
      id: 'session-1',
      settings: createChatSettings({ lockedApiKey: 'session-key' }),
    });
    useChatStore.setState({
      savedSessions: [session],
      activeSessionId: 'session-1',
      activeMessages: session.messages,
      pendingLockedApiKey: 'pending-key',
    });

    const { result, unmount } = renderHook(() => useChatState(createAppSettings()));

    expect(result.current.currentChatSettings.lockedApiKey).toBe('session-key');
    unmount();
  });
});
