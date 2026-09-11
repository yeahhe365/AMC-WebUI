import { act, fireEvent, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import type { UploadedFile } from '@/types';
import { ZipViewer } from './ZipViewer';

const { generateZipContextMock } = vi.hoisted(() => ({
  generateZipContextMock: vi.fn(),
}));

vi.mock('@/utils/import-context/loaders', () => ({
  generateZipContext: generateZipContextMock,
  generateFolderContext: vi.fn(),
}));

describe('ZipViewer', () => {
  const renderer = setupProviderTestRenderer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createZipFile = async (files: Record<string, string>): Promise<UploadedFile> => {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const rawFile = new File([blob], 'project.zip', { type: 'application/zip' });

    return {
      id: 'zip-file-1',
      name: 'project.zip',
      type: 'application/zip',
      size: blob.size,
      rawFile,
    };
  };

  it('renders zip archive entries and allows inline text preview', async () => {
    const uploadedFile = await createZipFile({
      'README.md': '# Project Demo',
      'src/index.ts': 'export const app = 1;',
    });

    await act(async () => {
      renderer.render(<ZipViewer file={uploadedFile} />);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('README.md');
      expect(document.body.textContent).toContain('src/index.ts');
    });

    // Click on README.md to preview
    const readmeEntry = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'README.md');
    expect(readmeEntry).toBeDefined();

    await act(async () => {
      fireEvent.click(readmeEntry!);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('# Project Demo');
    });
  });

  it('filters out Zip Slip paths from entries view', async () => {
    const zip = new JSZip();
    zip.file('safe.ts', 'const x = 1;');

    const fakeUnsafeEntry = {
      name: '../evil.sh',
      dir: false,
      date: new Date(),
      async: vi.fn().mockResolvedValue(new Blob(['evil'])),
    };
    // @ts-expect-error test injection
    zip.files['../evil.sh'] = fakeUnsafeEntry;

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(zip);

    const uploadedFile: UploadedFile = {
      id: 'zip-unsafe',
      name: 'unsafe.zip',
      type: 'application/zip',
      size: 100,
      rawFile: new File(['fake'], 'unsafe.zip', { type: 'application/zip' }),
    };

    await act(async () => {
      renderer.render(<ZipViewer file={uploadedFile} />);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('safe.ts');
      expect(document.body.textContent).not.toContain('evil.sh');
    });
  });

  it('calls onConvertToContext when Convert to Context button is clicked', async () => {
    const uploadedFile = await createZipFile({
      'index.ts': 'console.log("hello");',
    });
    const fakeContextFile = new File(['context'], 'project-context-2026.txt', { type: 'text/plain' });
    generateZipContextMock.mockResolvedValueOnce(fakeContextFile);

    const onConvertToContext = vi.fn();

    await act(async () => {
      renderer.render(<ZipViewer file={uploadedFile} onConvertToContext={onConvertToContext} />);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('index.ts');
    });

    const convertBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('解析为项目上下文') || btn.textContent?.includes('Convert to Project Context'),
    );
    expect(convertBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(convertBtn!);
    });

    await waitFor(() => {
      expect(generateZipContextMock).toHaveBeenCalledTimes(1);
      expect(onConvertToContext).toHaveBeenCalledWith(fakeContextFile);
    });
  });

  it('shows translated notice when text file exceeds 5MB', async () => {
    const zip = new JSZip();
    const bigFileEntry = {
      name: 'large.txt',
      dir: false,
      date: new Date(),
      _data: { uncompressedSize: 6 * 1024 * 1024 },
      async: vi.fn(),
    };
    // @ts-expect-error test injection
    zip.files['large.txt'] = bigFileEntry;
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(zip);

    const uploadedFile: UploadedFile = {
      id: 'zip-large',
      name: 'large.zip',
      type: 'application/zip',
      size: 10 * 1024 * 1024,
      rawFile: new File(['fake'], 'large.zip', { type: 'application/zip' }),
    };

    await act(async () => {
      renderer.render(<ZipViewer file={uploadedFile} />);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('large.txt');
    });

    const entry = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'large.txt');
    await act(async () => {
      fireEvent.click(entry!);
    });

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/File size exceeds 5MB|文件大小超过 5MB/);
    });
  });

  it('uses full-height layout without pt-20 and allows toggling markdown preview/source mode', async () => {
    const uploadedFile = await createZipFile({
      'GUIDE.md': '# User Guide\nContent here',
    });

    await act(async () => {
      renderer.render(<ZipViewer file={uploadedFile} />);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('GUIDE.md');
    });

    // Verify outer container is full-height without pt-20 clearance
    const outerWrapper = document.querySelector('.w-full.h-full.flex.flex-col');
    expect(outerWrapper).not.toBeNull();
    expect(outerWrapper?.className).not.toContain('pt-20');

    const guideEntry = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'GUIDE.md');
    await act(async () => {
      fireEvent.click(guideEntry!);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('User Guide');
    });

    // Check toggle buttons for Markdown
    const sourceBtn = Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent?.includes('源码'));
    expect(sourceBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(sourceBtn!);
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('# User Guide');
    });
  });
});
