import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Save, FilePlus, Loader2 } from 'lucide-react';
import { SETTINGS_KBD_KEY_CLASS } from '@/constants/designTokens';

interface CreateFileFooterProps {
  onSave: () => void;
  isEditing: boolean;
  isExportingPdf: boolean;
  canSave: boolean;
  shortcutHint: string;
  pdfError: string | null;
}

export const CreateFileFooter: React.FC<CreateFileFooterProps> = ({
  onSave,
  isEditing,
  isExportingPdf,
  canSave,
  shortcutHint,
  pdfError,
}) => {
  const { t } = useI18n();
  return (
    <div
      data-create-file-footer
      className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--theme-bg-secondary)]/50 flex-shrink-0"
    >
      {pdfError ? (
        <p role="alert" className="min-w-0 flex-1 truncate text-xs text-[var(--theme-icon-error)]">
          {pdfError}
        </p>
      ) : (
        <span className="min-w-0 flex-1" />
      )}

      <div className="flex items-center gap-3 flex-shrink-0">
        <kbd aria-hidden="true" className={`hidden lg:inline-block ${SETTINGS_KBD_KEY_CLASS}`}>
          {shortcutHint}
        </kbd>

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || isExportingPdf}
          className="h-9 px-3 sm:px-4 text-sm font-medium bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-[var(--theme-text-accent)] rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap flex-shrink-0"
          title={isEditing ? t('save') : t('createTextCreateButton')}
        >
          {isExportingPdf ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isEditing ? (
            <Save size={16} strokeWidth={2} />
          ) : (
            <FilePlus size={16} strokeWidth={2} />
          )}
          <span>{isEditing ? t('save') : t('createTextCreateButton')}</span>
        </button>
      </div>
    </div>
  );
};
