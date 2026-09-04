import React, { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { ToggleItem } from '@/components/shared/ToggleItem';
import { Sparkles, SlidersHorizontal, X } from 'lucide-react';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';

interface TranscribeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemInstruction: string;
  customVocabulary: string;
  wordTimestamps: boolean;
  speakerLabels: boolean;
  smartMode: boolean;
  onSave: (settings: {
    systemInstruction: string;
    customVocabulary: string;
    wordTimestamps: boolean;
    speakerLabels: boolean;
    smartMode: boolean;
  }) => void;
}

export const TranscribeSettingsModal: React.FC<TranscribeSettingsModalProps> = ({
  isOpen,
  onClose,
  systemInstruction,
  customVocabulary,
  wordTimestamps,
  speakerLabels,
  smartMode,
  onSave,
}) => {
  const { t } = useI18n();
  const [draftInstruction, setDraftInstruction] = useState(systemInstruction);
  const [draftVocabulary, setDraftVocabulary] = useState(customVocabulary);
  const [draftWordTimestamps, setDraftWordTimestamps] = useState(wordTimestamps);
  const [draftSpeakerLabels, setDraftSpeakerLabels] = useState(speakerLabels);
  const [draftSmartMode, setDraftSmartMode] = useState(smartMode);

  useEffect(() => {
    if (isOpen) {
      setDraftInstruction(systemInstruction);
      setDraftVocabulary(customVocabulary);
      setDraftWordTimestamps(wordTimestamps);
      setDraftSpeakerLabels(speakerLabels);
      setDraftSmartMode(smartMode);
    }
  }, [isOpen, systemInstruction, customVocabulary, wordTimestamps, speakerLabels, smartMode]);

  const handleSave = () => {
    onSave({
      systemInstruction: draftInstruction.trim(),
      customVocabulary: draftVocabulary.trim(),
      wordTimestamps: draftWordTimestamps,
      speakerLabels: draftSpeakerLabels,
      smartMode: draftSmartMode,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="bg-[var(--theme-bg-primary)] rounded-xl shadow-2xl w-full max-w-lg border border-[var(--theme-border-primary)] overflow-hidden"
      noPadding
    >
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[var(--theme-border-secondary)]/50 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[var(--theme-text-accent)]" />
            <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('transcribeModalTitle')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1 rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-secondary)]/30 p-2.5">
            <ToggleItem
              label={t('transcribeWordTimestamps')}
              checked={draftWordTimestamps}
              onChange={setDraftWordTimestamps}
              tooltip={t('transcribeWordTimestampsHelp')}
              small
            />
            <ToggleItem
              label={t('transcribeSpeakerLabels')}
              checked={draftSpeakerLabels}
              onChange={setDraftSpeakerLabels}
              tooltip={t('transcribeSpeakerLabelsHelp')}
              small
            />
            <ToggleItem
              label={t('transcribeSmartMode')}
              checked={draftSmartMode}
              onChange={setDraftSmartMode}
              tooltip={t('transcribeSmartModeHelp')}
              small
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="transcribe-instruction" className="text-xs font-semibold text-[var(--theme-text-primary)]">
              {t('settingsSystemPrompt')}
            </label>
            <p className="text-xs text-[var(--theme-text-secondary)]">{t('transcribeSystemInstructionHelp')}</p>
            <textarea
              id="transcribe-instruction"
              value={draftInstruction}
              onChange={(e) => setDraftInstruction(e.target.value)}
              rows={3}
              className={`w-full p-2.5 border rounded-lg text-xs leading-relaxed min-h-[72px] resize-none ${SETTINGS_INPUT_CLASS} bg-[var(--theme-bg-input)]`}
              placeholder={t('chatBehaviorSystemPromptPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-[var(--theme-text-accent)]" />
              <label htmlFor="transcribe-vocab" className="text-xs font-semibold text-[var(--theme-text-primary)]">
                {t('transcribeCustomVocabulary')}
              </label>
            </div>
            <p className="text-xs text-[var(--theme-text-secondary)]">{t('transcribeCustomVocabularyHelp')}</p>
            <textarea
              id="transcribe-vocab"
              value={draftVocabulary}
              onChange={(e) => setDraftVocabulary(e.target.value)}
              rows={2}
              className={`w-full p-2.5 border rounded-lg text-xs leading-relaxed min-h-[64px] resize-none ${SETTINGS_INPUT_CLASS} bg-[var(--theme-bg-input)]`}
              placeholder={t('transcribeCustomVocabularyPlaceholder')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--theme-border-secondary)]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] rounded-lg shadow-sm transition-colors"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
