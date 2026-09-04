import { act } from 'react';
import { renderWithProviders, setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageActions } from './MessageActions';
import type { ChatMessage } from '@/types';

vi.mock('./buttons/ExportMessageButton', () => ({
  ExportMessageButton: ({ className }: { className?: string }) => (
    <button type="button" className={className} aria-label="Export">
      Export
    </button>
  ),
}));

vi.mock('./buttons/MessageCopyButton', () => ({
  MessageCopyButton: ({ className }: { className?: string }) => (
    <button type="button" className={className} aria-label="Copy">
      Copy
    </button>
  ),
}));

describe('MessageActions', () => {
  const renderer = setupTestRenderer();

  const message: ChatMessage = {
    id: 'message-1',
    role: 'model',
    content: 'Hello from the model',
    timestamp: new Date('2026-04-13T00:00:00.000Z'),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderMessageActions = (overrides: Partial<React.ComponentProps<typeof MessageActions>> = {}) => {
    renderer.root.render(
      <MessageActions
        message={message}
        sessionTitle="Session"
        messageIndex={0}
        isGrouped={false}
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        onRetryMessage={() => {}}
        onContinueGeneration={() => {}}
        onForkMessage={() => {}}
        themeId="pearl"
        {...overrides}
      />,
    );
  };

  it('does not render a read-aloud action for model messages', () => {
    act(() => {
      renderMessageActions();
    });

    expect(renderer.container.querySelector('[aria-label="Read message aloud"]')).not.toBeInTheDocument();
  });

  it('shows the action column by default on mobile without relying on hover', () => {
    window.innerWidth = 390;

    act(() => {
      renderMessageActions();
    });

    const actions = renderer.container.querySelector('.message-actions');
    expect(actions?.className).toContain('opacity-100');
    expect(actions?.className).not.toContain('opacity-0');
    expect(actions?.className).toContain('pointer-events-auto');
  });

  it('keeps compact message action buttons free of scale transforms', () => {
    act(() => {
      renderMessageActions();
    });

    const deleteButton = renderer.container.querySelector('button[aria-label="Delete"]');
    expect(deleteButton?.className).not.toContain('scale');
  });

  it('keeps generation actions in the message overflow menu without a Live Artifacts visualization item', () => {
    const handleContinueGeneration = vi.fn();
    const handleForkMessage = vi.fn();

    act(() => {
      renderMessageActions({
        onContinueGeneration: handleContinueGeneration,
        onForkMessage: handleForkMessage,
      });
    });

    expect(renderer.container.querySelector('[aria-label="Continue Generating"]')).not.toBeInTheDocument();
    expect(renderer.container.querySelector('[aria-label="Visualize with Live Artifacts"]')).not.toBeInTheDocument();

    const moreButton = renderer.container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]');
    expect(moreButton).toBeInTheDocument();
    expect(moreButton?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(moreButton?.getAttribute('aria-expanded')).toBe('true');
    const menu = renderer.container.querySelector('[role="menu"]');
    expect(menu).toBeInTheDocument();

    const continueItem = renderer.container.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Continue Generating"]',
    );
    const liveArtifactsItem = renderer.container.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Visualize with Live Artifacts"]',
    );
    const forkItem = renderer.container.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Fork from here"]',
    );
    expect(continueItem).toBeInTheDocument();
    expect(liveArtifactsItem).not.toBeInTheDocument();
    expect(forkItem).toBeInTheDocument();
    const forkIcon = forkItem?.querySelector('svg');
    expect(forkIcon?.getAttribute('viewBox')).toBe('0 0 16 16');

    act(() => {
      forkItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleForkMessage).toHaveBeenCalledWith('message-1');
    expect(renderer.container.querySelector('[role="menu"]')).not.toBeInTheDocument();

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const reopenedContinueItem = renderer.container.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Continue Generating"]',
    );

    act(() => {
      reopenedContinueItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleContinueGeneration).toHaveBeenCalledWith('message-1');
    expect(renderer.container.querySelector('[role="menu"]')).not.toBeInTheDocument();
  });

  it('listens for overflow menu dismissal in the provided document', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const pipDocument = iframe.contentDocument!;
    const pipWindow = iframe.contentWindow!;
    pipWindow.matchMedia = window.matchMedia;
    const pipContainer = pipDocument.createElement('div');
    pipDocument.body.appendChild(pipContainer);
    const pipRenderer = renderWithProviders(
      <MessageActions
        message={message}
        sessionTitle="Session"
        messageIndex={0}
        isGrouped={false}
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        onRetryMessage={() => {}}
        onContinueGeneration={() => {}}
        onForkMessage={() => {}}
        themeId="pearl"
      />,
      {
        window: pipWindow,
        document: pipDocument,
        container: pipContainer,
        baseElement: pipDocument.body,
      },
    );

    const moreButton = pipRenderer.container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]');

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(pipRenderer.container.querySelector('[role="menu"]')).toBeInTheDocument();

    act(() => {
      pipDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(pipRenderer.container.querySelector('[role="menu"]')).not.toBeInTheDocument();
    iframe.remove();
  });

  it('uses the custom assistant avatar image for model messages only', () => {
    const userMessage: ChatMessage = {
      ...message,
      id: 'message-2',
      role: 'user',
      content: 'Hello from the user',
    };

    act(() => {
      renderer.root.render(
        <>
          <MessageActions
            message={message}
            sessionTitle="Session"
            messageIndex={0}
            isGrouped={false}
            onEditMessage={() => {}}
            onDeleteMessage={() => {}}
            onRetryMessage={() => {}}
            onContinueGeneration={() => {}}
            onForkMessage={() => {}}
            themeId="pearl"
          />
          <MessageActions
            message={userMessage}
            sessionTitle="Session"
            messageIndex={1}
            isGrouped={false}
            onEditMessage={() => {}}
            onDeleteMessage={() => {}}
            onRetryMessage={() => {}}
            onContinueGeneration={() => {}}
            onForkMessage={() => {}}
            themeId="pearl"
          />
        </>,
      );
    });

    const assistantAvatar = renderer.container.querySelector<HTMLImageElement>('img[alt="Assistant avatar"]');

    expect(assistantAvatar).toBeInTheDocument();
    expect(assistantAvatar?.getAttribute('src')).toBe('/assets/assistant-avatar.png');
    expect(assistantAvatar?.className).toContain('object-contain');
    expect(assistantAvatar?.className).not.toContain('rounded-full');
    expect(renderer.container.querySelectorAll('img[alt="Assistant avatar"]')).toHaveLength(1);
  });

  it('exposes message avatars as keyboard-focusable edit buttons', () => {
    const onEditMessage = vi.fn();

    act(() => {
      renderMessageActions({ onEditMessage });
    });

    const avatarButton = renderer.container.querySelector<HTMLButtonElement>('button[aria-label="Edit"]');
    expect(avatarButton).not.toBeNull();
    expect(avatarButton?.querySelector('img[alt="Assistant avatar"]')).not.toBeNull();

    act(() => {
      avatarButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onEditMessage).toHaveBeenCalledWith('message-1', 'update');
  });
});
