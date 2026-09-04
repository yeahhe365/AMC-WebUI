import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTextFileEditor } from './CreateTextFileEditor';

describe('CreateTextFileEditor image insertion', () => {
  const renderer = setupTestRenderer();
  let originalFileReader: typeof FileReader;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFileReader = globalThis.FileReader;

    class MockFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          this.onload?.({
            target: {
              result: 'data:image/png;base64,ZmFrZQ==',
            },
          } as ProgressEvent<FileReader>);
        }, 0);
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stores pasted images as compact placeholders in the editor and restores data URLs on save', async () => {
    const onConfirm = vi.fn();
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:http://127.0.0.1:4173/stale-image');

    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          initialFilename="draft.md"
          themeId="pearl"
        />,
      );
    });

    const textarea = document.body.querySelector('textarea');
    expect(textarea).toBeTruthy();

    const imageFile = new File(['fake-image'], 'clipboard.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });

    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      value: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
        getData: () => '',
      },
    });

    await act(async () => {
      textarea!.dispatchEvent(pasteEvent);
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(createObjectUrlSpy).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toContain('![clipboard.png](内嵌图片-1)');
    expect((textarea as HTMLTextAreaElement).value).not.toContain('data:image/png;base64,ZmFrZQ==');
    expect((textarea as HTMLTextAreaElement).value).not.toContain('blob:http://127.0.0.1:4173/stale-image');

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const createButton = allButtons[allButtons.length - 1];
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toContain('data:image/png;base64,ZmFrZQ==');
    expect(onConfirm.mock.calls[0][0]).not.toContain('(内嵌图片-1)');
  });

  it('pastes HTML text instead of a companion clipboard image thumbnail', async () => {
    vi.useRealTimers();
    await import('@/utils/htmlToMarkdown');
    const onConfirm = vi.fn();

    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          themeId="pearl"
        />,
      );
    });

    const textarea = document.body.querySelector('textarea')!;
    const imageFile = new File(['fake-image'], 'thumbnail.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      value: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
        getData: (type: string) => {
          if (type === 'text/html') return '<p>Hello from docs</p>';
          if (type === 'text/plain') return 'Hello from docs';
          return '';
        },
      },
    });

    await act(async () => {
      textarea.dispatchEvent(pasteEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((textarea as HTMLTextAreaElement).value).toContain('Hello from docs');
    expect((textarea as HTMLTextAreaElement).value).not.toContain('thumbnail.png');
  });

  it('stores data-URL images from pasted HTML as compact placeholders', async () => {
    vi.useRealTimers();
    await import('@/utils/htmlToMarkdown');

    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          themeId="pearl"
        />,
      );
    });

    const textarea = document.body.querySelector('textarea')!;
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      value: {
        items: [],
        getData: (type: string) => {
          if (type === 'text/html') {
            return '<p>Photo</p><img alt="shot.png" src="data:image/png;base64,ZmFrZQ==">';
          }
          return '';
        },
      },
    });

    await act(async () => {
      textarea.dispatchEvent(pasteEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((textarea as HTMLTextAreaElement).value).toContain('![shot.png](内嵌图片-1)');
    expect((textarea as HTMLTextAreaElement).value).not.toContain('data:image/png;base64,ZmFrZQ==');
  });
});
