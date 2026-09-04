import React from 'react';
import { Bot, Pencil } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface ModelSelectorHeaderProps {
  isEditingList: boolean;
  setIsEditingList: (value: boolean) => void;
}

export const ModelSelectorHeader: React.FC<ModelSelectorHeaderProps> = ({ isEditingList, setIsEditingList }) => {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] flex items-center gap-2">
        <Bot size={14} strokeWidth={1.5} /> {t('settingsManageModelsTitle')}
      </h4>

      {!isEditingList && (
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => setIsEditingList(true)}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors text-[var(--theme-text-link)] hover:bg-[var(--theme-bg-tertiary)]"
        >
          <Pencil size={12} />
          {t('settingsEditModelList')}
        </button>
      )}
    </div>
  );
};
