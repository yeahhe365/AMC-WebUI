import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { dbService } from '@/services/db/dbService';
import { LibraryItemThumbnail } from './LibraryItemThumbnail';
import type { LibraryItem } from '@/types';
import {
  clearPdfThumbnailCache,
  writePdfThumbnailCache,
  getPdfThumbnailCacheKey,
} from '@/components/chat/input/files/pdfThumbnailCache';
import fs from 'fs';
import path from 'path';

describe('LibraryItemThumbnail', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  const mockPdfItem: LibraryItem = {
    id: 'test-pdf-1',
    name: 'document.pdf',
    type: 'application/pdf',
    size: 10240,
    timestamp: Date.now(),
    source: 'uploaded',
  };

  const mockImageItem: LibraryItem = {
    id: 'test-img-1',
    name: 'photo.jpg',
    type: 'image/jpeg',
    size: 2048,
    timestamp: Date.now(),
    source: 'uploaded',
    dataUrl: 'data:image/jpeg;base64,mockjpg',
  };

  const mockVideoItem: LibraryItem = {
    id: 'test-vid-1',
    name: 'video.mp4',
    type: 'video/mp4',
    size: 50000,
    timestamp: Date.now(),
    source: 'uploaded',
    dataUrl: 'blob:mockvideo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPdfThumbnailCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPdfThumbnailCache();
  });

  it('keeps react-pdf out of the eager LibraryItemThumbnail bundle', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './LibraryItemThumbnail.tsx'), 'utf8');

    expect(source).not.toContain("from 'react-pdf'");
    expect(source).toMatch(/lazy\(\(\)\s*=>\s*import\('@\/components\/chat\/input\/files\/PdfFileThumbnail'\)/);
  });

  it('renders image thumbnail for image items', () => {
    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockImageItem} size="md" />);
    });

    const img = screen.getByRole('img', { name: 'photo.jpg' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,mockjpg');
  });

  it('renders video player preview for video items', () => {
    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockVideoItem} size="lg" />);
    });

    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', 'blob:mockvideo#t=0.1');
  });

  it('avoids mounting video element for size="sm" to prevent hardware decoder saturation', () => {
    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockVideoItem} size="sm" />);
    });

    const video = document.querySelector('video');
    expect(video).toBeNull();
  });

  it('renders cached PDF thumbnail directly from pdfThumbnailCache', () => {
    const pdfWidth = 280; // size="full"
    const cacheKey = getPdfThumbnailCacheKey(mockPdfItem, pdfWidth);
    writePdfThumbnailCache(cacheKey, 'data:image/png;base64,mockpdfcachedimage');

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockPdfItem} size="full" />);
    });

    const img = screen.getByRole('img', { name: 'document.pdf' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,mockpdfcachedimage');
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('renders fallback PDF badge when no blob or cache exists and fetch returns null', async () => {
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(undefined);

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={mockPdfItem} size="sm" />);
      await Promise.resolve();
    });

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('loads blob from dbService and renders PDF thumbnail when item enters view', async () => {
    const mockBlob = new Blob(['%PDF-1.4 mock pdf content'], { type: 'application/pdf' });
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(mockBlob);

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={mockPdfItem} size="full" />);
      await Promise.resolve();
    });

    expect(dbService.fetchLibraryFileBlob).toHaveBeenCalledWith(mockPdfItem);
  });

  it('renders SVG thumbnail with SVG badge for svg files', () => {
    const mockSvgItem: LibraryItem = {
      id: 'test-svg-1',
      name: 'icon.svg',
      type: 'image/svg+xml',
      size: 1024,
      timestamp: Date.now(),
      source: 'uploaded',
      dataUrl: 'data:image/svg+xml;base64,mocksvg',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockSvgItem} size="lg" />);
    });

    const img = screen.getByRole('img', { name: 'icon.svg' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/svg+xml;base64,mocksvg');
    expect(screen.getByText('SVG')).toBeInTheDocument();
  });

  it('renders code snippet card with line numbers and syntax highlighting for code files', () => {
    const mockCodeItem: LibraryItem = {
      id: 'test-code-1',
      name: 'utils.ts',
      type: 'text/typescript',
      size: 512,
      timestamp: Date.now(),
      source: 'uploaded',
      textContent: 'const greeting = "hello";\nexport function test() {\n  return 42;\n}',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockCodeItem} size="lg" />);
    });

    expect(screen.getAllByText('TS').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('const')).toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders markdown snippet card for markdown files', () => {
    const mockMdItem: LibraryItem = {
      id: 'test-md-1',
      name: 'README.md',
      type: 'text/markdown',
      size: 256,
      timestamp: Date.now(),
      source: 'uploaded',
      textContent: '# Title\nIntroduction text here',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockMdItem} size="lg" />);
    });

    expect(screen.getAllByText('MD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('# Title')).toBeInTheDocument();
    expect(screen.getByText('Introduction')).toBeInTheDocument();
  });

  it('renders audio waveform card with badge and waveform visualization for audio items', () => {
    const mockAudioItem: LibraryItem = {
      id: 'test-audio-1',
      name: 'podcast.mp3',
      type: 'audio/mpeg',
      size: 1048576,
      timestamp: Date.now(),
      source: 'uploaded',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockAudioItem} size="lg" />);
    });

    expect(screen.getAllByText('MP3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('podcast.mp3')).toBeInTheDocument();
  });

  it('renders mini equalizer indicator for audio items at sm size', () => {
    const mockAudioItem: LibraryItem = {
      id: 'test-audio-2',
      name: 'sound.wav',
      type: 'audio/wav',
      size: 512000,
      timestamp: Date.now(),
      source: 'uploaded',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockAudioItem} size="sm" />);
    });

    const bars = document.querySelectorAll('span.rounded-full');
    expect(bars.length).toBe(4);
  });

  it('renders spreadsheet grid card with parsed cells for CSV files', () => {
    const mockCsvItem: LibraryItem = {
      id: 'test-csv-1',
      name: 'metrics.csv',
      type: 'text/csv',
      size: 1024,
      timestamp: Date.now(),
      source: 'uploaded',
      textContent: 'Metric,Q1,Q2,Q3\nRevenue,100,120,150\nCost,40,45,50',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockCsvItem} size="lg" />);
    });

    expect(screen.getAllByText('CSV').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('metrics.csv')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('renders compact spreadsheet badge for spreadsheet items at sm size', async () => {
    const mockSheetItem: LibraryItem = {
      id: 'test-sheet-1',
      name: 'data.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4096,
      timestamp: Date.now(),
      source: 'uploaded',
    };

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={mockSheetItem} size="sm" />);
      await Promise.resolve();
    });

    expect(screen.getByText('XLSX')).toBeInTheDocument();
  });

  it('recovers from image loading error by fetching blob from dbService', async () => {
    const mockBlob = new Blob(['recovered image data'], { type: 'image/jpeg' });
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(mockBlob);

    const brokenImageItem: LibraryItem = {
      id: 'broken-img-1',
      name: 'broken.jpg',
      type: 'image/jpeg',
      size: 100,
      timestamp: Date.now(),
      source: 'uploaded',
      dataUrl: 'blob:http://localhost/stale-url',
    };

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={brokenImageItem} size="md" />);
    });

    const img = screen.getByRole('img', { name: 'broken.jpg' });
    expect(img).toBeInTheDocument();

    // Trigger onError to simulate stale blob URL failure
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });

    expect(dbService.fetchLibraryFileBlob).toHaveBeenCalledWith(brokenImageItem);
    const updatedImg = screen.getByRole('img', { name: 'broken.jpg' });
    expect(updatedImg).toBeInTheDocument();
    expect(updatedImg.getAttribute('src')).not.toBe('blob:http://localhost/stale-url');
  });

  it('falls back to placeholder icon if fetchLibraryFileBlob returns undefined on image error', async () => {
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(undefined);

    const unrecoverableItem: LibraryItem = {
      id: 'unrecoverable-img-1',
      name: 'lost.jpg',
      type: 'image/jpeg',
      size: 100,
      timestamp: Date.now(),
      source: 'uploaded',
      dataUrl: 'blob:http://localhost/lost-url',
    };

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={unrecoverableItem} size="md" />);
    });

    const img = screen.getByRole('img', { name: 'lost.jpg' });

    // Trigger onError
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });

    expect(dbService.fetchLibraryFileBlob).toHaveBeenCalledWith(unrecoverableItem);
    // Image should be replaced by fallback placeholder
    expect(screen.queryByRole('img', { name: 'lost.jpg' })).not.toBeInTheDocument();
  });

  it('renders YouTube thumbnail with hqdefault cover and Play icon for YouTube items at lg size', () => {
    const mockYtItem: LibraryItem = {
      id: 'test-yt-1',
      name: 'youtube.com/watch?v=MkaZ4OrbQn8',
      type: 'video/youtube-link',
      size: 0,
      timestamp: Date.now(),
      source: 'uploaded',
      fileUri: 'https://www.youtube.com/watch?v=MkaZ4OrbQn8',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockYtItem} size="lg" />);
    });

    const ytContainer = document.querySelector('[data-thumbnail-kind="youtube"]');
    expect(ytContainer).toBeInTheDocument();

    const img = screen.getByRole('img', { name: 'youtube.com/watch?v=MkaZ4OrbQn8' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://img.youtube.com/vi/MkaZ4OrbQn8/hqdefault.jpg');
    expect(screen.getByText('YOUTUBE')).toBeInTheDocument();
  });

  it('renders YouTube thumbnail with mqdefault cover for YouTube items at sm size', () => {
    const mockYtItem: LibraryItem = {
      id: 'test-yt-2',
      name: 'Cool Video',
      type: 'video/youtube-link',
      size: 0,
      timestamp: Date.now(),
      source: 'uploaded',
      fileUri: 'https://youtu.be/dQw4w9WgXcQ',
    };

    act(() => {
      renderer.root.render(<LibraryItemThumbnail item={mockYtItem} size="sm" />);
    });

    const img = screen.getByRole('img', { name: 'Cool Video' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    // at sm size, "YOUTUBE" text badge is hidden to save space
    expect(screen.queryByText('YOUTUBE')).not.toBeInTheDocument();
  });

  it('falls back to YouTube placeholder if YouTube thumbnail fails to load', async () => {
    const mockYtItem: LibraryItem = {
      id: 'test-yt-3',
      name: 'https://youtube.com/watch?v=offline1234',
      type: 'video/youtube-link',
      size: 0,
      timestamp: Date.now(),
      source: 'uploaded',
    };

    await act(async () => {
      renderer.root.render(<LibraryItemThumbnail item={mockYtItem} size="md" />);
    });

    const img = screen.getByRole('img', { name: 'https://youtube.com/watch?v=offline1234' });
    expect(img).toBeInTheDocument();

    // Trigger image error (e.g. offline or CDN blocked)
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });

    // Thumbnail img should be removed, falling back to placeholder
    expect(screen.queryByRole('img', { name: 'https://youtube.com/watch?v=offline1234' })).not.toBeInTheDocument();
  });
});
