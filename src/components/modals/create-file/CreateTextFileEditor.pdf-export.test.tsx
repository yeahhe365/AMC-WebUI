import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTextFileEditor } from './CreateTextFileEditor';

const createMarkdownPdfBlobMock = vi.hoisted(() => vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })));
const triggerDownloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/export/markdownPdf', () => ({
  createMarkdownPdfBlob: createMarkdownPdfBlobMock,
}));

vi.mock('@/utils/export/core', () => ({
  triggerDownload: triggerDownloadMock,
}));

describe('CreateTextFileEditor PDF export', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    createMarkdownPdfBlobMock.mockClear();
    triggerDownloadMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates PDF files from Markdown instead of the html2canvas/html2pdf screenshot path', async () => {
    const onConfirm = vi.fn();

    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          initialContent={'# Exported\\n\\n![remote](https://example.com/remote.png)'}
          initialFilename="article.pdf"
          themeId="pearl"
        />,
      );
    });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Save',
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).not.toBeDisabled();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createMarkdownPdfBlobMock).toHaveBeenCalledWith(
      '# Exported\\n\\n![remote](https://example.com/remote.png)',
      {
        filename: 'article.pdf',
        themeId: 'pearl',
      },
    );
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Blob), 'article.pdf');
  });

  it('does not append .pdf twice when downloading a file whose name already includes it', async () => {
    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          initialContent="# Exported"
          initialFilename="article.pdf"
          themeId="pearl"
        />,
      );
    });

    const filenameInput = document.body.querySelector<HTMLInputElement>('[data-create-file-header] input')!;
    await act(async () => {
      const prototype = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      prototype.call(filenameInput, 'article.pdf');
      filenameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const downloadButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Download PDF',
    )!;

    await act(async () => {
      downloadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createMarkdownPdfBlobMock).toHaveBeenCalledWith('# Exported', {
      filename: 'article.pdf',
      themeId: 'pearl',
    });
    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.anything(), 'article.pdf');
  });

  it('does not download an empty PDF', async () => {
    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          initialFilename="article.pdf"
          themeId="pearl"
        />,
      );
    });

    const downloadButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Download PDF',
    )!;
    expect(downloadButton).toBeDisabled();

    await act(async () => {
      downloadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createMarkdownPdfBlobMock).not.toHaveBeenCalled();
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('downloads a PDF only once when the download button is clicked twice', async () => {
    let finishPdf: ((blob: Blob) => void) | undefined;
    createMarkdownPdfBlobMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPdf = resolve;
        }),
    );

    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          initialContent="# Exported"
          initialFilename="article.pdf"
          themeId="pearl"
        />,
      );
    });

    const downloadButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Download PDF',
    )!;

    await act(async () => {
      downloadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      downloadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createMarkdownPdfBlobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishPdf?.(new Blob(['pdf'], { type: 'application/pdf' }));
      await Promise.resolve();
    });

    expect(triggerDownloadMock).toHaveBeenCalledTimes(1);
  });
});
