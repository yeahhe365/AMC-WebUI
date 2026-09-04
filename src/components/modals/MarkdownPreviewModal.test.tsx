import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploadedFile } from '@/test/data/factories';

const { mockMarkdownFileViewer, mockSettingsState } = vi.hoisted(() => ({
  mockMarkdownFileViewer: vi.fn(
    ({
      content,
      isEditable,
      onChange,
    }: {
      content?: string | null;
      isEditable?: boolean;
      onChange?: (value: string) => void;
    }) => (
      <div data-testid="markdown-file-viewer" data-editable={String(isEditable)}>
        <span data-testid="viewer-content">{content ?? 'loaded markdown'}</span>
        {isEditable && (
          <button type="button" onClick={() => onChange?.('changed markdown')}>
            change content
          </button>
        )}
      </div>
    ),
  ),
  mockSettingsState: {
    language: 'en',
    currentTheme: { id: 'pearl' },
  },
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) => selector(mockSettingsState),
}));

vi.mock('@/components/shared/file-preview/MarkdownFileViewer', () => ({
  MarkdownFileViewer: mockMarkdownFileViewer,
}));

vi.mock('@/utils/export/core', () => ({
  triggerDownload: vi.fn(),
}));

import { MarkdownPreviewModal } from './MarkdownPreviewModal';

describe('MarkdownPreviewModal', () => {
  const renderer = setupProviderTestRenderer();

  const createMarkdownFile = () =>
    createUploadedFile({
      id: 'md-1',
      name: 'notes.md',
      type: 'text/markdown',
      size: 128,
      textContent: '# Original',
    });

  const renderModal = (onClose: () => void) => {
    act(() => {
      renderer.root.render(
        <MarkdownPreviewModal file={createMarkdownFile()} onClose={onClose} onSaveText={vi.fn()} initialEditMode />,
      );
    });
  };

  const makeDirty = () => {
    const changeButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('change content'),
    );
    expect(changeButton).toBeDefined();
    act(() => {
      changeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const findDialogButton = (label: string) =>
    Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.trim() === label);

  const findTitledButton = (title: string) =>
    Array.from(document.body.querySelectorAll('button')).find((button) => button.getAttribute('title') === title);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks before discarding unsaved markdown edits when leaving edit mode', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    makeDirty();

    const cancelEditButton = findTitledButton('Cancel Edit');
    expect(cancelEditButton).toBeDefined();
    act(() => {
      cancelEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(findDialogButton('Discard')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockMarkdownFileViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ isEditable: true, content: 'changed markdown' }),
      expect.anything(),
    );

    act(() => {
      findDialogButton('Discard')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockMarkdownFileViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ isEditable: false }),
      expect.anything(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps edits when the discard prompt is cancelled', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    makeDirty();

    act(() => {
      findTitledButton('Cancel Edit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const discardDialog = Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]')).find((dialog) =>
      dialog.textContent?.includes('Discard unsaved changes?'),
    );
    expect(discardDialog).toBeTruthy();
    act(() => {
      findDialogButton('Cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      discardDialog?.dispatchEvent(new Event('animationend', { bubbles: true }));
    });

    expect(findDialogButton('Discard')).toBeUndefined();
    expect(mockMarkdownFileViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ isEditable: true, content: 'changed markdown' }),
      expect.anything(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before closing the preview with unsaved edits via Escape', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    makeDirty();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(findDialogButton('Discard')).toBeTruthy();

    act(() => {
      findDialogButton('Discard')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
