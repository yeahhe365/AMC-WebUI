import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';

const EXPORT_DIALOG_CONTENT_CLASS =
  'w-full max-w-sm overflow-hidden rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] shadow-premium';

interface ExportDialogShellProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  closeAria: string;
  isBusy: boolean;
  busyTitle: string;
  busyHint: string;
  children: React.ReactNode;
}

export const ExportDialogShell: React.FC<ExportDialogShellProps> = ({
  isOpen,
  onClose,
  titleId,
  title,
  closeAria,
  isBusy,
  busyTitle,
  busyHint,
  children,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={() => {
      if (!isBusy) onClose();
    }}
    noPadding
    ariaLabelledBy={titleId}
    contentClassName={EXPORT_DIALOG_CONTENT_CLASS}
  >
    <div className="flex items-center justify-between border-b border-[var(--theme-border-secondary)]/60 px-3.5 py-2.5">
      <h2 id={titleId} className="text-sm font-semibold text-[var(--theme-text-primary)]">
        {title}
      </h2>
      <button
        onClick={onClose}
        disabled={isBusy}
        className={`${MODAL_CLOSE_BUTTON_CLASS} disabled:opacity-50`}
        aria-label={closeAria}
      >
        <X size={16} />
      </button>
    </div>

    {isBusy ? (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-[var(--theme-text-secondary)]">
        <Loader2 size={20} className="mb-3 animate-spin text-[var(--theme-text-tertiary)]" />
        <p className="text-sm font-medium">{busyTitle}</p>
        <p className="mt-1 text-xs text-[var(--theme-text-tertiary)]">{busyHint}</p>
      </div>
    ) : (
      children
    )}
  </Modal>
);
