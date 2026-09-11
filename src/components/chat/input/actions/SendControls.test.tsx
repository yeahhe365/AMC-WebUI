import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ChatRuntimeTestProvider, createChatAreaProviderValue } from '@/test/layout/fixtures';
import {
  createChatInputActionsContextValue,
  createChatInputComposerStatusContextValue,
} from '@/test/chat-input/contextFixtures';
import { ChatInputActionsContext, ChatInputComposerStatusContext } from '@/components/chat/input/ChatInputContext';
import { useChatStore } from '@/stores/chatStore';

import { SendControls } from './SendControls';

describe('SendControls', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders the main send button slightly more compact than shared input controls', () => {
    const providerValue = createChatAreaProviderValue();

    act(() => {
      renderer.root.render(
        <ChatRuntimeTestProvider value={providerValue}>
          <ChatInputActionsContext.Provider value={createChatInputActionsContextValue()}>
            <ChatInputComposerStatusContext.Provider
              value={createChatInputComposerStatusContextValue({ hasTrimmedInput: true })}
            >
              <SendControls />
            </ChatInputComposerStatusContext.Provider>
          </ChatInputActionsContext.Provider>
        </ChatRuntimeTestProvider>,
      );
    });

    const submitButton = renderer.container.querySelector('button[type="submit"]');

    expect(submitButton).not.toBeNull();
    expect(submitButton?.className).toContain('!h-9');
    expect(submitButton?.className).toContain('!w-9');
    expect(submitButton?.className).toContain('bg-[#3964FE]');
    expect(submitButton?.className).toContain('grid');
    expect((submitButton as HTMLElement)?.style.transform).toContain('translateY(-2px)');
    expect(submitButton?.className).not.toContain('duration-500');
  });

  it('renders the stop-state send button red instead of blue while waiting', () => {
    const providerValue = createChatAreaProviderValue();

    const renderSendControls = (actionsOverrides: Parameters<typeof createChatInputActionsContextValue>[0]) =>
      act(() => {
        renderer.root.render(
          <ChatRuntimeTestProvider value={providerValue}>
            <ChatInputActionsContext.Provider value={createChatInputActionsContextValue(actionsOverrides)}>
              <ChatInputComposerStatusContext.Provider value={createChatInputComposerStatusContextValue()}>
                <SendControls />
              </ChatInputComposerStatusContext.Provider>
            </ChatInputActionsContext.Provider>
          </ChatRuntimeTestProvider>,
        );
      });

    renderSendControls({ isLoading: true });

    const loadingStopButton = renderer.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop generating response"]',
    );

    expect(loadingStopButton).not.toBeNull();
    expect(loadingStopButton?.className).toContain('bg-[var(--theme-bg-danger)]');
    expect(loadingStopButton?.className).toContain('hover:bg-[var(--theme-bg-danger-hover)]');
    expect(loadingStopButton?.className).not.toContain('#3964FE');

    renderSendControls({ isWaitingForUpload: true });

    const pendingUploadStopButton = renderer.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel sending after upload"]',
    );

    expect(pendingUploadStopButton).not.toBeNull();
    expect(pendingUploadStopButton?.className).toContain('bg-[var(--theme-bg-danger)]');
    expect(pendingUploadStopButton?.className).not.toContain('#3964FE');
  });

  it('lets the waiting-for-upload send button cancel the pending automatic send', () => {
    const onCancelPendingUploadSend = vi.fn();
    const providerValue = createChatAreaProviderValue();

    act(() => {
      renderer.root.render(
        <ChatRuntimeTestProvider value={providerValue}>
          <ChatInputActionsContext.Provider
            value={createChatInputActionsContextValue({
              isWaitingForUpload: true,
            })}
          >
            <ChatInputComposerStatusContext.Provider
              value={createChatInputComposerStatusContextValue({
                canSend: true,
                onCancelPendingUploadSend,
              })}
            >
              <SendControls />
            </ChatInputComposerStatusContext.Provider>
          </ChatInputActionsContext.Provider>
        </ChatRuntimeTestProvider>,
      );
    });

    const button = renderer.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel sending after upload"]',
    );

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });

    expect(onCancelPendingUploadSend).toHaveBeenCalledTimes(1);
  });

  it('renders the check icon and save labels when editing in update mode', () => {
    const providerValue = createChatAreaProviderValue();
    act(() => {
      useChatStore.setState({ editingMessageId: 'msg-1', editMode: 'update' });
    });

    try {
      act(() => {
        renderer.root.render(
          <ChatRuntimeTestProvider value={providerValue}>
            <ChatInputActionsContext.Provider value={createChatInputActionsContextValue()}>
              <ChatInputComposerStatusContext.Provider
                value={createChatInputComposerStatusContextValue({ hasTrimmedInput: true, canSend: true })}
              >
                <SendControls />
              </ChatInputComposerStatusContext.Provider>
            </ChatInputActionsContext.Provider>
          </ChatRuntimeTestProvider>,
        );
      });

      const saveButton = renderer.container.querySelector<HTMLButtonElement>(
        'button[type="submit"][aria-label="Save"]',
      );
      expect(saveButton).not.toBeNull();
      expect(saveButton?.title).toBe('Save');
      // Verify lucide Check svg is rendered (has class lucide-check)
      expect(saveButton?.querySelector('.lucide-check')).not.toBeNull();
      expect(saveButton?.className).toContain('!rounded-full');
      expect(saveButton?.className).toContain('bg-[#3964FE]');
      expect(saveButton?.className).toContain('shadow-sm');
      // Ensure cancel edit button is rendered as text and cancels edit on click
      const cancelBtn = renderer.container.querySelector<HTMLButtonElement>('button[aria-label="Cancel editing"]');
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn?.textContent).toBe('Cancel');
      expect((cancelBtn as HTMLElement)?.style.transform).toContain('translateY(-2px)');
      act(() => {
        cancelBtn?.click();
      });
      expect(useChatStore.getState().editingMessageId).toBeNull();
    } finally {
      act(() => {
        useChatStore.setState({ editingMessageId: null, editMode: 'resend' });
      });
    }
  });

  it('renders the send icon and update labels when editing in resend mode', () => {
    const providerValue = createChatAreaProviderValue();
    act(() => {
      useChatStore.setState({ editingMessageId: 'msg-1', editMode: 'resend' });
    });

    try {
      act(() => {
        renderer.root.render(
          <ChatRuntimeTestProvider value={providerValue}>
            <ChatInputActionsContext.Provider value={createChatInputActionsContextValue()}>
              <ChatInputComposerStatusContext.Provider
                value={createChatInputComposerStatusContextValue({ hasTrimmedInput: true, canSend: true })}
              >
                <SendControls />
              </ChatInputComposerStatusContext.Provider>
            </ChatInputActionsContext.Provider>
          </ChatRuntimeTestProvider>,
        );
      });

      const submitButton = renderer.container.querySelector<HTMLButtonElement>(
        'button[type="submit"][aria-label="Update message"]',
      );
      expect(submitButton).not.toBeNull();
      expect(submitButton?.title).toBe('Update & Send');
      expect(submitButton?.querySelector('.lucide-save')).toBeNull();
    } finally {
      act(() => {
        useChatStore.setState({ editingMessageId: null, editMode: 'resend' });
      });
    }
  });
});
