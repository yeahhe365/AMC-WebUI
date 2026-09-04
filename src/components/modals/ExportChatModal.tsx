import React from 'react';
import { ExportDialogShell } from '@/components/message/buttons/export/ExportDialogShell';
import { ExportOptions } from '@/components/message/buttons/export/ExportOptions';
import { type ExportType } from '@/components/message/buttons/export/useMessageExport';
import { useI18n } from '@/contexts/I18nContext';

interface ExportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportType) => void;
  exportStatus: 'idle' | 'exporting';
}

export const ExportChatModal: React.FC<ExportChatModalProps> = ({ isOpen, onClose, onExport, exportStatus }) => {
  const { t } = useI18n();
  const isBusy = exportStatus === 'exporting';

  return (
    <ExportDialogShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="export-chat-title"
      title={t('exportChatTitle')}
      closeAria={t('exportCloseDialogAria')}
      isBusy={isBusy}
      busyTitle={t('exportConversationLoading')}
      busyHint={t('exportConversationWaitHint')}
    >
      <ExportOptions onExport={onExport} variant="chat" />
    </ExportDialogShell>
  );
};
