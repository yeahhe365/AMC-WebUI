import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCompactChatInputPresentation } from './useCompactChatInputPresentation';

describe('useCompactChatInputPresentation', () => {
  it('returns compact for single line', async () => {
    const frame = document.createElement('div');
    frame.innerHTML =
      '<div data-composer-compact-row style="width:200px"><div class="composer-tiptap" style="width:100px"></div></div>';
    document.body.appendChild(frame);
    const ref = { current: frame as unknown as HTMLDivElement } as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useCompactChatInputPresentation({ enabled: true, frameRef: ref, isComposing: () => false }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.isCompact).toBeDefined();
    document.body.removeChild(frame);
  });

  it('requestMeasurement triggers revision', async () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() =>
      useCompactChatInputPresentation({ enabled: true, frameRef: ref, isComposing: () => false }),
    );
    expect(typeof result.current.requestMeasurement).toBe('function');
    result.current.requestMeasurement();
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isCompact).toBe(true);
  });
});
