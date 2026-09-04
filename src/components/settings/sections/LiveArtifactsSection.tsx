import React, { useEffect, useState } from 'react';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronDown, RotateCcw, Wand2 } from 'lucide-react';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { loadLiveArtifactsSystemPrompt } from '@/features/prompts/promptRegistry';
import {
  getLiveArtifactsSystemPromptValue,
  updateLiveArtifactsSystemPromptForMode,
} from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import type { AppSettings } from '@/types';
import type { SettingsUpdateHandler } from '@/components/settings/settingsTypes';

interface LiveArtifactsSectionProps {
  currentSettings: AppSettings;
  currentThemeId: string;
  onUpdateSetting: SettingsUpdateHandler;
}

export const LiveArtifactsSection: React.FC<LiveArtifactsSectionProps> = ({ currentSettings, onUpdateSetting }) => {
  const { language, t } = useI18n();
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [builtInPromptState, setBuiltInPromptState] = useState({ key: '', value: '' });
  // Local editing draft. `null` means "not mid-edit": show the persisted custom
  // prompt, or the built-in prompt when there is none. Any non-null value —
  // including an empty string — is shown verbatim so the textarea can be cleared
  // and rewritten from scratch instead of snapping back to the built-in prompt
  // the moment the user deletes the last character.
  const [draftPrompt, setDraftPrompt] = useState<string | null>(null);
  const liveArtifactsPromptMode = currentSettings.liveArtifactsPromptMode ?? 'inline';
  const builtInPromptKey = `${language}:${liveArtifactsPromptMode}`;
  const customLiveArtifactsSystemPrompt = getLiveArtifactsSystemPromptValue(currentSettings, liveArtifactsPromptMode);
  const hasCustomLiveArtifactsSystemPrompt = !!customLiveArtifactsSystemPrompt.trim();
  const builtInPrompt = builtInPromptState.key === builtInPromptKey ? builtInPromptState.value : '';
  const displayedLiveArtifactsSystemPrompt =
    draftPrompt !== null
      ? draftPrompt
      : hasCustomLiveArtifactsSystemPrompt
        ? customLiveArtifactsSystemPrompt
        : builtInPrompt;

  useEffect(() => {
    let isStale = false;

    loadLiveArtifactsSystemPrompt(language, liveArtifactsPromptMode)
      .then((prompt) => {
        if (!isStale) {
          setBuiltInPromptState({ key: builtInPromptKey, value: prompt });
        }
      })
      .catch(() => {
        if (!isStale) {
          setBuiltInPromptState({ key: builtInPromptKey, value: '' });
        }
      });

    return () => {
      isStale = true;
    };
  }, [builtInPromptKey, language, liveArtifactsPromptMode]);

  const updatePromptForCurrentMode = (prompt: string) => {
    onUpdateSetting('liveArtifactsSystemPrompt', '');
    onUpdateSetting(
      'liveArtifactsSystemPrompts',
      updateLiveArtifactsSystemPromptForMode(currentSettings, liveArtifactsPromptMode, prompt),
    );
  };

  // Persist the typed value (including an explicit empty string) and keep it in
  // the draft so the textarea does not re-collapse to the built-in prompt.
  const handlePromptChange = (value: string) => {
    setDraftPrompt(value);
    updatePromptForCurrentMode(value);
  };

  const handlePromptReset = () => {
    setDraftPrompt(null);
    updatePromptForCurrentMode('');
  };

  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-2`}>
      <h4 className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
        <Wand2 size={14} strokeWidth={1.5} />
        {t('settingsLiveArtifactsSectionTitle')}
      </h4>
      <div className="space-y-1">
        <div className="py-1.5">
          <button
            id="live-artifacts-prompt-toggle"
            type="button"
            aria-expanded={isPromptExpanded}
            aria-controls="live-artifacts-prompt-panel"
            onClick={() => setIsPromptExpanded((prev) => !prev)}
            className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-0 py-2 text-left text-sm font-medium text-[var(--theme-text-primary)] ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
          >
            <span>{t('settingsLiveArtifactsSystemPromptLabel')}</span>
            <ChevronDown
              size={16}
              className={`flex-shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200 ${
                isPromptExpanded ? 'rotate-180' : ''
              }`}
              strokeWidth={1.75}
            />
          </button>

          {isPromptExpanded && (
            <div id="live-artifacts-prompt-panel" className="mt-2">
              <textarea
                id="live-artifacts-prompt-input"
                value={displayedLiveArtifactsSystemPrompt}
                onChange={(event) => handlePromptChange(event.target.value)}
                rows={10}
                className={`w-full min-h-[144px] resize-y rounded-lg border p-2.5 text-sm transition-all duration-200 focus:ring-2 focus:ring-offset-0 custom-scrollbar ${SETTINGS_INPUT_CLASS}`}
                placeholder={t('settingsLiveArtifactsSystemPromptPlaceholder')}
                aria-label={t('settingsLiveArtifactsSystemPromptLabel')}
              />
              <div className="mt-2 flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs leading-relaxed text-[var(--theme-text-secondary)]">
                  {t('settingsLiveArtifactsSystemPromptHelp')}
                </p>
                <button
                  id="live-artifacts-prompt-reset"
                  type="button"
                  aria-label={t('settingsLiveArtifactsSystemPromptReset')}
                  title={t('settingsLiveArtifactsSystemPromptReset')}
                  disabled={!hasCustomLiveArtifactsSystemPrompt && draftPrompt === null}
                  onClick={handlePromptReset}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] text-[var(--theme-text-secondary)] transition-colors hover:border-[var(--theme-border-focus)] hover:text-[var(--theme-text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RotateCcw size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
