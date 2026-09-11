import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createChatInputActionsContextValue } from '@/test/chat-input/contextFixtures';
import { ChatInputActionsContext } from '@/components/chat/input/ChatInputContext';
import * as useDeviceModule from '@/hooks/useDevice';
import { LiveControls } from './LiveControls';

describe('LiveControls', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders screen share button on desktop', () => {
    vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(false);
    const onStartLiveScreenShare = vi.fn();

    act(() => {
      renderer.root.render(
        <ChatInputActionsContext.Provider
          value={createChatInputActionsContextValue({
            onStartLiveScreenShare,
            isLiveTranslate: false,
            isLiveTranscribe: false,
          })}
        >
          <LiveControls />
        </ChatInputActionsContext.Provider>,
      );
    });

    const screenShareBtn = renderer.container.querySelector('button[aria-label="Start Screen Share"]');
    expect(screenShareBtn).not.toBeNull();

    act(() => {
      screenShareBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStartLiveScreenShare).toHaveBeenCalledTimes(1);
  });

  it('hides screen share button on mobile', () => {
    vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(true);
    const onStartLiveScreenShare = vi.fn();

    act(() => {
      renderer.root.render(
        <ChatInputActionsContext.Provider
          value={createChatInputActionsContextValue({
            onStartLiveScreenShare,
            isLiveTranslate: false,
            isLiveTranscribe: false,
          })}
        >
          <LiveControls />
        </ChatInputActionsContext.Provider>,
      );
    });

    const screenShareBtn = renderer.container.querySelector('button[aria-label="Start Screen Share"]');
    expect(screenShareBtn).toBeNull();
  });
});
