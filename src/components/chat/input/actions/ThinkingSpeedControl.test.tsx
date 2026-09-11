import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { ChatInputContext } from '@/components/chat/input/ChatInputContext';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { ThinkingSpeedControl } from './ThinkingSpeedControl';
import type { ChatInputContextValue } from '@/components/chat/input/chatInputContextTypes';

const createMockChatInputContext = (modelId: string, thinkingLevel?: string): ChatInputContextValue => {
  return {
    chatInput: {
      appSettings: DEFAULT_APP_SETTINGS,
      currentChatSettings: {
        ...DEFAULT_CHAT_SETTINGS,
        modelId,
        thinkingLevel: thinkingLevel as any,
      },
      setCurrentChatSettings: vi.fn(),
      setAppFileError: vi.fn(),
      activeSessionId: 'session-1',
      commandedInput: null,
      onMessageSent: vi.fn(),
      selectedFiles: [],
      setSelectedFiles: vi.fn(),
      onSendMessage: vi.fn(),
      isLoading: false,
      isEditing: false,
      editMode: 'resend',
      editingMessageId: null,
      setEditingMessageId: vi.fn(),
      onStopGenerating: vi.fn(),
      onCancelEdit: vi.fn(),
      onProcessFiles: vi.fn(),
      onAddFileById: vi.fn(),
      onCancelUpload: vi.fn(),
      onSelectModel: vi.fn(),
      onRefreshModels: vi.fn(),
      isRefreshingModels: false,
      availableModels: [],
    } as any,
  } as unknown as ChatInputContextValue;
};

describe('ThinkingSpeedControl', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('does not render for legacy unsupported OpenAI models (o1, o3-mini)', () => {
    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('o1')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).toBe('');

    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('o3-mini')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).toBe('');
  });

  it('does not render for non-reasoning models (gpt-4o, claude-haiku-4-5)', () => {
    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('gpt-4o')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).toBe('');

    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('claude-haiku-4-5')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).toBe('');
  });

  it('renders for modern OpenAI reasoning models (o4, gpt-5.6-sol)', () => {
    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('o4')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).not.toBe('');
    expect(renderer.container.querySelector('button')).not.toBeNull();

    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('gpt-5.6-sol')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).not.toBe('');
    expect(renderer.container.querySelector('button')).not.toBeNull();
  });

  it('renders for Gemini 3 and Claude reasoning models', () => {
    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('gemini-3-flash-preview')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).not.toBe('');

    act(() => {
      renderer.root.render(
        <ChatInputContext.Provider value={createMockChatInputContext('claude-sonnet-5')}>
          <ThinkingSpeedControl />
        </ChatInputContext.Provider>,
      );
    });
    expect(renderer.container.innerHTML).not.toBe('');
  });
});
