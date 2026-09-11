import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useChatStore } from '@/stores/chatStore';
import { LibraryPickerModal } from './LibraryPickerModal';
import { dbService } from '@/services/db/dbService';
import type { LibraryItem } from '@/types';

describe('LibraryPickerModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });
  setupStoreStateReset();

  const mockItems: LibraryItem[] = [
    {
      id: 'item-1',
      name: 'diagram.png',
      type: 'image/png',
      size: 1024,
      timestamp: 1700000000000,
      source: 'uploaded',
      isStandalone: true,
    },
    {
      id: 'item-2',
      name: 'notes.pdf',
      type: 'application/pdf',
      size: 2048,
      timestamp: 1700000001000,
      source: 'uploaded',
      isStandalone: true,
    },
    {
      id: 'item-3',
      name: 'voice.wav',
      type: 'audio/wav',
      size: 4096,
      timestamp: 1700000002000,
      source: 'uploaded',
      isStandalone: true,
    },
    {
      id: 'item-4',
      name: 'clip.mp4',
      type: 'video/mp4',
      size: 8192,
      timestamp: 1700000003000,
      source: 'generated',
      isStandalone: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(dbService, 'getStandaloneLibraryFiles').mockResolvedValue(mockItems);
    vi.spyOn(dbService, 'getAllHistoricalSessionFiles').mockResolvedValue([]);
    vi.spyOn(dbService, 'getDeletedLibraryFileIds').mockResolvedValue([]);
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(new Blob(['test']));
    useChatStore.setState({ savedSessions: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal header, search input, and library items', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    const searchInput = document.body.querySelector('input[type="text"]');
    expect(searchInput).not.toBeNull();

    expect(document.body.textContent).toContain('diagram.png');
    expect(document.body.textContent).toContain('notes.pdf');
  });

  it('filters items by category tab', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('diagram.png');
    expect(document.body.textContent).toContain('notes.pdf');

    // Click images tab
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const imagesTab = buttons.find((b) => b.textContent?.includes('图片') || b.textContent?.includes('Images'));
    expect(imagesTab).toBeDefined();

    await act(async () => {
      imagesTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('diagram.png');
    expect(document.body.textContent).not.toContain('notes.pdf');
  });

  it('selects item and confirms import', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    // Click on the first item to select it
    const card = Array.from(document.body.querySelectorAll('div')).find(
      (el) => el.textContent?.includes('diagram.png') && el.classList.contains('cursor-pointer'),
    );
    expect(card).toBeDefined();

    await act(async () => {
      card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Find and click the confirm button
    const confirmButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) =>
        (b.textContent?.includes('添加') || b.textContent?.toLowerCase().includes('add')) &&
        !b.hasAttribute('disabled'),
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledWith([mockItems[0]]);
    expect(onClose).toHaveBeenCalled();
  });

  it('double clicking an item triggers instant import', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    const card = Array.from(document.body.querySelectorAll('div')).find(
      (el) => el.textContent?.includes('notes.pdf') && el.classList.contains('cursor-pointer'),
    );
    expect(card).toBeDefined();

    await act(async () => {
      card!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledWith([mockItems[1]]);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters items by audio and video tabs', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    // Verify all 4 items visible initially
    expect(document.body.textContent).toContain('voice.wav');
    expect(document.body.textContent).toContain('clip.mp4');

    // Click audio tab
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const audioTab = buttons.find((b) => b.textContent?.includes('音频') || b.textContent?.includes('Audio'));
    expect(audioTab).toBeDefined();

    await act(async () => {
      audioTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('voice.wav');
    expect(document.body.textContent).not.toContain('diagram.png');
    expect(document.body.textContent).not.toContain('clip.mp4');

    // Click video tab
    const videoTab = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('视频') || b.textContent?.includes('Video'),
    );
    expect(videoTab).toBeDefined();

    await act(async () => {
      videoTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('clip.mp4');
    expect(document.body.textContent).not.toContain('voice.wav');
    expect(document.body.textContent).not.toContain('diagram.png');
  });

  it('toggles filter menu and filters by source', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('diagram.png');
    });

    // Find filter button (has SlidersHorizontal)
    const filterBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) =>
        b.getAttribute('title')?.includes('排序') ||
        b.getAttribute('aria-label')?.includes('排序') ||
        b.getAttribute('title')?.toLowerCase().includes('sort'),
    );
    expect(filterBtn).toBeDefined();

    // Click to open filter menu
    act(() => {
      fireEvent.click(filterBtn!);
    });

    // Select generated source (AI生成)
    let generatedBtn: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      generatedBtn = Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('已生成') || b.textContent?.includes('Generated'),
      );
      expect(generatedBtn).toBeDefined();
    });

    act(() => {
      fireEvent.click(generatedBtn!);
    });

    // clip.mp4 is generated, others are uploaded
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('clip.mp4');
      expect(document.body.textContent).not.toContain('diagram.png');
      expect(document.body.textContent).not.toContain('voice.wav');
    });
  });

  it('renders upload button and triggers file input', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    const uploadBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('上传') || b.textContent?.toLowerCase().includes('upload'),
    );
    expect(uploadBtn).toBeDefined();

    const fileInput = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const clickSpy = vi.spyOn(fileInput, 'click');
    await act(async () => {
      uploadBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('prefilters to audio when initialCategory="audio"', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(
        <LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} initialCategory="audio" />,
      );
      await Promise.resolve();
    });

    // voice.wav should be visible, while diagram.png and notes.pdf should not
    expect(document.body.textContent).toContain('voice.wav');
    expect(document.body.textContent).not.toContain('diagram.png');
    expect(document.body.textContent).not.toContain('notes.pdf');
  });

  it('excludes deleted files recorded in tombstones', async () => {
    vi.spyOn(dbService, 'getDeletedLibraryFileIds').mockResolvedValue(['item-1', 'item-3']);
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryPickerModal isOpen onClose={onClose} onConfirm={onConfirm} />);
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain('diagram.png');
    expect(document.body.textContent).not.toContain('voice.wav');
    expect(document.body.textContent).toContain('notes.pdf');
    expect(document.body.textContent).toContain('clip.mp4');
  });
});
