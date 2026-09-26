import { act } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createHistorySidebarProps } from '@/test/sidebar/historySidebar';
import { HistorySidebar } from './HistorySidebar';

describe('HistorySidebar scrollbar linger (2000ms)', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals scrollbar on pointer enter, arms 2s linger on leaving box, and hides when linger expires', async () => {
    const props = createHistorySidebarProps({ sessions: [] });

    await act(async () => {
      renderer.root.render(<HistorySidebar {...props} />);
    });

    const aside = renderer.container.querySelector('aside[data-history-sidebar-root="true"]') as HTMLElement;
    expect(aside).not.toBeNull();

    // Mock bounding box for the sidebar
    vi.spyOn(aside, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 260, 800));

    // 1. Initial state: pointer is outside, scrollbar thumb is transparent
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('transparent');

    // 2. Pointer enters sidebar: scrollbar thumb becomes theme thumb
    act(() => {
      fireEvent.pointerEnter(aside);
    });
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('var(--theme-scrollbar-thumb)');

    // 3. Pointer moves inside the bounding box (clientX=100, clientY=200): linger stays cancelled
    act(() => {
      fireEvent(document, new PointerEvent('pointermove', { clientX: 100, clientY: 200 }));
    });
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('var(--theme-scrollbar-thumb)');

    // 4. Pointer moves outside bounding box (clientX=500, clientY=200): arms 2000ms timer
    act(() => {
      fireEvent(document, new PointerEvent('pointermove', { clientX: 500, clientY: 200 }));
    });
    // At 1000ms, still lingering!
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('var(--theme-scrollbar-thumb)');

    // 5. Pointer moves back inside before 2000ms (clientX=50): timer is cancelled!
    act(() => {
      fireEvent(document, new PointerEvent('pointermove', { clientX: 50, clientY: 200 }));
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('var(--theme-scrollbar-thumb)');

    // 6. Pointer leaves sidebar again and remains outside for 2000ms
    act(() => {
      fireEvent(document, new PointerEvent('pointermove', { clientX: 500, clientY: 200 }));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(aside.style.getPropertyValue('--sidebar-scrollbar-thumb')).toBe('transparent');
  });
});
