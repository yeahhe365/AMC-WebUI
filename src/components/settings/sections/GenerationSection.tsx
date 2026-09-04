import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Image as ImageIcon, Info, SquarePen, X } from 'lucide-react';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { SMALL_ICON_BUTTON_CLASS } from '@/constants/buttonClasses';
import {
  SETTINGS_RANGE_SLIDER_CLASS,
  SETTINGS_SECTION_CARD_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_VALUE_BADGE_CLASS,
} from '@/constants/designTokens';
import { type AppSettings, MediaResolution } from '@/types';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { useI18n } from '@/contexts/I18nContext';
import { Tooltip } from '@/components/shared/Tooltip';
import { Select } from '@/components/shared/Select';
import { ToggleItem } from '@/components/shared/ToggleItem';
import { TextEditorModal } from '@/components/modals/TextEditorModal';

interface GenerationSectionProps {
  isThirdPartyMode?: boolean;
  modelId: string;
  currentSettings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const GenerationSection: React.FC<GenerationSectionProps> = ({
  isThirdPartyMode = false,
  modelId,
  currentSettings,
  onUpdateSetting,
}) => {
  const { t } = useI18n();
  const {
    systemInstruction,
    temperature,
    topP,
    mediaResolution,
    maxOutputTokens,
    stopSequences,
    presencePenalty,
    frequencyPenalty,
    seed,
  } = currentSettings;
  const topK = currentSettings.topK ?? 64;
  const isRawModeEnabled = currentSettings.isRawModeEnabled ?? false;
  const hideThinkingInContext = currentSettings.hideThinkingInContext ?? false;
  const alwaysKeepThinkingInContext = currentSettings.alwaysKeepThinkingInContext ?? false;
  const isAdvancedModeEnabled = useSettingsUiStore((state) => state.isAdvancedModeEnabled);
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(systemInstruction);
  const [localStopSequences, setLocalStopSequences] = useState(() =>
    Array.isArray(stopSequences) ? stopSequences.join(', ') : '',
  );
  const skipNextPromptBlurCommitRef = useRef(false);

  useEffect(() => {
    setLocalPrompt(systemInstruction);
  }, [systemInstruction]);

  useEffect(() => {
    setLocalStopSequences(Array.isArray(stopSequences) ? stopSequences.join(', ') : '');
  }, [stopSequences]);

  const commitPromptIfNeeded = useCallback(() => {
    if (localPrompt !== systemInstruction) {
      onUpdateSetting('systemInstruction', localPrompt);
    }
  }, [localPrompt, systemInstruction, onUpdateSetting]);

  const handleOpenExpand = () => {
    setIsSystemPromptExpanded(true);
  };

  const handleCloseExpand = () => {
    setIsSystemPromptExpanded(false);
  };

  const handleSaveExpanded = (newPrompt: string) => {
    setLocalPrompt(newPrompt);
    onUpdateSetting('systemInstruction', newPrompt);
  };

  const handleClearPrompt = () => {
    setLocalPrompt('');
    if (localPrompt !== '' || systemInstruction !== '') {
      onUpdateSetting('systemInstruction', '');
    }
  };

  const capabilities = getCachedModelCapabilities(modelId);
  const isNativeAudio = capabilities.isNativeAudioModel;
  const isSystemPromptSet = localPrompt.trim() !== '';
  const inputBaseClasses =
    'w-full p-2.5 border rounded-lg transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm';

  if (capabilities.isTranscribeModel || capabilities.isLiveTranscribe) {
    return (
      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-3`} data-settings-item="models-transcribe-info">
        <div className="flex items-start gap-3 text-sm text-[var(--theme-text-secondary)]">
          <Info size={18} className="text-[var(--theme-text-accent)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">{t('settingsTranscribeModelInfo')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-3`} data-settings-item="models-system-prompt">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="system-prompt-input"
            className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--theme-text-primary)]"
          >
            <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsSystemPrompt')}</span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium normal-case tracking-normal border transition-colors ${
                isSystemPromptSet
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border-[var(--theme-border-secondary)]/50'
              }`}
            >
              {isSystemPromptSet ? t('settingsSystemPromptEnabled') : t('settingsSystemPromptUnset')}
            </span>
          </label>
          <div className="flex shrink-0 items-center gap-1">
            {isSystemPromptSet && (
              <button
                type="button"
                onClick={handleClearPrompt}
                className={`${SMALL_ICON_BUTTON_CLASS} flex h-8 w-8 items-center justify-center hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10`}
                title={t('settingsClearSystemPrompt')}
                aria-label={t('settingsClearSystemPrompt')}
              >
                <Eraser size={14} />
              </button>
            )}
            <button
              type="button"
              onPointerDown={() => {
                skipNextPromptBlurCommitRef.current = true;
              }}
              onClick={handleOpenExpand}
              className={`${SMALL_ICON_BUTTON_CLASS} flex h-8 w-8 items-center justify-center hover:text-[var(--theme-text-link)]`}
              title={t('settingsExpandSystemPromptEditor')}
              aria-label={t('settingsExpandSystemPromptEditor')}
            >
              <SquarePen size={14} />
            </button>
          </div>
        </div>
        <textarea
          id="system-prompt-input"
          value={localPrompt}
          onChange={(event) => setLocalPrompt(event.target.value)}
          onBlur={() => {
            if (skipNextPromptBlurCommitRef.current) {
              skipNextPromptBlurCommitRef.current = false;
              return;
            }
            commitPromptIfNeeded();
          }}
          rows={3}
          className={`${inputBaseClasses} ${SETTINGS_INPUT_CLASS} resize-none font-mono text-xs sm:text-sm leading-relaxed min-h-[112px] custom-scrollbar bg-[var(--theme-bg-input)]/50`}
          placeholder={t('chatBehaviorSystemPromptPlaceholder')}
          aria-label={t('settingsSystemPromptAria')}
        />
      </div>

      <TextEditorModal
        isOpen={isSystemPromptExpanded}
        onClose={handleCloseExpand}
        title={t('settingsSystemPrompt')}
        value={localPrompt}
        onChange={handleSaveExpanded}
        placeholder={t('chatBehaviorSystemPromptPlaceholder')}
        confirmLabel={t('settingsSaveAndClose')}
      />

      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-2.5`} data-settings-item="models-temperature">
        <div className="flex items-center justify-between">
          <label htmlFor="temperature-slider" className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
            {t('settingsTemperature')}
            <Tooltip text={t('chatBehaviorTempTooltip')}>
              <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
            </Tooltip>
          </label>
          <span className={SETTINGS_VALUE_BADGE_CLASS}>{Number(temperature).toFixed(2)}</span>
        </div>
        <input
          id="temperature-slider"
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={temperature}
          onChange={(event) => onUpdateSetting('temperature', parseFloat(event.target.value))}
          className={SETTINGS_RANGE_SLIDER_CLASS}
        />
        <div className="flex justify-between text-[11px] font-medium text-[var(--theme-text-tertiary)] pt-0.5 select-none">
          <span>{t('settingsTemperatureStrict')}</span>
          <span>{t('settingsTemperatureBalanced')}</span>
          <span>{t('settingsTemperatureCreative')}</span>
        </div>
      </div>

      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-3`} data-settings-item="models-top-p">
        <div className="flex items-center justify-between">
          <label htmlFor="top-p-slider" className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
            {t('settingsTopP')}
            <Tooltip text={t('chatBehaviorTopPTooltip')}>
              <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
            </Tooltip>
          </label>
          <span className={SETTINGS_VALUE_BADGE_CLASS}>{Number(topP).toFixed(2)}</span>
        </div>
        <input
          id="top-p-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={topP}
          onChange={(event) => onUpdateSetting('topP', parseFloat(event.target.value))}
          className={SETTINGS_RANGE_SLIDER_CLASS}
        />
      </div>

      {isAdvancedModeEnabled && (
        <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-5`} data-settings-item="models-advanced">
          <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsAdvancedParamsTitle')}</span>

          <div data-settings-item="models-top-k">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="top-k-slider" className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
                {t('settingsTopK')}
                <Tooltip text={t('settingsTopKTooltip')}>
                  <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                </Tooltip>
              </label>
              <span className={SETTINGS_VALUE_BADGE_CLASS}>{topK}</span>
            </div>
            <input
              id="top-k-slider"
              type="range"
              min="0"
              max="128"
              step="1"
              value={topK}
              onChange={(event) => onUpdateSetting('topK', parseInt(event.target.value, 10))}
              className={SETTINGS_RANGE_SLIDER_CLASS}
            />
          </div>

          <div data-settings-item="models-max-output-tokens">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="max-output-tokens-input"
                className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}
              >
                {t('settingsMaxOutputTokens')}
                <Tooltip text={t('settingsMaxOutputTokensTooltip')}>
                  <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                </Tooltip>
              </label>
              <span className={SETTINGS_VALUE_BADGE_CLASS}>
                {maxOutputTokens && maxOutputTokens > 0 ? maxOutputTokens : t('settingsDefaultUnset')}
              </span>
            </div>
            <input
              id="max-output-tokens-input"
              type="number"
              min="1"
              max="1048576"
              step="256"
              value={maxOutputTokens ?? ''}
              onChange={(event) => {
                const val = event.target.value.trim();
                const num = val === '' ? undefined : parseInt(val, 10);
                onUpdateSetting('maxOutputTokens', num && num > 0 ? num : undefined);
              }}
              placeholder={t('settingsMaxOutputTokensPlaceholder')}
              className={`w-full p-2.5 rounded-lg border text-sm font-mono ${SETTINGS_INPUT_CLASS}`}
            />
          </div>

          <div data-settings-item="models-stop-sequences">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="stop-sequences-input"
                className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}
              >
                {t('settingsStopSequences')}
                <Tooltip text={t('settingsStopSequencesTooltip')}>
                  <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                </Tooltip>
              </label>
            </div>
            <input
              id="stop-sequences-input"
              type="text"
              value={localStopSequences}
              onChange={(event) => setLocalStopSequences(event.target.value)}
              onBlur={() => {
                const parsed = localStopSequences
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                onUpdateSetting('stopSequences', parsed.length > 0 ? parsed : undefined);
              }}
              placeholder={t('settingsStopSequencesPlaceholder')}
              className={`w-full p-2.5 rounded-lg border text-sm font-mono ${SETTINGS_INPUT_CLASS}`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-1 border-t border-[var(--theme-border-secondary)]/40">
            <div data-settings-item="models-presence-penalty" className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="presence-penalty-slider"
                  className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}
                >
                  {t('settingsPresencePenalty')}
                  <Tooltip text={t('settingsPresencePenaltyTooltip')}>
                    <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                  </Tooltip>
                </label>
                <span className={SETTINGS_VALUE_BADGE_CLASS}>
                  {presencePenalty !== undefined ? Number(presencePenalty).toFixed(2) : '0.00'}
                </span>
              </div>
              <input
                id="presence-penalty-slider"
                type="range"
                min="-2"
                max="2"
                step="0.1"
                value={presencePenalty ?? 0}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  onUpdateSetting('presencePenalty', val === 0 ? undefined : val);
                }}
                className={SETTINGS_RANGE_SLIDER_CLASS}
              />
            </div>

            <div data-settings-item="models-frequency-penalty" className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="frequency-penalty-slider"
                  className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}
                >
                  {t('settingsFrequencyPenalty')}
                  <Tooltip text={t('settingsFrequencyPenaltyTooltip')}>
                    <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                  </Tooltip>
                </label>
                <span className={SETTINGS_VALUE_BADGE_CLASS}>
                  {frequencyPenalty !== undefined ? Number(frequencyPenalty).toFixed(2) : '0.00'}
                </span>
              </div>
              <input
                id="frequency-penalty-slider"
                type="range"
                min="-2"
                max="2"
                step="0.1"
                value={frequencyPenalty ?? 0}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  onUpdateSetting('frequencyPenalty', val === 0 ? undefined : val);
                }}
                className={SETTINGS_RANGE_SLIDER_CLASS}
              />
            </div>
          </div>

          <div data-settings-item="models-seed" className="pt-1 border-t border-[var(--theme-border-secondary)]/40">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="seed-input" className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
                {t('settingsSeed')}
                <Tooltip text={t('settingsSeedTooltip')}>
                  <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
                </Tooltip>
              </label>
              <span className={SETTINGS_VALUE_BADGE_CLASS}>
                {seed !== undefined ? seed : t('settingsDefaultUnset')}
              </span>
            </div>
            <input
              id="seed-input"
              type="number"
              step="1"
              value={seed ?? ''}
              onChange={(event) => {
                const val = event.target.value.trim();
                const num = val === '' ? undefined : parseInt(val, 10);
                onUpdateSetting('seed', num !== undefined && Number.isFinite(num) ? num : undefined);
              }}
              placeholder={t('settingsSeedPlaceholder')}
              className={`w-full p-2.5 rounded-lg border text-sm font-mono ${SETTINGS_INPUT_CLASS}`}
            />
          </div>

          {!isThirdPartyMode &&
            mediaResolution &&
            !capabilities.isTtsModel &&
            !capabilities.isLiveTranslate &&
            !capabilities.isLiveTranscribe &&
            !capabilities.isTranscribeModel && (
              <div
                data-settings-item="models-media-resolution"
                className="pt-1 border-t border-[var(--theme-border-secondary)]/40"
              >
                <Select
                  id="media-resolution-select"
                  label=""
                  layout="horizontal"
                  labelContent={
                    <span className="flex items-center text-sm font-medium text-[var(--theme-text-primary)]">
                      <ImageIcon size={14} className="mr-2 text-[var(--theme-text-primary)]" />
                      {t('settingsMediaResolution')}
                      <Tooltip
                        text={
                          isNativeAudio ? t('settingsMediaResolutionLiveTooltip') : t('settingsMediaResolutionTooltip')
                        }
                      >
                        <Info
                          size={14}
                          className="ml-2 text-[var(--theme-text-secondary)] cursor-help"
                          strokeWidth={1.5}
                        />
                      </Tooltip>
                    </span>
                  }
                  value={mediaResolution}
                  onChange={(event) => onUpdateSetting('mediaResolution', event.target.value as MediaResolution)}
                >
                  <option value={MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED}>
                    {t('mediaResolutionUnspecified')}
                  </option>
                  <option value={MediaResolution.MEDIA_RESOLUTION_LOW}>{t('mediaResolutionLow')}</option>
                  {!isNativeAudio && (
                    <option value={MediaResolution.MEDIA_RESOLUTION_MEDIUM}>{t('mediaResolutionMedium')}</option>
                  )}
                  {!isNativeAudio && (
                    <option value={MediaResolution.MEDIA_RESOLUTION_HIGH}>{t('mediaResolutionHigh')}</option>
                  )}
                </Select>
              </div>
            )}

          {!isThirdPartyMode && capabilities.supportsRawReasoningPrefill && (
            <div className="pt-1 border-t border-[var(--theme-border-secondary)]/40 space-y-1">
              <div data-settings-item="models-raw-mode">
                <ToggleItem
                  label={t('settingsRawModeLabel')}
                  checked={isRawModeEnabled}
                  onChange={(value) => onUpdateSetting('isRawModeEnabled', value)}
                  tooltip={t('settingsRawModeTooltip')}
                />
              </div>
            </div>
          )}

          {!isThirdPartyMode &&
            !capabilities.isTtsModel &&
            !capabilities.isTranscribeModel &&
            !capabilities.isLiveTranscribe &&
            !capabilities.isLiveTranslate &&
            !capabilities.isImageGenerationModel && (
              <div className="pt-1 border-t border-[var(--theme-border-secondary)]/40 space-y-1">
                <div data-settings-item="models-hide-thinking">
                  <ToggleItem
                    label={t('settingsHideThinkingInContextLabel')}
                    checked={hideThinkingInContext}
                    onChange={(value) => {
                      onUpdateSetting('hideThinkingInContext', value);
                      if (value) onUpdateSetting('alwaysKeepThinkingInContext', false);
                    }}
                    tooltip={t('settingsHideThinkingInContextTooltip')}
                  />
                </div>
                <div data-settings-item="models-always-keep-thinking">
                  <ToggleItem
                    label={t('settingsAlwaysKeepThinkingInContextLabel')}
                    checked={alwaysKeepThinkingInContext}
                    onChange={(value) => {
                      onUpdateSetting('alwaysKeepThinkingInContext', value);
                      if (value) onUpdateSetting('hideThinkingInContext', false);
                    }}
                    tooltip={t('settingsAlwaysKeepThinkingInContextTooltip')}
                  />
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};
