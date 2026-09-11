import React, { useState } from 'react';
import { Download, KeyRound, Share2, Upload, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/shared/Dialog';
import {
  MODAL_CLOSE_BUTTON_CLASS,
  SETTINGS_OUTLINE_BUTTON_CLASS,
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import type { ThirdPartyConnection } from '@/types';
import type { ImportMode } from '@/utils/thirdPartyBackup';
import { interpolate } from '@/i18n/interpolate';

export type ThirdPartyBackupDialogMode = 'export' | 'import-confirm';

interface ThirdPartyBackupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dialogMode: ThirdPartyBackupDialogMode;
  connectionsCount?: number;
  importedConnections?: ThirdPartyConnection[];
  onConfirmExport?: (includeApiKeys: boolean) => void;
  onConfirmImport?: (mode: ImportMode) => void;
}

export const ThirdPartyBackupDialog: React.FC<ThirdPartyBackupDialogProps> = ({
  isOpen,
  onClose,
  dialogMode,
  connectionsCount = 0,
  importedConnections = [],
  onConfirmExport,
  onConfirmImport,
}) => {
  const { t } = useI18n();
  const [includeApiKeys, setIncludeApiKeys] = useState(true);
  const [importMode, setImportMode] = useState<ImportMode>('merge');

  const handleExport = () => {
    onConfirmExport?.(includeApiKeys);
    onClose();
  };

  const handleImport = () => {
    onConfirmImport?.(importMode);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-[var(--theme-border-secondary)]">
          <DialogTitle className="text-base font-semibold text-[var(--theme-text-primary)]">
            {dialogMode === 'export' ? t('thirdPartyExportDialogTitle') : t('thirdPartyImportDialogTitle')}
          </DialogTitle>
          <button type="button" onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS} aria-label={t('close')}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {dialogMode === 'export' ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--theme-text-secondary)]">{t('thirdPartyExportDialogDesc')}</p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIncludeApiKeys(true)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                  includeApiKeys
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-tertiary)]/40 ring-1 ring-[var(--theme-border-focus)]'
                    : 'border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)]/20'
                }`}
              >
                <div className="mt-0.5 flex-shrink-0 text-[var(--theme-text-success)]">
                  <KeyRound size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--theme-text-primary)]">
                    {t('thirdPartyExportFull')}
                  </div>
                  <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">
                    {t('thirdPartyExportFullDesc')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIncludeApiKeys(false)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                  !includeApiKeys
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-tertiary)]/40 ring-1 ring-[var(--theme-border-focus)]'
                    : 'border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)]/20'
                }`}
              >
                <div className="mt-0.5 flex-shrink-0 text-[var(--theme-text-accent)]">
                  <Share2 size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--theme-text-primary)]">
                    {t('thirdPartyExportSanitized')}
                  </div>
                  <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">
                    {t('thirdPartyExportSanitizedDesc')}
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className={SETTINGS_OUTLINE_BUTTON_CLASS}>
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={connectionsCount === 0}
                className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
              >
                <Download size={14} />
                {t('thirdPartyExport')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--theme-text-secondary)]">
              {interpolate(t('thirdPartyImportSummary'), { count: importedConnections.length })}
            </p>

            {importedConnections.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-md border border-[var(--theme-border-secondary)] p-2 bg-[var(--theme-bg-tertiary)]/20 flex flex-wrap gap-1.5">
                {importedConnections.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)]"
                  >
                    {c.name || c.modelId}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  importMode === 'merge'
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-tertiary)]/40 ring-1 ring-[var(--theme-border-focus)]'
                    : 'border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)]/20'
                }`}
              >
                <div className="text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('thirdPartyImportModeMerge')}
                </div>
                <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">
                  {t('thirdPartyImportModeMergeDesc')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('overwrite')}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  importMode === 'overwrite'
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-tertiary)]/40 ring-1 ring-[var(--theme-border-focus)]'
                    : 'border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)]/20'
                }`}
              >
                <div className="text-sm font-medium text-[var(--theme-text-danger)]">
                  {t('thirdPartyImportModeOverwrite')}
                </div>
                <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">
                  {t('thirdPartyImportModeOverwriteDesc')}
                </div>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className={SETTINGS_OUTLINE_BUTTON_CLASS}>
                {t('cancel')}
              </button>
              <button type="button" onClick={handleImport} className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}>
                <Upload size={14} />
                {t('thirdPartyImport')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
