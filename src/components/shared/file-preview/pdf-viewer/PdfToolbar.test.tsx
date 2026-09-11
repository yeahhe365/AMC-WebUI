import React, { act, useEffect } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfToolbar } from './PdfToolbar';
import { usePdfViewer } from '@/hooks/ui/usePdfViewer';
import { type UploadedFile } from '@/types';

const file: UploadedFile = {
  id: 'pdf-file',
  name: 'test.pdf',
  type: 'application/pdf',
  size: 1,
  dataUrl: 'blob:test-pdf',
  uploadState: 'active',
};

const secondFile: UploadedFile = {
  ...file,
  id: 'pdf-file-2',
  name: 'test-2.pdf',
  dataUrl: 'blob:test-pdf-2',
};

const PdfToolbarHarnessInner: React.FC<{ file: UploadedFile }> = ({ file }) => {
  const {
    numPages,
    currentPage,
    scale,
    showSidebar,
    containerRef,
    setPageRef,
    onDocumentLoadSuccess,
    scrollToPage,
    previousPage,
    nextPage,
    handlePageInputCommit,
    handleZoomIn,
    handleZoomOut,
    handleRotate,
    toggleSidebar,
  } = usePdfViewer(file);

  useEffect(() => {
    onDocumentLoadSuccess({ numPages: 5 });
  }, [onDocumentLoadSuccess]);

  return (
    <div>
      <div ref={containerRef}>
        {Array.from({ length: 5 }, (_, index) => {
          const pageNumber = index + 1;
          return (
            <div key={pageNumber} data-testid={`page-${pageNumber}`} ref={(element) => setPageRef(pageNumber, element)}>
              Page {pageNumber}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => scrollToPage(4)}>
        Jump to page 4
      </button>
      <PdfToolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        showSidebar={showSidebar}
        onPageInputCommit={handlePageInputCommit}
        onPrevPage={previousPage}
        onNextPage={nextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRotate={handleRotate}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
};

const PdfToolbarHarness: React.FC<{ file: UploadedFile }> = ({ file }) => (
  <PdfToolbarHarnessInner key={file.id} file={file} />
);

const PdfLoadErrorHarness: React.FC<{ file: UploadedFile }> = ({ file }) => {
  const { error, onDocumentLoadError } = usePdfViewer(file);

  return (
    <div>
      <button type="button" onClick={() => onDocumentLoadError(new Error('Invalid xref table'))}>
        fail pdf load
      </button>
      <div data-testid="pdf-load-error">{error ?? ''}</div>
    </div>
  );
};

describe('PdfToolbar', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the typed page draft while the current page changes before commit', async () => {
    await act(async () => {
      renderer.root.render(<PdfToolbarHarness file={file} />);
    });

    const input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    const jumpButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Jump to page 4'),
    );

    expect(input).toBeTruthy();
    expect(jumpButton).toBeTruthy();

    await act(async () => {
      input!.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, '12');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(input!.value).toBe('12');

    await act(async () => {
      jumpButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(input!.value).toBe('12');
  });

  it('resets to the first page when a new keyed file is mounted', async () => {
    await act(async () => {
      renderer.root.render(<PdfToolbarHarness file={file} />);
    });

    const jumpButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Jump to page 4'),
    );

    expect(jumpButton).toBeTruthy();

    await act(async () => {
      jumpButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    let input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    expect(input?.value).toBe('4');

    await act(async () => {
      renderer.root.render(<PdfToolbarHarness file={secondFile} />);
    });

    input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    expect(input?.value).toBe('1');
  });

  it('includes the PDF parser failure detail in the visible load error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await act(async () => {
        renderer.root.render(<PdfLoadErrorHarness file={file} />);
      });

      const failButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('fail pdf load'),
      );

      await act(async () => {
        failButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(renderer.container.querySelector('[data-testid="pdf-load-error"]')?.textContent).toBe(
        'Failed to load PDF: Invalid xref table',
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preserves the current page when zooming in and out', async () => {
    await act(async () => {
      renderer.root.render(<PdfToolbarHarness file={file} />);
    });

    const jumpButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Jump to page 4'),
    );
    await act(async () => {
      jumpButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    let input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    expect(input?.value).toBe('4');

    const zoomInButton = renderer.container.querySelector('button[title="Zoom In"]');
    if (zoomInButton) {
      await act(async () => {
        zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    expect(input?.value).toBe('4');

    const zoomOutButton = renderer.container.querySelector('button[title="Zoom Out"]');
    if (zoomOutButton) {
      await act(async () => {
        zoomOutButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    input = renderer.container.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null;
    expect(input?.value).toBe('4');
  });
});
