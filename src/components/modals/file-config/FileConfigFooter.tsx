import React from 'react';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { useI18n } from '@/contexts/I18nContext';
import { Save } from 'lucide-react';

interface FileConfigFooterProps {
  onClose: () => void;
  onSave: () => void;
  /** Disables save while a field fails validation. */
  disabled?: boolean;
}

export const FileConfigFooter: React.FC<FileConfigFooterProps> = ({ onClose, onSave, disabled = false }) => {
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button
        onClick={onClose}
        className={`px-4 py-2 text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
      >
        {t('cancel')}
      </button>
      <button
        onClick={onSave}
        disabled={disabled}
        aria-disabled={disabled}
        className={`px-4 py-2 text-sm bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:bg-[var(--theme-bg-accent-hover)] rounded-lg transition-colors flex items-center gap-2 shadow-sm ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${
          disabled ? 'opacity-50 cursor-not-allowed hover:bg-[var(--theme-bg-accent)]' : ''
        }`}
      >
        <Save size={16} />
        {t('videoSettingsSave')}
      </button>
    </div>
  );
};
