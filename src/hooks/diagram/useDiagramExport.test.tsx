import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, renderHook } from '@/test/render/renderer';
import { useDiagramExport } from './useDiagramExport';

const { exportSvgAsImageMock } = vi.hoisted(() => ({ exportSvgAsImageMock: vi.fn() }));

vi.mock('@/utils/export/image', () => ({
  exportSvgAsImage: exportSvgAsImageMock,
}));

describe('useDiagramExport', () => {
  beforeEach(() => {
    exportSvgAsImageMock.mockReset();
  });

  it('is a no-op while the diagram SVG is empty', async () => {
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiagramExport({ svg: '', filenamePrefix: 'mermaid', scale: 3, onError, fallbackErrorMessage: 'fallback' }),
    );

    await act(async () => {
      await result.current.handleDownloadJpg();
    });

    expect(exportSvgAsImageMock).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isDownloading).toBe(false);
    unmount();
  });

  it('downloads a scaled JPEG named `${prefix}-diagram-${timestamp}.jpg`', async () => {
    exportSvgAsImageMock.mockResolvedValue(undefined);
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiagramExport({
        svg: '<svg/>',
        filenamePrefix: 'graphviz',
        scale: 5,
        onError,
        fallbackErrorMessage: 'fallback',
      }),
    );

    await act(async () => {
      await result.current.handleDownloadJpg();
    });

    expect(exportSvgAsImageMock).toHaveBeenCalledTimes(1);
    const [svgArg, filenameArg, scaleArg, mimeTypeArg] = exportSvgAsImageMock.mock.calls[0];
    expect(svgArg).toBe('<svg/>');
    expect(filenameArg).toMatch(/^graphviz-diagram-\d+\.jpg$/);
    expect(scaleArg).toBe(5);
    expect(mimeTypeArg).toBe('image/jpeg');
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isDownloading).toBe(false);
    unmount();
  });

  it('surfaces error.message through onError when the export fails', async () => {
    exportSvgAsImageMock.mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiagramExport({
        svg: '<svg/>',
        filenamePrefix: 'mermaid',
        scale: 3,
        onError,
        fallbackErrorMessage: 'fallback',
      }),
    );

    await act(async () => {
      await result.current.handleDownloadJpg();
    });

    expect(onError).toHaveBeenCalledWith('boom');
    expect(result.current.isDownloading).toBe(false);
    unmount();
  });

  it('falls back to the provided message for non-Error failures', async () => {
    exportSvgAsImageMock.mockRejectedValue('nope');
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiagramExport({
        svg: '<svg/>',
        filenamePrefix: 'mermaid',
        scale: 3,
        onError,
        fallbackErrorMessage: 'fallback-message',
      }),
    );

    await act(async () => {
      await result.current.handleDownloadJpg();
    });

    expect(onError).toHaveBeenCalledWith('fallback-message');
    expect(result.current.isDownloading).toBe(false);
    unmount();
  });

  it('ignores re-entrant clicks while a download is in flight', async () => {
    const deferred = createDeferred<void>();
    exportSvgAsImageMock.mockReturnValue(deferred.promise);
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiagramExport({
        svg: '<svg/>',
        filenamePrefix: 'mermaid',
        scale: 3,
        onError,
        fallbackErrorMessage: 'fallback',
      }),
    );

    let firstDownload!: Promise<void>;
    act(() => {
      firstDownload = result.current.handleDownloadJpg();
    });
    expect(result.current.isDownloading).toBe(true);

    // Second click during the in-flight download must be dropped.
    await act(async () => {
      await result.current.handleDownloadJpg();
    });

    deferred.resolve();
    await act(async () => {
      await firstDownload;
    });

    expect(exportSvgAsImageMock).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isDownloading).toBe(false);
    unmount();
  });
});
