import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextEditorModal } from './TextEditorModal';

describe('TextEditorModal', () => {
  const renderer = setupTestRenderer({ providers: {} });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

    descriptor?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('commits edited text when the modal closes through the footer action', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(
        <TextEditorModal isOpen onClose={onClose} title="Editor" value="Original" onChange={onChange} />,
      );
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    await act(async () => {
      setTextareaValue(textarea!, 'Updated text');
    });

    const doneButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Close'),
    ) as HTMLButtonElement | undefined;

    expect(doneButton).toBeDefined();

    await act(async () => {
      doneButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('Updated text');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds visible keyboard focus styles to the close and confirm actions', async () => {
    await act(async () => {
      renderer.root.render(
        <TextEditorModal isOpen onClose={vi.fn()} title="Editor" value="Original" onChange={vi.fn()} />,
      );
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const closeButton = buttons[0];
    const doneButton = buttons.find((button) => button.textContent?.includes('Close'));

    expect(closeButton?.className).toContain('focus-visible:ring-2');
    expect(doneButton?.className).toContain('focus-visible:ring-2');
  });

  it('switches between edit and markdown preview modes', async () => {
    await act(async () => {
      renderer.root.render(
        <TextEditorModal
          isOpen
          onClose={vi.fn()}
          title="System Prompt"
          value="# Heading 1&#10;&#10;Line 2"
          onChange={vi.fn()}
        />,
      );
    });

    const previewButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Preview'),
    );
    expect(previewButton).toBeDefined();

    await act(async () => {
      previewButton!.click();
    });

    expect(document.body.querySelector('.markdown-body')).not.toBeNull();
    expect(document.body.querySelector('textarea')).toBeNull();

    const editButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Edit'),
    );
    await act(async () => {
      editButton!.click();
    });

    expect(document.body.querySelector('textarea')).not.toBeNull();
  });

  it('supports Ctrl+Enter keyboard shortcut to save and close', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(
        <TextEditorModal isOpen onClose={onClose} title="Editor" value="Initial" onChange={onChange} />,
      );
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(textarea, 'New Value');
    });

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('New Value');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
