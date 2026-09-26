import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatSettings } from '@/test/data/factories';
import type { SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';

const makeSession = (id: string, isPinned = false): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: Date.now(),
  messages: [],
  settings: createChatSettings(),
  isPinned,
});

describe('SessionItem quick actions and title mask', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders quick pin button and toggles pin when clicked', () => {
    const onTogglePinSession = vi.fn();
    const session = makeSession('s-1', false);

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          onTogglePinSession={onTogglePinSession}
        />,
      );
    });

    const pinBtn = renderer.container.querySelector('button[title="Pin"]') as HTMLButtonElement;
    expect(pinBtn).not.toBeNull();
    pinBtn.click();
    expect(onTogglePinSession).toHaveBeenCalledWith('s-1');
  });

  it('renders quick unpin button when session is already pinned', () => {
    const onTogglePinSession = vi.fn();
    const session = makeSession('s-2', true);

    act(() => {
      renderer.render(
        <SessionItem
          session={session}
          onTogglePinSession={onTogglePinSession}
        />,
      );
    });

    const unpinBtn = renderer.container.querySelector('button[title="Unpin"]') as HTMLButtonElement;
    expect(unpinBtn).not.toBeNull();
    unpinBtn.click();
    expect(onTogglePinSession).toHaveBeenCalledWith('s-2');
  });

  it('applies fade-mask-x-r to the title for smooth edge fading', () => {
    const session = makeSession('s-3', false);

    act(() => {
      renderer.render(<SessionItem session={session} />);
    });

    const titleEl = renderer.container.querySelector('.fade-mask-x-r');
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe('Chat s-3');
  });

  it('renders compact relative time in resting state and hides on hover', () => {
    // 5 minutes ago
    const session = {
      ...makeSession('s-4', false),
      timestamp: Date.now() - 5 * 60_000,
    };

    act(() => {
      renderer.render(<SessionItem session={session} />);
    });

    const timeEl = renderer.container.querySelector('[data-testid="session-relative-time"]');
    expect(timeEl).not.toBeNull();
    expect(timeEl?.textContent).toBe('5m');
    expect(timeEl?.className).toContain('group-hover:opacity-0');
  });

  it('renders search snippet and highlights matches when searchQuery is present', () => {
    const session: SavedChatSession = {
      ...makeSession('s-5', false),
      title: 'React Architecture Discussion',
      messages: [
        {
          id: 'm-1',
          role: 'user',
          content: 'We need to discuss state persistence across reloads.',
          timestamp: new Date(),
        },
      ],
    };

    act(() => {
      renderer.render(<SessionItem session={session} searchQuery="persistence" />);
    });

    const marks = renderer.container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toBe('persistence');
    expect(renderer.container.textContent).toContain('state persistence across');
  });

  it('renders active session matching DeepSeek Harness: bg-tertiary, aria-selected=true, and no indicator pill', () => {
    const session = makeSession('s-active', false);

    act(() => {
      renderer.render(<SessionItem session={session} activeSessionId="s-active" />);
    });

    const li = renderer.container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li?.getAttribute('aria-selected')).toBe('true');
    expect(li?.className).toContain('bg-[var(--theme-bg-tertiary)]');
    expect(li?.className).not.toContain('bg-[var(--theme-bg-accent)]');

    const indicator = renderer.container.querySelector('[data-testid="session-active-indicator"]');
    expect(indicator).toBeNull();

    const titleEl = renderer.container.querySelector('.marquee-title');
    expect(titleEl?.className).toContain('font-medium');
  });

  it('renders unselected session with aria-selected=false, hover:bg-tertiary, and no indicator', () => {
    const session = makeSession('s-inactive', false);

    act(() => {
      renderer.render(<SessionItem session={session} activeSessionId="s-other" />);
    });

    const li = renderer.container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li?.getAttribute('aria-selected')).toBe('false');
    expect(li?.className).toContain('hover:bg-[var(--theme-bg-tertiary)]');

    const indicator = renderer.container.querySelector('[data-testid="session-active-indicator"]');
    expect(indicator).toBeNull();

    const titleEl = renderer.container.querySelector('.marquee-title');
    expect(titleEl?.className).toContain('font-medium');
  });
});

