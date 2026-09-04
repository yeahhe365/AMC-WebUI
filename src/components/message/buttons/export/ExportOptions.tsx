import React from 'react';
import { type ExportType } from './useMessageExport';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_VALUE_BADGE_CLASS } from '@/constants/designTokens';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';

interface ExportOptionsProps {
  onExport: (type: ExportType) => void;
  variant?: 'message' | 'chat';
}

export const ExportOptions: React.FC<ExportOptionsProps> = ({ onExport, variant = 'message' }) => {
  const { t } = useI18n();

  const descriptions = {
    message: {
      png: t('exportOptionMessagePngDesc'),
      html: t('exportOptionMessageHtmlDesc'),
      txt: t('exportOptionMessageTxtDesc'),
      json: t('exportOptionMessageJsonDesc'),
    },
    chat: {
      png: t('exportOptionChatPngDesc'),
      html: t('exportOptionChatHtmlDesc'),
      txt: t('exportOptionChatTxtDesc'),
      json: t('exportOptionChatJsonDesc'),
    },
  };

  const currentDesc = descriptions[variant];

  const options = [
    { id: 'png' as const, label: t('exportOptionPngLabel'), desc: currentDesc.png },
    { id: 'html' as const, label: t('exportOptionHtmlLabel'), desc: currentDesc.html },
    { id: 'txt' as const, label: t('exportOptionTxtLabel'), desc: currentDesc.txt },
    { id: 'json' as const, label: t('exportOptionJsonLabel'), desc: currentDesc.json },
  ];

  return (
    <ul className="flex flex-col p-1">
      {options.map((exportOption) => (
        <li key={exportOption.id}>
          <button
            type="button"
            onClick={() => onExport(exportOption.id)}
            aria-label={`${exportOption.label}. ${exportOption.desc}`}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--theme-bg-tertiary)]/70 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
          >
            <span className={`${SETTINGS_VALUE_BADGE_CLASS} inline-flex w-12 shrink-0 justify-center`}>
              {exportOption.id.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--theme-text-primary)]">
              {exportOption.desc}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
