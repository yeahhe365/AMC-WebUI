import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectedFileDisplay } from './SelectedFileDisplay';
import type { UploadedFile } from '@/types';
import { createUploadedFile } from '@/test/data/factories';

vi.mock('@/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    isCopied: false,
    copyToClipboard: vi.fn(),
  }),
}));

const ensurePdfWorkerConfiguredMock = vi.fn();

vi.mock('@/utils/pdfRuntime', () => ({
  ensurePdfWorkerConfigured: ensurePdfWorkerConfiguredMock,
}));

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-pdf-document">{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="mock-pdf-page" data-page-number={pageNumber}>
      PDF page {pageNumber}
    </div>
  ),
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: 'pdf.worker.mjs',
    },
  },
}));

const createFile = (overrides: Partial<UploadedFile> = {}) =>
  createUploadedFile({
    name: 'notes.txt',
    type: 'text/plain',
    size: 128,
    isProcessing: false,
    ...overrides,
  });

describe('SelectedFileDisplay', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the preview frame on a dedicated class so success animations can target it', () => {
    act(() => {
      renderer.root.render(<SelectedFileDisplay file={createFile()} onRemove={() => {}} onCancelUpload={() => {}} />);
    });

    expect(renderer.container.querySelector('.file-preview-box')).not.toBeNull();
  });

  it('shows upload percentage and speed while a file is uploading', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            uploadState: 'uploading',
            isProcessing: true,
            progress: 42,
            uploadSpeed: '1.8 MB/s',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('42%');
    expect(renderer.container.textContent).toContain('1.8 MB/s');
  });

  it('shows a dedicated Gemini processing stage after upload completes', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            uploadState: 'processing_api',
            isProcessing: true,
            progress: 100,
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Processing on Gemini');
  });

  it('renders primary file controls in a right-side action rail with larger targets', () => {
    const onConfigure = vi.fn();
    const onRemove = vi.fn();

    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile()}
          onRemove={onRemove}
          onCancelUpload={() => {}}
          onConfigure={onConfigure}
        />,
      );
    });

    const actionRail = renderer.container.querySelector('[data-file-action-rail="true"]');
    const editButton = actionRail?.querySelector('[aria-label="Edit File"]');
    const removeButton = actionRail?.querySelector('[aria-label="Remove File"]');

    expect(actionRail).not.toBeNull();
    expect(editButton).not.toBeNull();
    expect(removeButton).not.toBeNull();
    expect(editButton?.className).toContain('h-[30px]');
    expect(editButton?.className).not.toContain('text-white/80');
    expect(removeButton?.className).toContain('w-[30px]');
  });

  it('uses a trash icon for the remove file action', () => {
    act(() => {
      renderer.root.render(<SelectedFileDisplay file={createFile()} onRemove={() => {}} onCancelUpload={() => {}} />);
    });

    const removeButton = renderer.container.querySelector('[aria-label="Remove File"]');

    expect(removeButton?.querySelector('.lucide-trash2')).not.toBeNull();
  });

  it('renders move-to-input as a direct text file action and keeps copy id in overflow', () => {
    const onMoveTextToInput = vi.fn();

    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({ fileApiName: 'files/abc123' })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
          onMoveTextToInput={onMoveTextToInput}
        />,
      );
    });

    const actionRail = renderer.container.querySelector('[data-file-action-rail="true"]');
    const moveButton = actionRail?.querySelector('[aria-label="Move text to input"]') as HTMLButtonElement | null;
    const moreButton = actionRail?.querySelector('[aria-label="More file actions"]') as HTMLButtonElement | null;

    expect(moveButton).not.toBeNull();
    expect(moreButton).not.toBeNull();

    act(() => {
      moveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMoveTextToInput).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }));
    expect(renderer.container.querySelector('[role="menu"]')).toBeNull();

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menu = renderer.container.querySelector('[role="menu"]');

    expect(menu).not.toBeNull();
    expect(menu?.textContent).not.toContain('Move text to input');
    expect(menu?.textContent).toContain('Copy File ID');
  });

  it('does not show the move-to-input action for non-text files', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'diagram.png',
            type: 'image/png',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
          onMoveTextToInput={vi.fn()}
        />,
      );
    });

    const moveButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Move text to input',
    );

    expect(moveButton).toBeUndefined();
  });

  it('renders a cover thumbnail with type badge for text files', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'notes.txt',
            textContent: 'first line\nsecond line\nthird line',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    const thumbnail = renderer.container.querySelector('[data-thumbnail-kind="text"]');
    expect(thumbnail).not.toBeNull();
    expect(thumbnail?.textContent).toContain('TXT');
    expect(renderer.container.textContent).not.toContain('first line');
  });

  it('renders a first-page thumbnail for PDF files', async () => {
    await act(async () => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'paper.pdf',
            type: 'application/pdf',
            dataUrl: 'blob:paper',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="pdf"]')).not.toBeNull();
    await vi.waitFor(() => {
      expect(renderer.container.querySelector('[data-testid="mock-pdf-page"]')).not.toBeNull();
    });
  });

  it('overrides the pdf.js default worker module specifier for PDF thumbnails', async () => {
    await act(async () => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'paper.pdf',
            type: 'application/pdf',
            dataUrl: 'blob:paper',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });
    await vi.waitFor(() => {
      expect(ensurePdfWorkerConfiguredMock).toHaveBeenCalled();
    });
  });

  it('renders an inline video thumbnail for video files', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'clip.mp4',
            type: 'video/mp4',
            dataUrl: 'blob:clip',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="video"]')).not.toBeNull();
    expect(renderer.container.querySelector('video')).not.toBeNull();
  });

  it('renders an audio thumbnail for audio files', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'voice.mp3',
            type: 'audio/mpeg',
            dataUrl: 'blob:voice',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="audio"]')).not.toBeNull();
  });

  it('renders a cover thumbnail for spreadsheet and other document files', () => {
    act(() => {
      renderer.root.render(
        <SelectedFileDisplay
          file={createFile({
            name: 'metrics.csv',
            type: 'text/csv',
          })}
          onRemove={() => {}}
          onCancelUpload={() => {}}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="spreadsheet"]')).not.toBeNull();
  });
});
