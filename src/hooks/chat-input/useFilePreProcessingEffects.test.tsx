import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { useFilePreProcessingEffects } from './useFilePreProcessingEffects';
import { captureScreenImage } from '@/utils/screenCapture';

vi.mock('@/utils/screenCapture', () => ({
  captureScreenImage: vi.fn(),
}));

const { generateZipContextMock } = vi.hoisted(() => ({
  generateZipContextMock: vi.fn(),
}));

vi.mock('@/utils/import-context/loaders', () => ({
  generateZipContext: generateZipContextMock,
  generateFolderContext: vi.fn(),
}));

const mockedCaptureScreenImage = vi.mocked(captureScreenImage);

const createParams = (overrides: Partial<Parameters<typeof useFilePreProcessingEffects>[0]> = {}) => ({
  fileInputRef: { current: null },
  imageInputRef: { current: null },
  folderInputRef: { current: null },
  zipInputRef: { current: null },
  justInitiatedFileOpRef: { current: false },
  onProcessFiles: vi.fn(async () => {}),
  setSelectedFiles: vi.fn(),
  setAppFileError: vi.fn(),
  ...overrides,
});

describe('useFilePreProcessingEffects screenshot handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports capture errors and clears the screenshot busy state', async () => {
    mockedCaptureScreenImage.mockRejectedValue(new Error('screen capture exploded'));
    const params = createParams();

    const { result, unmount } = renderHook(() => useFilePreProcessingEffects(params));

    await act(async () => {
      await result.current.handleScreenshot();
    });

    expect(params.setAppFileError).toHaveBeenCalledWith('Failed to capture screenshot.');
    expect(params.onProcessFiles).not.toHaveBeenCalled();
    expect(result.current.isScreenCapturing).toBe(false);

    unmount();
  });

  it('ignores duplicate screenshot requests while a capture is in progress', async () => {
    let resolveCapture!: (blob: Blob) => void;
    mockedCaptureScreenImage.mockReturnValue(
      new Promise<Blob>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const params = createParams();

    const { result, unmount } = renderHook(() => useFilePreProcessingEffects(params));

    let firstCapture!: Promise<void>;
    await act(async () => {
      firstCapture = result.current.handleScreenshot();
    });

    await act(async () => {
      await result.current.handleScreenshot();
    });

    expect(mockedCaptureScreenImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCapture(new Blob(['png'], { type: 'image/png' }));
      await firstCapture;
    });

    expect(params.onProcessFiles).toHaveBeenCalledTimes(1);
    expect(result.current.isScreenCapturing).toBe(false);

    unmount();
  });
});

describe('useFilePreProcessingEffects zip import handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('converts selected zip file into project context file', async () => {
    const fakeZipFile = new File(['fake-zip-data'], 'test-project.zip', { type: 'application/zip' });
    const fakeContextFile = new File(['context content'], 'test-project-context-2026.txt', { type: 'text/plain' });
    generateZipContextMock.mockResolvedValue(fakeContextFile);

    const zipInput = document.createElement('input');
    zipInput.type = 'file';
    const params = createParams({
      zipInputRef: { current: zipInput },
    });

    const { result, unmount } = renderHook(() => useFilePreProcessingEffects(params));

    const event = {
      target: {
        files: [fakeZipFile],
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleZipChange(event);
    });

    expect(params.setSelectedFiles).toHaveBeenCalled();
    expect(params.onProcessFiles).toHaveBeenCalledWith([fakeContextFile]);
    expect(zipInput.value).toBe('');

    unmount();
  });

  it('handles zip import failure by reporting error message and clearing placeholder', async () => {
    const fakeZipFile = new File(['corrupt-zip'], 'corrupt.zip', { type: 'application/zip' });
    generateZipContextMock.mockRejectedValueOnce(new Error('Corrupted zip archive'));

    const zipInput = document.createElement('input');
    zipInput.type = 'file';
    const params = createParams({
      zipInputRef: { current: zipInput },
    });

    const { result, unmount } = renderHook(() => useFilePreProcessingEffects(params));

    const event = {
      target: {
        files: [fakeZipFile],
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleZipChange(event);
    });

    expect(params.setAppFileError).toHaveBeenCalledWith('Corrupted zip archive');
    expect(params.onProcessFiles).not.toHaveBeenCalled();

    unmount();
  });
});
