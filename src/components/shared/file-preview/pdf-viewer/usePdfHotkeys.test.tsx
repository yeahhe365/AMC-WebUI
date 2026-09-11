import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePdfHotkeys } from './usePdfHotkeys';

describe('usePdfHotkeys', () => {
  const setup = (options?: { enabled?: boolean }) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const onPrevPage = vi.fn();
    const onNextPage = vi.fn();
    const onFirstPage = vi.fn();
    const onLastPage = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onRotate = vi.fn();
    const onFitToWidth = vi.fn();
    const onToggleSidebar = vi.fn();

    const { unmount } = renderHook(() =>
      usePdfHotkeys({
        enabled: options?.enabled ?? true,
        containerRef: { current: container },
        onPrevPage,
        onNextPage,
        onFirstPage,
        onLastPage,
        onZoomIn,
        onZoomOut,
        onRotate,
        onFitToWidth,
        onToggleSidebar,
      }),
    );

    return {
      container,
      unmount,
      onPrevPage,
      onNextPage,
      onFirstPage,
      onLastPage,
      onZoomIn,
      onZoomOut,
      onRotate,
      onFitToWidth,
      onToggleSidebar,
    };
  };

  it('triggers navigation hotkeys when container is hovered or active', () => {
    const { container, onPrevPage, onNextPage, onFirstPage, onLastPage, unmount } = setup();

    // Hover container
    container.dispatchEvent(new MouseEvent('mouseenter'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(onPrevPage).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onPrevPage).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
    expect(onPrevPage).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(onNextPage).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    expect(onNextPage).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    expect(onNextPage).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(onFirstPage).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(onLastPage).toHaveBeenCalledTimes(1);

    unmount();
    container.remove();
  });

  it('triggers zoom, rotate, fit-to-width, and sidebar hotkeys', () => {
    const { container, onZoomIn, onZoomOut, onRotate, onFitToWidth, onToggleSidebar, unmount } = setup();

    container.dispatchEvent(new MouseEvent('mouseenter'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    expect(onZoomIn).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
    expect(onZoomOut).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(onRotate).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(onFitToWidth).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    unmount();
    container.remove();
  });

  it('does not trigger hotkeys when Ctrl or Meta is held', () => {
    const { container, onRotate, onPrevPage, unmount } = setup();

    container.dispatchEvent(new MouseEvent('mouseenter'));

    // Ctrl+R should not trigger rotate (allows reload)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }));
    expect(onRotate).not.toHaveBeenCalled();

    // Meta+ArrowLeft should not trigger prev page
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', metaKey: true }));
    expect(onPrevPage).not.toHaveBeenCalled();

    unmount();
    container.remove();
  });

  it('does not trigger hotkeys when an input or textarea is focused', () => {
    const { container, onPrevPage, unmount } = setup();

    container.dispatchEvent(new MouseEvent('mouseenter'));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onPrevPage).not.toHaveBeenCalled();

    input.remove();
    unmount();
    container.remove();
  });
});
