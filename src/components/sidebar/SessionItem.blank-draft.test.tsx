import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatSettings } from '@/test/data/factories';
import type { SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';
import { useChatStore } from '@/stores/chatStore';

const makeBlankSession = (id = 'blank-1'): SavedChatSession => ({
  id,
  title: 'New Chat',
  titleSource: 'default',
  timestamp: Date.now(),
  messages: [],
  settings: createChatSettings(),
  blank: true,
});

describe('SessionItem blank draft placeholder', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useChatStore.setState({
      activeSessionId: null,
      activeMessages: [],
    });
  });

  it('hides relative time and action buttons, applies pr-2, and disables rename on blank session', () => {
    const handleStartEdit = vi.fn();
    const session = makeBlankSession();

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          handleStartEdit={handleStartEdit}
        />,
      );
    });

    // 1. Relative time is hidden
    expect(renderer.container.querySelector('[data-testid="session-relative-time"]')).toBeNull();

    // 2. Trailing action buttons (pin, more options) are not rendered
    expect(renderer.container.querySelector('button[title="Pin"]')).toBeNull();
    expect(renderer.container.querySelector('button[title="More options"]')).toBeNull();

    // 3. Link padding is pr-2, not pr-14
    const link = renderer.container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.className).toContain('pr-2');
    expect(link?.className).not.toContain('pr-14');

    // 4. Double click does NOT trigger rename
    if (link) {
      fireEvent.doubleClick(link);
    }
    expect(handleStartEdit).not.toHaveBeenCalled();
  });

  it('activates relative time, hover actions, pr-14 padding, and rename once a message is sent', () => {
    const handleStartEdit = vi.fn();
    const session = makeBlankSession('active-blank');

    useChatStore.setState({
      activeSessionId: 'active-blank',
      activeMessages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello world',
          timestamp: new Date(),
        },
      ],
    });

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          handleStartEdit={handleStartEdit}
          activeSessionId="active-blank"
        />,
      );
    });

    // 1. Relative time is visible
    expect(renderer.container.querySelector('[data-testid="session-relative-time"]')).not.toBeNull();

    // 2. Trailing action buttons are present
    expect(renderer.container.querySelector('button[title="Pin"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[title="Session options"]')).not.toBeNull();

    // 3. Link padding is pr-14
    const link = renderer.container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.className).toContain('pr-14');

    // 4. Double click triggers rename
    if (link) {
      fireEvent.doubleClick(link);
    }
    expect(handleStartEdit).toHaveBeenCalledWith(session);
  });
});
