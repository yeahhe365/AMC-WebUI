import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatSettings } from '@/test/data/factories';
import type { ChatGroup, SavedChatSession } from '@/types';
import { GroupItem } from './GroupItem';

const makeSession = (id: string, overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: Date.now() - 1000,
  messages: [{ id: `m-${id}`, role: 'user', content: `Hello ${id}`, timestamp: new Date() }],
  settings: createChatSettings(),
  groupId: 'g-1',
  ...overrides,
});

const makeGroup = (id = 'g-1', title = 'Test Group', isExpanded = true): ChatGroup => ({
  id,
  title,
  timestamp: Date.now(),
  isExpanded,
});

describe('GroupItem 5-Session Bounded Quota & Temporary Expansion', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const defaultProps = {
    group: makeGroup(),
    sessions: [],
    dragOverId: null,
    onToggleGroupExpansion: vi.fn(),
    handleGroupStartEdit: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    onDeleteGroup: vi.fn(),
    onNewChatInGroup: vi.fn(),
  };

  it('bounds regular sessions to 5 and renders expand button when > 5 sessions', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => makeSession(`s-${i + 1}`));

    act(() => {
      renderer.render(<GroupItem {...defaultProps} sessions={sessions} />);
    });

    // Top 5 sessions visible
    expect(renderer.container.textContent).toContain('Chat s-1');
    expect(renderer.container.textContent).toContain('Chat s-5');
    // 6th and 7th sessions are hidden
    expect(renderer.container.textContent).not.toContain('Chat s-6');
    expect(renderer.container.textContent).not.toContain('Chat s-7');

    // Expansion button visible with "Show 2 more"
    const expandBtn = renderer.container.querySelector('button[aria-label="Show 2 more"]') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();
    expect(expandBtn.textContent).toContain('Show 2 more');
  });

  it('temporarily expands all sessions on click and shows Show less button', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => makeSession(`s-${i + 1}`));

    act(() => {
      renderer.render(<GroupItem {...defaultProps} sessions={sessions} />);
    });

    const expandBtn = renderer.container.querySelector('button[aria-label="Show 2 more"]') as HTMLButtonElement;
    act(() => {
      expandBtn.click();
    });

    // All 7 sessions now visible
    expect(renderer.container.textContent).toContain('Chat s-6');
    expect(renderer.container.textContent).toContain('Chat s-7');

    // Collapse button appears
    const collapseBtn = renderer.container.querySelector('button[aria-label="Show less"]') as HTMLButtonElement;
    expect(collapseBtn).not.toBeNull();

    // Clicking collapse restores 5-item quota
    act(() => {
      collapseBtn.click();
    });
    expect(renderer.container.textContent).not.toContain('Chat s-6');
  });

  it('does not consume quota for provisional blank sessions', () => {
    const blankSession: SavedChatSession = {
      ...makeSession('s-blank'),
      title: 'New Chat',
      messages: [],
      blank: true,
    };
    const regularSessions = Array.from({ length: 5 }, (_, i) => makeSession(`s-${i + 1}`));
    const sessions = [blankSession, ...regularSessions];

    act(() => {
      renderer.render(<GroupItem {...defaultProps} sessions={sessions} />);
    });

    // Both the blank session and all 5 regular sessions are visible (6 total)
    expect(renderer.container.textContent).toContain('New Chat');
    expect(renderer.container.textContent).toContain('Chat s-1');
    expect(renderer.container.textContent).toContain('Chat s-5');
    // No overflow button because regular sessions count <= 5
    expect(renderer.container.querySelector('button[aria-label*="more"]')).toBeNull();
  });

  it('does not consume quota for running background sessions', () => {
    const runningSession = makeSession('s-running');
    const regularSessions = Array.from({ length: 5 }, (_, i) => makeSession(`s-${i + 1}`));
    const sessions = [runningSession, ...regularSessions];

    act(() => {
      renderer.render(
        <GroupItem
          {...defaultProps}
          sessions={sessions}
          sessionItemProps={{ loadingSessionIds: new Set(['s-running']) }}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Chat s-running');
    expect(renderer.container.textContent).toContain('Chat s-5');
    expect(renderer.container.querySelector('button[aria-label*="more"]')).toBeNull();
  });

  it('auto-reveals when the active session is beyond the 5-item quota', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => makeSession(`s-${i + 1}`));

    act(() => {
      renderer.render(
        <GroupItem
          {...defaultProps}
          sessions={sessions}
          sessionItemProps={{ activeSessionId: 's-7' }}
        />,
      );
    });

    // Active session s-7 is auto-revealed
    expect(renderer.container.textContent).toContain('Chat s-7');
  });
});
