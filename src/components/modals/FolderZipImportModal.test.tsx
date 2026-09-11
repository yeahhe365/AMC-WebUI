import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { FolderZipImportModal } from './FolderZipImportModal';

describe('FolderZipImportModal', () => {
  const renderer = setupProviderTestRenderer();

  it('renders modal options and triggers respective callbacks on click', () => {
    const onSelectFolder = vi.fn();
    const onSelectZip = vi.fn();
    const onClose = vi.fn();

    act(() => {
      renderer.render(
        <FolderZipImportModal
          isOpen={true}
          onClose={onClose}
          onSelectFolder={onSelectFolder}
          onSelectZip={onSelectZip}
        />,
      );
    });

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const folderBtn = buttons.find(
      (b) => b.textContent?.includes('导入文件夹') || b.textContent?.includes('Import Folder'),
    );
    const zipBtn = buttons.find((b) => b.textContent?.includes('导入 Zip') || b.textContent?.includes('Import Zip'));

    expect(folderBtn).toBeDefined();
    expect(zipBtn).toBeDefined();

    act(() => {
      fireEvent.click(folderBtn!);
    });
    expect(onSelectFolder).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(zipBtn!);
    });
    expect(onSelectZip).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
