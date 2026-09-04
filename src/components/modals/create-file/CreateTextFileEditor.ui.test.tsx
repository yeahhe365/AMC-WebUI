import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTextFileEditor } from './CreateTextFileEditor';

const createMarkdownPdfBlobMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/export/markdownPdf', () => ({
  createMarkdownPdfBlob: createMarkdownPdfBlobMock,
}));

const typeInto = (element: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const findButtonByText = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.trim() === text);

describe('CreateTextFileEditor UI', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  const renderEditor = async (props: Partial<React.ComponentProps<typeof CreateTextFileEditor>> = {}) => {
    await act(async () => {
      renderer.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          themeId="pearl"
          {...props}
        />,
      );
    });
  };

  beforeEach(() => {
    createMarkdownPdfBlobMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('frames the editor as a rounded sheet on desktop while staying fullscreen on mobile', async () => {
    await renderEditor();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const classes = dialog!.className.split(' ');
    expect(classes).toContain('w-full');
    expect(classes).toContain('h-full');
    expect(classes).toContain('sm:h-[90vh]');
    expect(classes).toContain('sm:w-[92vw]');
    expect(classes).toContain('sm:max-w-7xl');
    expect(classes).toContain('sm:rounded-xl');
    expect(classes).toContain('sm:shadow-2xl');
    expect(classes).not.toContain('max-w-none');
    expect(classes).not.toContain('shadow-none');
  });

  it('names the dialog after its heading', async () => {
    await renderEditor();

    const dialog = document.body.querySelector('[role="dialog"]')!;
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toBe('Create New File');
  });

  it('edits the filename in the header and keeps the footer as a pure action bar', async () => {
    await renderEditor();

    const header = document.body.querySelector('[data-create-file-header]');
    expect(header?.querySelector('input[placeholder="Filename"]')).toBeTruthy();

    const footer = document.body.querySelector('[data-create-file-footer]');
    expect(footer?.querySelector('input, select')).toBeNull();
    expect(footer?.textContent).toContain('Create File');
    expect(footer?.textContent).not.toContain('Add');
    expect(footer?.textContent).toContain('Ctrl+Enter');
  });

  it('asks before discarding unsaved edits on Escape', async () => {
    const onCancel = vi.fn();
    await renderEditor({ onCancel });

    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'draft content');
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Discard changes?');

    const discardButton = findButtonByText('Discard');
    expect(discardButton).toBeTruthy();
    await act(async () => {
      discardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes immediately on Escape when nothing changed', async () => {
    const onCancel = vi.fn();
    await renderEditor({ onCancel });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Discard changes?');
  });

  it('saves with Cmd+Enter from the content textarea and derives the filename', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, '# My Report\n\nBody');
    });
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toBe('# My Report\n\nBody');
    expect(onConfirm.mock.calls[0][1]).toBe('My Report.md');
  });

  it('ignores Cmd+Enter while an IME composition is active', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'composing text');
    });
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('saves with Ctrl+Enter from the filename input', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const input = document.body.querySelector<HTMLInputElement>('[data-create-file-header] input')!;
    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, 'hello');
      typeInto(input, 'notes');
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][1]).toBe('notes.md');
  });

  it('does not create an empty file from a filename-only draft', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const input = document.body.querySelector<HTMLInputElement>('[data-create-file-header] input')!;
    await act(async () => {
      typeInto(input, 'notes');
    });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Create File',
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).toBeDisabled();

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('still creates a file while a chat response is generating', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm, isLoading: true, isProcessing: true });

    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, '# Still works');
    });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Create File',
    );
    expect(saveButton).not.toBeDisabled();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][1]).toBe('Still works.md');
  });

  it('creates only one file when save is triggered twice', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const textarea = document.body.querySelector('textarea')!;
    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Create File',
    )!;

    await act(async () => {
      typeInto(textarea, 'once');
    });
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the selected extension even if the filename field already includes one', async () => {
    const onConfirm = vi.fn();
    await renderEditor({ onConfirm });

    const input = document.body.querySelector<HTMLInputElement>('[data-create-file-header] input')!;
    const textarea = document.body.querySelector('textarea')!;
    const select = document.body.querySelector('select')!;

    await act(async () => {
      typeInto(textarea, 'body');
      typeInto(input, 'notes.MD');
      select.value = '.txt';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(onConfirm).toHaveBeenCalledWith('body', 'notes.txt');
  });

  it('hints the derived filename in the empty filename field', async () => {
    await renderEditor();

    const input = document.body.querySelector<HTMLInputElement>('[data-create-file-header] input')!;
    expect(input.getAttribute('placeholder')).toBe('Filename');

    const textarea = document.body.querySelector('textarea')!;
    await act(async () => {
      typeInto(textarea, '# Quarterly Report');
    });

    expect(input.getAttribute('placeholder')).toBe('Quarterly Report');
  });

  it('uses the proportional font for prose types and monospace for code types', async () => {
    await renderEditor();

    const textarea = document.body.querySelector('textarea')!;
    expect(textarea.className).not.toContain('font-mono');

    const select = document.body.querySelector('select')!;
    await act(async () => {
      select.value = '.ts';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(textarea.className).toContain('font-mono');
  });

  it('caps the editor line width when no rich preview is available', async () => {
    await renderEditor();

    const select = document.body.querySelector('select')!;
    await act(async () => {
      select.value = '.txt';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const editorPane = document.body.querySelector('textarea')!.parentElement!;
    expect(editorPane.className).toContain('max-w-4xl');
    expect(editorPane.className).toContain('mx-auto');
  });

  it('does not clamp the extension selector width', async () => {
    await renderEditor();

    const select = document.body.querySelector('select')!;
    expect(select.className).not.toContain('max-w-[80px]');
  });

  it('surfaces PDF failures inline instead of a native alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    createMarkdownPdfBlobMock.mockRejectedValue(new Error('boom'));

    await renderEditor({ initialFilename: 'doc.pdf', initialContent: '# Doc' });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Save',
    );
    expect(saveButton).toBeTruthy();
    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Error generating PDF.');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
