import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatInputExpandSizing } from './useChatInputExpandSizing';

describe('useChatInputExpandSizing cherry parity', () => {
  it('exposes restoreDefaultHeight and compact styles', () => {
    const { result } = renderHook(() =>
      useChatInputExpandSizing({
        fontSize: 14,
        isExpanded: false,
        onExpandedChange: vi.fn(),
        focusEditor: vi.fn(),
        minHeight: 46,
      }),
    );
    expect(result.current.restoreDefaultHeight).toBeDefined();
    expect(result.current.compactFrameStyle).toBeDefined();
    expect(result.current.editorContentStyle).toBeDefined();
    expect(result.current.editorElementStyle).toContain('var(--composer-editor-max-height)');
  });
  it('Home/End/Arrow handle', () => {
    const onExpandedChange = vi.fn();
    const { result } = renderHook(() =>
      useChatInputExpandSizing({
        fontSize: 14,
        isExpanded: true,
        onExpandedChange,
        focusEditor: vi.fn(),
        minHeight: 46,
      }),
    );
    act(() => result.current.handleResizeKeyDown({ key: 'Home', preventDefault: vi.fn() } as any));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
