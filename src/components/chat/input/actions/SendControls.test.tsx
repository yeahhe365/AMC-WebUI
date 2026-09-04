import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ChatRuntimeTestProvider, createChatAreaProviderValue } from '@/test/layout/fixtures';
import {
  createChatInputActionsContextValue,
  createChatInputComposerStatusContextValue,
} from '@/test/chat-input/contextFixtures';
import { ChatInputActionsContext, ChatInputComposerStatusContext } from '@/components/chat/input/ChatInputContext';

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
});
