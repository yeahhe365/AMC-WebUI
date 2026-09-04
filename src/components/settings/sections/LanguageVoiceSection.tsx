import React, { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Languages } from 'lucide-react';
import {
  DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGE_OPTIONS,
} from '@/constants/translationOptions';
import { DEFAULT_THOUGHT_TRANSLATION_MODEL_ID } from '@/constants/modelConfiguration';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { type AppSettings, type ModelOption, type TranslationTargetLanguage } from '@/types';
import { Select } from '@/components/shared/Select';
import { VoiceControl } from '@/components/settings/controls/VoiceControl';
import type { SettingsUpdateHandler } from '@/components/settings/settingsTypes';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';

interface LanguageVoiceSectionProps {
  availableModels: ModelOption[];
  currentSettings: AppSettings;
  onUpdateSetting: SettingsUpdateHandler;
}

const ensureSelectedModelOption = (models: ModelOption[], selectedModelId: string): ModelOption[] =>
  models.some((model) => model.id === selectedModelId)
    ? models
    : [
        ...models,
        {
          id: selectedModelId,
          name: selectedModelId,
        },
      ];

export const LanguageVoiceSection: React.FC<LanguageVoiceSectionProps> = (props) => {
  const { t } = useI18n();
  const { currentSettings, availableModels, onUpdateSetting } = props;
  const inputTranslationModelId = currentSettings.inputTranslationModelId || DEFAULT_THOUGHT_TRANSLATION_MODEL_ID;
  const thoughtTranslationTargetLanguage =
    currentSettings.thoughtTranslationTargetLanguage || DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE;
  const thoughtTranslationModelId = currentSettings.thoughtTranslationModelId || DEFAULT_THOUGHT_TRANSLATION_MODEL_ID;

  const eligibleModels = useMemo(
    () =>
      availableModels.filter((model) => {
        const caps = getCachedModelCapabilities(model.id);
        return (
          !caps.isTtsModel &&
          !caps.isTranscribeModel &&
          !caps.isLiveTranscribe &&
          !caps.isLiveTranslate &&
          !caps.isImageGenerationModel
        );
      }),
    [availableModels],
  );

  const inputTranslationModelOptions = ensureSelectedModelOption(eligibleModels, inputTranslationModelId);
  const thoughtTranslationModelOptions = ensureSelectedModelOption(eligibleModels, thoughtTranslationModelId);

  return (
    <div className="space-y-5">
      <div className={SETTINGS_SECTION_CARD_CLASS} data-settings-item="models-tts-voice">
        <VoiceControl
          transcriptionModelId={currentSettings.transcriptionModelId}
          setTranscriptionModelId={(value) => onUpdateSetting('transcriptionModelId', value)}
          ttsVoice={currentSettings.ttsVoice}
          setTtsVoice={(value) => onUpdateSetting('ttsVoice', value)}
          titleKey="settingsVoiceSectionTitle"
        />
      </div>

      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-4`}>
        <h4 className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
          <Languages size={14} strokeWidth={1.5} />
          {t('settingsTranslationSectionTitle')}
        </h4>
        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsInputTranslationSectionTitle')}</h5>
            <Select
              id="translation-target-language-select"
              label=""
              layout="horizontal"
              labelContent={
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settingsInputTranslationLanguageLabel')}
                </div>
              }
              value={currentSettings.translationTargetLanguage}
              onChange={(event) =>
                onUpdateSetting('translationTargetLanguage', event.target.value as TranslationTargetLanguage)
              }
              className="py-3"
            >
              {TRANSLATION_TARGET_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>
            <Select
              id="input-translation-model-select"
              label=""
              layout="horizontal"
              labelContent={
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settingsInputTranslationModelLabel')}
                </div>
              }
              value={inputTranslationModelId}
              onChange={(event) => onUpdateSetting('inputTranslationModelId', event.target.value)}
              className="py-3"
            >
              {inputTranslationModelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 border-t border-[var(--theme-border-secondary)] pt-4">
            <h5 className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsThoughtTranslationSectionTitle')}</h5>
            <Select
              id="thought-translation-target-language-select"
              label=""
              layout="horizontal"
              labelContent={
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settingsThoughtTranslationTargetLanguageLabel')}
                </div>
              }
              value={thoughtTranslationTargetLanguage}
              onChange={(event) =>
                onUpdateSetting('thoughtTranslationTargetLanguage', event.target.value as TranslationTargetLanguage)
              }
              className="py-3"
            >
              {TRANSLATION_TARGET_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>
            <Select
              id="thought-translation-model-select"
              label=""
              layout="horizontal"
              labelContent={
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]">
                  {t('settingsThoughtTranslationModelLabel')}
                </div>
              }
              value={thoughtTranslationModelId}
              onChange={(event) => onUpdateSetting('thoughtTranslationModelId', event.target.value)}
              className="py-3"
            >
              {thoughtTranslationModelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
