import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { ApiKeyInput } from '@/components/settings/sections/api-config/ApiKeyInput';
import { SETTINGS_SECONDARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';

interface ApiKeyHandoffCardProps {
  connectionId: string;
  connectionName: string;
}

/**
 * The only place an API key may be entered. The value goes straight from this
 * input into settings; it is never part of a model request.
 */
export const ApiKeyHandoffCard: React.FC<ApiKeyHandoffCardProps> = ({ connectionId, connectionName }) => {
  const { t } = useI18n();
  const [value, setValue] = useState<string | null>(null);
  const submitApiKey = useSettingsAssistantStore((state) => state.submitApiKey);
  const cancelApiKey = useSettingsAssistantStore((state) => state.cancelApiKey);
  const trimmed = value?.trim() ?? '';

  return (
    <div
      data-testid={`assistant-key-card-${connectionId}`}
      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-3 space-y-2"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-text-primary)]">
        <KeyRound size={14} />
        <span>{t('assistantApiKeyTitle', { name: connectionName })}</span>
      </div>
      <ApiKeyInput
        apiKey={value}
        setApiKey={setValue}
        inputId={`assistant-handoff-${connectionId}`}
        helpText={t('assistantApiKeyHelp')}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => {
            submitApiKey(trimmed);
            setValue(null);
          }}
          className="px-2.5 py-1 rounded-md text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] disabled:opacity-40"
        >
          {t('assistantApiKeySubmit')}
        </button>
        <button type="button" onClick={() => cancelApiKey()} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
          {t('assistantApiKeyCancel')}
        </button>
      </div>
    </div>
  );
};
