import React from 'react';
import { Modal } from '@/components/shared/Modal';
import { FolderOpen, X } from 'lucide-react';
import { IconZip } from '@/components/icons';
import { useI18n } from '@/contexts/I18nContext';

export interface FolderZipImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: () => void;
  onSelectZip: () => void;
}

export const FolderZipImportModal: React.FC<FolderZipImportModalProps> = ({
  isOpen,
  onClose,
  onSelectFolder,
  onSelectZip,
}) => {
  const { t } = useI18n();

  const handleFolder = () => {
    onClose();
    onSelectFolder();
  };

  const handleZip = () => {
    onClose();
    onSelectZip();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="bg-[var(--theme-bg-primary)] rounded-2xl shadow-2xl w-full max-w-lg border border-[var(--theme-border-primary)] overflow-hidden"
      noPadding
      ariaLabel={t('folderZipModalTitle')}
    >
      <div className="p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--theme-border-secondary)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--theme-bg-accent)]/10 text-[var(--theme-bg-accent)] flex items-center justify-center">
              <FolderOpen size={22} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--theme-text-primary)] leading-tight">
                {t('folderZipModalTitle')}
              </h3>
              <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('folderZipModalDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-5">
          <button
            type="button"
            onClick={handleFolder}
            className="flex flex-col items-start p-4 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] transition-all text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
          >
            <div className="p-2.5 rounded-lg bg-[var(--theme-bg-accent)]/10 text-[var(--theme-bg-accent)] mb-3 group-hover:scale-105 transition-transform">
              <FolderOpen size={24} />
            </div>
            <span className="text-sm font-semibold text-[var(--theme-text-primary)] mb-1">
              {t('folderZipModalFolderOption')}
            </span>
            <span className="text-xs text-[var(--theme-text-secondary)] leading-relaxed">
              {t('folderZipModalFolderDesc')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleZip}
            className="flex flex-col items-start p-4 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] transition-all text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
          >
            <div className="p-2.5 rounded-lg bg-[var(--theme-bg-accent)]/10 text-[var(--theme-bg-accent)] mb-3 group-hover:scale-105 transition-transform">
              <IconZip size={24} />
            </div>
            <span className="text-sm font-semibold text-[var(--theme-text-primary)] mb-1">
              {t('folderZipModalZipOption')}
            </span>
            <span className="text-xs text-[var(--theme-text-secondary)] leading-relaxed">
              {t('folderZipModalZipDesc')}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
