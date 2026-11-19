import { useI18n } from '@/contexts/I18nContext';
import { GEMINI_PROVIDER_ID, type ChatProviderId } from '@/types';
import { normalizeModelId } from '@/utils/model/modelId';

interface LegacyGeminiMigrationProps {
  modelId: string;
  isGemini: boolean;
  disabled?: boolean;
  onSelectModel: (modelId: string, providerId?: ChatProviderId) => void;
}

export const LegacyGeminiMigration = ({ modelId, isGemini, disabled, onSelectModel }: LegacyGeminiMigrationProps) => {
  const { t } = useI18n();
  const replacements: Record<string, string> = {
    'gemini-2.5-pro': 'gemini-3.8-flash',
    'gemini-2.5-flash': 'gemini-3.5-flash-lite',
  };
  const replacement = isGemini ? replacements[normalizeModelId(modelId)] : undefined;
  if (!replacement) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-2 text-sm bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]"
    >
      <span>{t('legacyGeminiMigrationNotice')}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectModel(replacement, GEMINI_PROVIDER_ID)}
        className="font-medium text-[var(--theme-text-link)] underline disabled:opacity-50"
      >
        {t('legacyGeminiMigrationSwitch')} {replacement}
      </button>
    </div>
  );
};
