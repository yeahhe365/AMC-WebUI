import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/shared/AlertDialog';
import { AlertTriangle, Info } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDanger = false,
}) => {
  const { t } = useI18n();

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    const result = onConfirm();
    if (result instanceof Promise) {
      void result.then(() => {
        onClose();
      });
    } else {
      onClose();
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="p-0 max-w-md">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-2xl flex-shrink-0 transition-transform ${
                isDanger
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20'
                  : 'bg-[var(--theme-bg-accent)]/10 text-[var(--theme-bg-accent)] ring-1 ring-[var(--theme-bg-accent)]/20'
              }`}
              data-testid={isDanger ? 'confirmation-danger-icon' : 'confirmation-info-icon'}
            >
              {isDanger ? (
                <AlertTriangle size={24} strokeWidth={2.2} className="animate-pulse" />
              ) : (
                <Info size={24} strokeWidth={2.2} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-lg font-bold text-[var(--theme-text-primary)] mb-2 leading-tight">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{message}</div>
              </AlertDialogDescription>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-xl transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
            >
              {cancelLabel ?? t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-xl shadow-xs transition-all active:scale-[0.98] flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
                isDanger
                  ? 'bg-[var(--theme-bg-danger)] hover:bg-[var(--theme-bg-danger-hover)] shadow-rose-500/20'
                  : 'bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] shadow-indigo-500/20'
              }`}
            >
              {confirmLabel ?? t('confirm')}
            </button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
