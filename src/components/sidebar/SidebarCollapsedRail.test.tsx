import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { SidebarCollapsedRail } from './SidebarCollapsedRail';

describe('SidebarCollapsedRail Logo-to-Panel Morph', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const defaultProps = {
    onToggle: vi.fn(),
    onNewChat: vi.fn(),
    newChatShortcut: 'Ctrl+N',
    activeView: 'chat',
    setActiveView: vi.fn(),
    onMiniSearchClick: vi.fn(),
    searchChatsShortcut: 'Ctrl+K',
    sessions: [],
    activeSessionId: null,
    onSelectSession: vi.fn(),
    onOpenSettingsModal: vi.fn(),
  };

  it('renders morphing toggle button with brand logo mark and panel toggle icon', () => {
    act(() => {
      renderer.render(<SidebarCollapsedRail {...defaultProps} />);
    });

    const toggleBtn = renderer.container.querySelector('button[aria-label="Open history sidebar"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    // Contains the resting brand favicon mark
    const img = toggleBtn.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/favicon.png');

    // Contains the hover panel expand icon SVG
    const svg = toggleBtn.querySelector('svg');
    expect(svg).not.toBeNull();

    // Clicking fires onToggle
    toggleBtn.click();
    expect(defaultProps.onToggle).toHaveBeenCalled();
  });
});
