import { act, type ReactNode } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { FileDisplay } from './FileDisplay';
import { createUploadedFile } from '@/test/data/factories';

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: ReactNode }) => <div data-testid="mock-pdf-document">{children}</div>,
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

vi.mock('@/utils/pdfRuntime', () => ({
  ensurePdfWorkerConfigured: vi.fn(),
}));

const createImageFile = () =>
  createUploadedFile({
    id: 'image-1',
    name: 'portrait.png',
    size: 1024,
    dataUrl: 'data:image/png;base64,ZmFrZQ==',
  });

describe('FileDisplay', () => {
  const renderer = setupTestRenderer();

  it('uses a tighter max height for standalone message images', () => {
    act(() => {
      renderer.root.render(<FileDisplay file={createImageFile()} onFileClick={() => {}} isFromMessageList />);
    });

    const image = renderer.container.querySelector('img');

    expect(image).not.toBeNull();
    expect(image).toHaveClass('max-h-56');
    expect(image).toHaveClass('object-contain');
  });

  it('renders a PDF thumbnail in message file cards', async () => {
    await act(async () => {
      renderer.root.render(
        <FileDisplay
          file={createUploadedFile({
            id: 'pdf-1',
            name: 'paper.pdf',
            type: 'application/pdf',
            size: 2048,
            dataUrl: 'blob:paper',
          })}
          onFileClick={() => {}}
          isFromMessageList
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="pdf"]')).not.toBeNull();
    await vi.waitFor(() => {
      expect(renderer.container.querySelector('[data-testid="mock-pdf-page"]')).not.toBeNull();
    });
  });

  it('renders a video thumbnail in message file cards', () => {
    act(() => {
      renderer.root.render(
        <FileDisplay
          file={createUploadedFile({
            id: 'video-1',
            name: 'clip.mp4',
            type: 'video/mp4',
            size: 4096,
            dataUrl: 'blob:clip',
          })}
          onFileClick={() => {}}
          isFromMessageList
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thumbnail-kind="video"]')).not.toBeNull();
    expect(renderer.container.querySelector('video')).not.toBeNull();
  });

  it('opens Files API message attachments when a local raw file is available without a preview URL', () => {
    const onFileClick = vi.fn();
    const rawFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    act(() => {
      renderer.root.render(
        <FileDisplay
          file={createUploadedFile({
            id: 'files-api-text-1',
            name: 'notes.txt',
            type: 'text/plain',
            size: rawFile.size,
            rawFile,
            dataUrl: undefined,
            fileApiName: 'files/abc123',
            fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
            transferStrategy: 'files-api',
          })}
          onFileClick={onFileClick}
          isFromMessageList
        />,
      );
    });

    const card = renderer.container.querySelector('.cursor-pointer');
    expect(card).not.toBeNull();

    act(() => {
      card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onFileClick).toHaveBeenCalledTimes(1);
  });

  it('renders upload progress and speed for an uploading file card in message', () => {
    act(() => {
      renderer.root.render(
        <FileDisplay
          file={createUploadedFile({
            id: 'uploading-doc',
            name: 'dataset.csv',
            type: 'text/csv',
            size: 1048576,
            uploadState: 'uploading',
            progress: 45,
            uploadSpeed: '1.5 MB/s',
            isProcessing: true,
          })}
          onFileClick={() => {}}
          isFromMessageList
        />,
      );
    });

    expect(renderer.container.textContent).toContain('45%');
    expect(renderer.container.textContent).toContain('1.5 MB/s');
    expect(renderer.container.querySelector('.animate-spin')).not.toBeNull();
  });
});
