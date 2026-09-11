import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { useCopyToClipboard } from './useCopyToClipboard';
import * as clipboardModule from '@/utils/clipboard';

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with isCopied false', () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.isCopied).toBe(false);
  });

  it('sets isCopied to true on successful copy and resets after duration', async () => {
    vi.spyOn(clipboardModule, 'copyTextToClipboard').mockResolvedValue(true);
    const { result } = renderHook(() => useCopyToClipboard(1500));

    let success: boolean = false;
    await act(async () => {
      success = await result.current.copyToClipboard('hello');
    });

    expect(success).toBe(true);
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it('sets isCopied to false when copyTextToClipboard fails', async () => {
    vi.spyOn(clipboardModule, 'copyTextToClipboard').mockResolvedValue(false);
    const { result } = renderHook(() => useCopyToClipboard());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.copyToClipboard('fail');
    });

    expect(success).toBe(false);
    expect(result.current.isCopied).toBe(false);
  });

  it('delegates to copyRichTableToClipboard when given rich content object', async () => {
    const copyRichSpy = vi.spyOn(clipboardModule, 'copyRichTableToClipboard').mockResolvedValue(true);
    const { result } = renderHook(() => useCopyToClipboard());

    let success: boolean = false;
    await act(async () => {
      success = await result.current.copyToClipboard({
        plainText: '| a | b |',
        html: '<table><tr><td>a</td><td>b</td></tr></table>',
      });
    });

    expect(success).toBe(true);
    expect(result.current.isCopied).toBe(true);
    expect(copyRichSpy).toHaveBeenCalledWith({
      plainText: '| a | b |',
      html: '<table><tr><td>a</td><td>b</td></tr></table>',
    });
  });
});
