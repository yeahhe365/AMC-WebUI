import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as useDeviceModule from '@/hooks/useDevice';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { ChatInputActionsContext } from './ChatInputContext';
import { AttachmentMenu } from './AttachmentMenu';
import { createChatInputActionsContextValue } from '@/test/chat-input/contextFixtures';

describe('AttachmentMenu', () => {
  const renderer = setupProviderTestRenderer();

  it('hides audio recorder option for Gemma models', () => {
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemma-4-31b-it',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const itemLabels = menuItems.map((b) => b.textContent ?? '');
    // In zh it's "录音", in en it's "Record Audio"
    const hasRecorder = itemLabels.some((text) => text.includes('录音') || text.toLowerCase().includes('record'));
    expect(hasRecorder).toBe(false);
  });

  it('shows audio recorder option for Gemini text models', () => {
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const itemLabels = menuItems.map((b) => b.textContent ?? '');
    const hasRecorder = itemLabels.some((text) => text.includes('录音') || text.toLowerCase().includes('record'));
    expect(hasRecorder).toBe(true);
  });

  it('shows library option and triggers library action when clicked', () => {
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const libraryBtn = menuItems.find(
      (b) =>
        b.textContent?.includes('从资料库添加') ||
        b.textContent?.toLowerCase().includes('library') ||
        b.textContent?.includes('资料库') ||
        b.textContent?.includes('資料庫'),
    );
    expect(libraryBtn).toBeDefined();

    act(() => {
      libraryBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(value.onAttachmentAction).toHaveBeenCalledWith('library');
  });

  it('renders cloud icon for add by id option and triggers id action when clicked', () => {
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const addByIdBtn = menuItems.find(
      (b) => b.textContent?.includes('通过文件 ID 添加') || b.textContent?.toLowerCase().includes('id'),
    );
    expect(addByIdBtn).toBeDefined();
    expect(addByIdBtn?.querySelector('svg.lucide-cloud')).not.toBeNull();

    act(() => {
      addByIdBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(value.onAttachmentAction).toHaveBeenCalledWith('id');
  });

  it('merges folder and zip import into a single menu item and triggers folder action when clicked', () => {
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));

    // Merged item should exist
    const mergedBtn = menuItems.find(
      (b) => b.textContent?.includes('文件夹 / Zip') || b.textContent?.includes('Folder / Zip'),
    );
    expect(mergedBtn).toBeDefined();

    // Separate "导入 Zip（转为文本）" should NOT exist
    const separateZipBtn = menuItems.find(
      (b) =>
        (b.textContent?.includes('导入 Zip') || b.textContent?.includes('Import Zip')) &&
        !b.textContent?.includes('文件夹') &&
        !b.textContent?.includes('Folder'),
    );
    expect(separateZipBtn).toBeUndefined();

    act(() => {
      mergedBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(value.onAttachmentAction).toHaveBeenCalledWith('folder');
  });

  it('hides camera and gallery options on desktop', () => {
    vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(false);
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const itemLabels = menuItems.map((b) => b.textContent ?? '');
    const hasCamera = itemLabels.some(
      (text) => text.includes('拍照') || text.toLowerCase().includes('photo') || text.toLowerCase().includes('camera'),
    );
    const hasGallery = itemLabels.some((text) => text.includes('图库') || text.toLowerCase().includes('gallery'));
    const hasScreenshot = itemLabels.some(
      (text) => text.includes('屏幕截图') || text.toLowerCase().includes('screenshot'),
    );
    expect(hasCamera).toBe(false);
    expect(hasGallery).toBe(false);
    expect(hasScreenshot).toBe(true);
  });

  it('shows camera and gallery options and hides screenshot on mobile, and triggers actions when clicked', () => {
    vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(true);
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const itemLabels = menuItems.map((b) => b.textContent ?? '');
    const hasScreenshot = itemLabels.some(
      (text) => text.includes('屏幕截图') || text.toLowerCase().includes('screenshot'),
    );
    expect(hasScreenshot).toBe(false);

    const cameraBtn = menuItems.find(
      (b) =>
        b.textContent?.includes('拍照') ||
        b.textContent?.toLowerCase().includes('photo') ||
        b.textContent?.toLowerCase().includes('camera'),
    );
    const galleryBtn = menuItems.find(
      (b) => b.textContent?.includes('图库') || b.textContent?.toLowerCase().includes('gallery'),
    );
    expect(cameraBtn).toBeDefined();
    expect(galleryBtn).toBeDefined();

    act(() => {
      cameraBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(value.onAttachmentAction).toHaveBeenCalledWith('camera');

    // Reopen menu to test gallery click
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const reopenedMenuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const reopenedGalleryBtn = reopenedMenuItems.find(
      (b) => b.textContent?.includes('图库') || b.textContent?.toLowerCase().includes('gallery'),
    );
    expect(reopenedGalleryBtn).toBeDefined();

    act(() => {
      reopenedGalleryBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(value.onAttachmentAction).toHaveBeenCalledWith('gallery');
  });

  it('shows Import Zip directly instead of Folder on mobile, and triggers zip action', () => {
    vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(true);
    const value = createChatInputActionsContextValue({
      currentModelId: 'gemini-3.7-flash',
    });

    act(() => {
      renderer.render(
        <ChatInputActionsContext.Provider value={value}>
          <AttachmentMenu />
        </ChatInputActionsContext.Provider>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    const folderBtn = menuItems.find((b) => b.textContent?.includes('导入文件夹') || b.textContent?.includes('Folder'));
    const zipBtn = menuItems.find((b) => b.textContent?.includes('导入 Zip') || b.textContent?.includes('Import Zip'));

    expect(folderBtn).toBeUndefined();
    expect(zipBtn).toBeDefined();

    act(() => {
      zipBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(value.onAttachmentAction).toHaveBeenCalledWith('zip');
  });
});
