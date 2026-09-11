import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationModal } from './ConfirmationModal';

describe('ConfirmationModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('renders title, description and calls onConfirm on confirmation', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      renderer.root.render(
        <ConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          title="Delete Session"
          message="Are you sure you want to delete this chat session?"
          confirmLabel="Delete Now"
          cancelLabel="Keep"
          isDanger={true}
        />,
      );
    });

    const alertdialog = document.querySelector('[role="alertdialog"]');
    expect(alertdialog).not.toBeNull();
    expect(document.body.textContent).toContain('Delete Session');
    expect(document.body.textContent).toContain('Are you sure you want to delete this chat session?');

    const dangerIcon = document.querySelector('[data-testid="confirmation-danger-icon"]');
    expect(dangerIcon).not.toBeNull();

    const confirmBtn = document.querySelector('button.bg-\\[var\\(--theme-bg-danger\\)\\]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn?.textContent).toContain('Delete Now');

    act(() => {
      fireEvent.click(confirmBtn!);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders info icon when isDanger is false and calls onClose on cancel', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      renderer.root.render(
        <ConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          title="Apply Template"
          message="This will overwrite current message draft."
          isDanger={false}
        />,
      );
    });

    const infoIcon = document.querySelector('[data-testid="confirmation-info-icon"]');
    expect(infoIcon).not.toBeNull();

    const cancelBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).not.toBeUndefined();

    act(() => {
      fireEvent.click(cancelBtn!);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
