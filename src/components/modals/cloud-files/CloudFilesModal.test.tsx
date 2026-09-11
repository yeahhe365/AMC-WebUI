import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CloudFilesModal } from './CloudFilesModal';
import * as fileApi from '@/services/api/fileApi';
import { FileState, type File as GeminiFile } from '@google/genai';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';

describe('CloudFilesModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });

  const mockFiles: GeminiFile[] = [
    {
      name: 'files/test-video-1',
      displayName: 'intro.mp4',
      mimeType: 'video/mp4',
      sizeBytes: '10485760', // 10 MB
      state: FileState.ACTIVE,
      expirationTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      videoMetadata: { videoDuration: '15.0s' },
    },
    {
      name: 'files/test-doc-2',
      displayName: 'document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '2097152', // 2 MB
      state: FileState.ACTIVE,
      expirationTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    },
    {
      name: 'files/test-img-3',
      displayName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: '524288', // 512 KB
      state: FileState.ACTIVE,
      expirationTime: new Date(Date.now() - 1000).toISOString(), // expired
    },
  ];

  const appSettingsWithKey = {
    ...DEFAULT_APP_SETTINGS,
    useCustomApiConfig: true,
    apiKey: 'mock-gemini-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fileApi, 'listFilesApi').mockResolvedValue({
      files: mockFiles,
      nextPageToken: undefined,
    });
    vi.spyOn(fileApi, 'deleteFileApi').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal with title, storage quota and file list', async () => {
    const onClose = vi.fn();
    const onAddFiles = vi.fn();

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={onClose}
          onAddFiles={onAddFiles}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Gemini 云端文件');
    expect(document.body.textContent).toContain('intro.mp4');
    expect(document.body.textContent).toContain('document.pdf');
    expect(document.body.textContent).toContain('photo.jpg');
    expect(document.body.textContent).toContain('15.0s');
    expect(document.body.textContent).toContain('云端存储已用');
  });

  it('filters files by category tabs', async () => {
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={onClose}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('intro.mp4');
    expect(document.body.textContent).toContain('document.pdf');

    // Click '视频' (Video) filter
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const videoBtn = buttons.find((b) => b.textContent === '视频');
    expect(videoBtn).toBeDefined();

    await act(async () => {
      videoBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('intro.mp4');
    expect(document.body.textContent).not.toContain('document.pdf');
  });

  it('selects files and triggers onAddFiles on confirmation', async () => {
    const onClose = vi.fn();
    const onAddFiles = vi.fn();

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={onClose}
          onAddFiles={onAddFiles}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    // Click on row for intro.mp4
    const rows = Array.from(document.body.querySelectorAll('tr'));
    const introRow = rows.find((r) => r.textContent?.includes('intro.mp4'));
    expect(introRow).toBeDefined();

    await act(async () => {
      introRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Click '添加到对话'
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.textContent?.includes('添加到对话'));
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onAddFiles).toHaveBeenCalledTimes(1);
    expect(onAddFiles).toHaveBeenCalledWith([mockFiles[0]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles quick direct add by ID or GCS URI', async () => {
    const onAddFileById = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={vi.fn()}
          onAddFileById={onAddFileById}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    const inputs = Array.from(document.body.querySelectorAll('input'));
    const directInput = inputs.find((i) => i.placeholder?.includes('files/'));
    expect(directInput).toBeDefined();

    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(directInput, 'gs://my-bucket/sample.mp4');
      directInput!.dispatchEvent(new Event('input', { bubbles: true }));
      directInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const verifyAddBtn = buttons.find((b) => b.textContent?.includes('校验并添加'));
    expect(verifyAddBtn).toBeDefined();

    await act(async () => {
      verifyAddBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onAddFileById).toHaveBeenCalledWith('gs://my-bucket/sample.mp4');
  });

  it('shows warning when no API key is available', async () => {
    const settingsWithoutKey = {
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: '',
    };

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={vi.fn()}
          appSettings={settingsWithoutKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('未检测到配置');
  });

  it('deletes file when clicking single delete button and confirming', async () => {
    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={vi.fn()}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    // Find delete button on the first file row
    const rows = Array.from(document.body.querySelectorAll('tr'));
    const introRow = rows.find((r) => r.textContent?.includes('intro.mp4'));
    const deleteBtn = introRow?.querySelector('button[title="删除"]');
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Confirm dialog should be visible
    expect(document.body.textContent).toContain('确定要从 Gemini 云端永久删除此文件吗');

    const confirmModalButtons = Array.from(document.body.querySelectorAll('button'));
    const confirmBtn = confirmModalButtons.find((b) => b.textContent === '确认' || b.textContent === '删除');
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fileApi.deleteFileApi).toHaveBeenCalledWith('mock-gemini-key', 'files/test-video-1');
  });

  it('batch deletes files when clicking select all and batch delete button', async () => {
    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={vi.fn()}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    // Select all files
    const selectAllCheckbox = document.body.querySelector('thead input[type="checkbox"]');
    expect(selectAllCheckbox).not.toBeNull();

    await act(async () => {
      selectAllCheckbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Click batch delete button in footer
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const batchDeleteBtn = buttons.find((b) => b.textContent?.includes('删除选中'));
    expect(batchDeleteBtn).toBeDefined();

    await act(async () => {
      batchDeleteBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // Confirm dialog should be visible
    expect(document.body.textContent).toContain('确定要从 Gemini 云端删除选中的');

    const confirmModalButtons = Array.from(document.body.querySelectorAll('button'));
    const confirmBtn = confirmModalButtons.find((b) => b.textContent === '确认' || b.textContent === '删除');
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fileApi.deleteFileApi).toHaveBeenCalledWith('mock-gemini-key', 'files/test-video-1');
    expect(fileApi.deleteFileApi).toHaveBeenCalledWith('mock-gemini-key', 'files/test-doc-2');
    expect(fileApi.deleteFileApi).toHaveBeenCalledWith('mock-gemini-key', 'files/test-img-3');
  });

  it('displays user-friendly card and error details toggle on 403 permission denied proxy error', async () => {
    const rawProxyError =
      '403 PERMISSION_DENIED: Proxy browser error: Google API returned error: 403 PERMISSION_DENIED {"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}';
    vi.spyOn(fileApi, 'listFilesApi').mockRejectedValueOnce(new Error(rawProxyError));

    await act(async () => {
      renderer.root.render(
        <CloudFilesModal
          isOpen
          onClose={vi.fn()}
          appSettings={appSettingsWithKey}
          currentChatSettings={DEFAULT_CHAT_SETTINGS}
        />,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('当前上游代理或接口不支持 Gemini Files API');
    expect(document.body.textContent).toContain('您仍可使用上方的输入框');
    expect(document.body.textContent).toContain('查看错误详情');
    expect(document.body.textContent).not.toContain(rawProxyError);

    // Click "查看错误详情" to toggle raw error display
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const toggleBtn = buttons.find((b) => b.textContent === '查看错误详情');
    expect(toggleBtn).toBeDefined();

    await act(async () => {
      toggleBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain(rawProxyError);
  });
});
