import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { ExportDialogShell } from './ExportDialogShell';
import { ExportOptions } from './ExportOptions';
import { type ExportType } from './useMessageExport';
import { interpolate } from '@/i18n/interpolate';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (type: ExportType) => void;
  exportingType: ExportType | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onExport, exportingType }) => {
  const { t } = useI18n();
  const isBusy = exportingType !== null;

  return (
    <ExportDialogShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="export-message-title"
      title={t('exportMessageDialogTitle')}
      closeAria={t('exportCloseDialogAria')}
      isBusy={isBusy}
      busyTitle={interpolate(t('exportingTitle'), { type: (exportingType ?? '').toUpperCase() })}
      busyHint={t('exportProcessingMessageContent')}
    >
      <ExportOptions onExport={onExport} />
    </ExportDialogShell>
  );
};
