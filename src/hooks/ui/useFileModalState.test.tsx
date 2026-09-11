import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { createUploadedFile } from '@/test/data/factories';
import { useFileModalState } from './useFileModalState';
import { renderHook } from '@/test/render/renderer';

const files = [
  createUploadedFile({
    name: 'preview.png',
    size: 1,
  }),
];

describe('useFileModalState', () => {
  it('tracks preview state and resets editability when the preview closes', () => {
    const { result, unmount } = renderHook(() => useFileModalState<string>(files));

    act(() => {
      result.current.openPreview(files[0], { editable: true });
    });

    expect(result.current.previewFile).toBe(files[0]);
    expect(result.current.isPreviewEditable).toBe(true);

    act(() => {
      result.current.closePreview();
    });

    expect(result.current.previewFile).toBeNull();
    expect(result.current.isPreviewEditable).toBe(false);

    unmount();
  });

  it('tracks configuration payloads separately from preview state', () => {
    const { result, unmount } = renderHook(() =>
      useFileModalState<{ fileId: string; source: 'chat' | 'message' }>(files),
    );

    act(() => {
      result.current.openConfiguration({ fileId: 'file-1', source: 'message' });
    });

    expect(result.current.configuringFile).toEqual({ fileId: 'file-1', source: 'message' });

    act(() => {
      result.current.closeConfiguration();
    });

    expect(result.current.configuringFile).toBeNull();

    unmount();
  });

  it('supports universal navigation across mixed file types (PDF, text, image)', () => {
    const pdf = createUploadedFile({ id: 'f-pdf', name: 'doc.pdf', type: 'application/pdf' });
    const img = createUploadedFile({ id: 'f-img', name: 'pic.png', type: 'image/png' });
    const txt = createUploadedFile({ id: 'f-txt', name: 'notes.md', type: 'text/markdown' });

    const { result, unmount } = renderHook(() => useFileModalState<string>([pdf, img, txt]));

    act(() => {
      result.current.openPreview(pdf);
    });

    expect(result.current.previewFile).toBe(pdf);
    expect(result.current.currentImageIndex).toBe(0);
    expect(result.current.allImages).toHaveLength(3);

    act(() => {
      result.current.handleNextImage();
    });

    expect(result.current.previewFile).toBe(img);
    expect(result.current.currentImageIndex).toBe(1);

    act(() => {
      result.current.handleNextImage();
    });

    expect(result.current.previewFile).toBe(txt);
    expect(result.current.currentImageIndex).toBe(2);

    act(() => {
      result.current.handlePrevImage();
    });

    expect(result.current.previewFile).toBe(img);
    expect(result.current.currentImageIndex).toBe(1);

    unmount();
  });
});
