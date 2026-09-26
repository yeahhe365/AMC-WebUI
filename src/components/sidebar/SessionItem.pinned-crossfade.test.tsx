import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatSettings } from '@/test/data/factories';
import type { SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';

const makeSession = (id: string, isPinned = false): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: Date.now() - 60_000,
  messages: [{ id: 'm-1', role: 'user', content: 'hi', timestamp: new Date() }],
  settings: createChatSettings(),
  isPinned,
});

describe('SessionItem Pinned Indicator Zero-Shift Cross-Fade', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders pinned indicator in trailing cell in resting state without leading icon in anchor', () => {
    const session = makeSession('s-pinned', true);

    act(() => {
      renderer.render(<SessionItem session={session} />);
    });

    const link = renderer.container.querySelector('a');
    expect(link).not.toBeNull();

    // The anchor does not contain any leading Pin SVG before the title
    const directSvgsInLink = link?.querySelectorAll(':scope > svg');
    expect(directSvgsInLink?.length).toBe(0);

    // Resting trailing cell contains the pinned indicator
    const pinnedIndicator = renderer.container.querySelector('[data-testid="session-pinned-indicator"]');
    expect(pinnedIndicator).not.toBeNull();
    expect(pinnedIndicator?.getAttribute('aria-label')).toBe('Pinned');

    // Resting trailing cell fades out on hover
    const timeCell = renderer.container.querySelector('[data-testid="session-relative-time"]');
    expect(timeCell?.className).toContain('group-hover:opacity-0');

    // Quick action unpin button is rendered for hover cross-fade
    const unpinBtn = renderer.container.querySelector('button[title="Unpin"]');
    expect(unpinBtn).not.toBeNull();
  });

  it('renders no trailing pinned indicator for unpinned sessions', () => {
    const session = makeSession('s-unpinned', false);

    act(() => {
      renderer.render(<SessionItem session={session} />);
    });

    const pinnedIndicator = renderer.container.querySelector('[data-testid="session-pinned-indicator"]');
    expect(pinnedIndicator).toBeNull();
  });
});
