import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatSettings } from '@/test/data/factories';
import { useChatStore } from '@/stores/chatStore';
import type { SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';

const makeSession = (id: string): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: Date.now() - 60_000,
  messages: [{ id: 'm-1', role: 'user', content: 'hello', timestamp: new Date() }],
  settings: createChatSettings(),
});

describe('SessionItem background running breathing dot and viewed dismissal', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ completedSessions: {} });
  });

  it('renders a breathing blue dot for a background running session', () => {
    const session = makeSession('s-bg');

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          activeSessionId="s-active"
          loadingSessionIds={new Set(['s-bg'])}
        />,
      );
    });

    const runningDot = renderer.container.querySelector('[data-testid="session-running-dot"]');
    expect(runningDot).not.toBeNull();
    expect(runningDot?.getAttribute('aria-label')).toBe('Running in background');
    expect(runningDot?.querySelector('.bg-blue-500')).not.toBeNull();
  });

  it('renders LoadingDots instead of running dot for the active running session', () => {
    const session = makeSession('s-act');

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          activeSessionId="s-act"
          loadingSessionIds={new Set(['s-act'])}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="session-running-dot"]')).toBeNull();
    // LoadingDots container exists
    const dots = renderer.container.querySelector('.pointer-events-none');
    expect(dots).not.toBeNull();
  });

  it('instantly marks session viewed and clears completion dot when clicked', () => {
    useChatStore.setState({ completedSessions: { 's-done': 'success' } });
    const onSelectSession = vi.fn();
    const session = makeSession('s-done');

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          activeSessionId="s-other"
          onSelectSession={onSelectSession}
        />,
      );
    });

    // Green dot is visible initially
    expect(renderer.container.querySelector('.bg-\\[\\#22c55e\\]')).not.toBeNull();

    // Click the session link
    const link = renderer.container.querySelector('a') as HTMLAnchorElement;
    act(() => {
      link.click();
    });

    // onSelectSession called
    expect(onSelectSession).toHaveBeenCalledWith('s-done');
    // Store record is immediately cleared
    expect(useChatStore.getState().completedSessions['s-done']).toBeUndefined();
  });
});
